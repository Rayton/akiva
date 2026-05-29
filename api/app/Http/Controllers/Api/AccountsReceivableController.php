<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AccountsReceivableController extends Controller
{
    public function dashboard(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 8), 4, 20);
        $today = Carbon::today()->startOfDay();

        try {
            if (!Schema::hasTable('debtortrans')) {
                return response()->json(['success' => true, 'data' => $this->emptyDashboard($today)]);
            }

            $dateColumn = $this->firstExistingColumn('debtortrans', ['trandate', 'inputdate']);
            if ($dateColumn === null) {
                return response()->json(['success' => true, 'data' => $this->emptyDashboard($today)]);
            }

            $rows = $this->openReceivableRows($dateColumn)->get();
            $customers = $this->customerExposureRows($rows, $today)
                ->sortByDesc(fn (array $row) => $row['overdueBalance'] > 0 ? $row['overdueBalance'] : $row['balance'])
                ->values();
            $aging = $this->agingBuckets($rows, $today);
            $summary = $this->summary($rows, $customers, $aging, $today);
            $priorityInvoices = $this->priorityInvoices($rows, $today, 12);

            return response()->json([
                'success' => true,
                'data' => [
                    'currency' => $this->companyCurrency(),
                    'asOf' => now()->toIso8601String(),
                    'summary' => $summary,
                    'aging' => array_values($aging),
                    'topCustomers' => $customers->take($limit)->values(),
                    'priorityInvoices' => $priorityInvoices,
                    'actionQueue' => $this->actionQueue($summary, $customers),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Accounts receivable dashboard data could not be loaded.',
            ], 500);
        }
    }

    private function openReceivableRows(string $dateColumn)
    {
        $query = DB::table('debtortrans as dt');
        $usesPaymentTerms = false;

        if (Schema::hasTable('debtorsmaster') && Schema::hasColumn('debtorsmaster', 'debtorno')) {
            $query->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'dt.debtorno');

            if (
                Schema::hasColumn('debtorsmaster', 'paymentterms')
                && Schema::hasTable('paymentterms')
                && Schema::hasColumn('paymentterms', 'termsindicator')
            ) {
                $query->leftJoin('paymentterms as pt', 'pt.termsindicator', '=', 'dm.paymentterms');
                $usesPaymentTerms = true;
            }
        }

        $contactSubquery = $this->customerContactSubquery();
        if ($contactSubquery !== null) {
            $query->leftJoinSub($contactSubquery, 'contact', 'contact.debtorno', '=', 'dt.debtorno');
        }

        $amountExpression = $this->openAmountExpression('dt');
        $transactionDate = $this->validDateTextExpression('dt.' . $dateColumn);
        $dueDateExpression = $this->receivableDueDateExpression($transactionDate, $usesPaymentTerms);

        return $query
            ->whereRaw($transactionDate . ' IS NOT NULL')
            ->whereRaw($amountExpression . ' > 0.004')
            ->select('dt.debtorno')
            ->selectRaw($this->customerNameExpression() . ' as customer_name')
            ->selectRaw($this->customerCreditLimitExpression() . ' as credit_limit')
            ->selectRaw($this->contactExpression('email', $contactSubquery !== null) . ' as email')
            ->selectRaw($this->contactExpression('phone', $contactSubquery !== null) . ' as phone')
            ->selectRaw($this->optionalColumnExpression('debtortrans', 'transno', 'dt') . ' as trans_no')
            ->selectRaw($this->optionalColumnExpression('debtortrans', 'reference', 'dt') . ' as reference')
            ->selectRaw($this->optionalColumnExpression('debtortrans', 'type', 'dt') . ' as transaction_type')
            ->selectRaw($transactionDate . ' as transaction_date')
            ->selectRaw($dueDateExpression . ' as due_date')
            ->selectRaw($amountExpression . ' as amount_due');
    }

    private function summary(Collection $rows, Collection $customers, array $aging, Carbon $today): array
    {
        $totalReceivables = $rows->sum(fn ($row) => (float) $row->amount_due);
        $overdueRows = $rows->filter(fn ($row) => $this->parseDate($row->due_date, $today)->lessThan($today));
        $dueSoonRows = $rows->filter(function ($row) use ($today) {
            $dueDate = $this->parseDate($row->due_date, $today);

            return $dueDate->greaterThanOrEqualTo($today) && $dueDate->lessThanOrEqualTo($today->copy()->addDays(14));
        });
        $overdueDays = $overdueRows->map(fn ($row) => $this->parseDate($row->due_date, $today)->diffInDays($today));
        $overdueReceivables = $overdueRows->sum(fn ($row) => (float) $row->amount_due);

        return [
            'totalReceivables' => round((float) $totalReceivables, 2),
            'openInvoices' => $rows->count(),
            'customersWithBalance' => $rows->pluck('debtorno')->unique()->count(),
            'overdueReceivables' => round((float) $overdueReceivables, 2),
            'overdueInvoices' => $overdueRows->count(),
            'dueSoonReceivables' => round((float) $dueSoonRows->sum(fn ($row) => (float) $row->amount_due), 2),
            'dueSoonInvoices' => $dueSoonRows->count(),
            'currentReceivables' => round((float) ($aging['current']['amount'] ?? 0), 2),
            'highestCustomerBalance' => round((float) ($customers->max('balance') ?? 0), 2),
            'averageDaysOverdue' => $overdueDays->count() > 0 ? round((float) $overdueDays->avg(), 1) : 0.0,
            'oldestDaysOverdue' => $overdueDays->count() > 0 ? (int) $overdueDays->max() : 0,
        ];
    }

    private function agingBuckets(Collection $rows, Carbon $today): array
    {
        $buckets = [
            'current' => ['key' => 'current', 'label' => 'Current', 'amount' => 0.0, 'invoiceCount' => 0],
            'days_1_30' => ['key' => 'days_1_30', 'label' => '1-30 days', 'amount' => 0.0, 'invoiceCount' => 0],
            'days_31_60' => ['key' => 'days_31_60', 'label' => '31-60 days', 'amount' => 0.0, 'invoiceCount' => 0],
            'days_61_90' => ['key' => 'days_61_90', 'label' => '61-90 days', 'amount' => 0.0, 'invoiceCount' => 0],
            'days_91_plus' => ['key' => 'days_91_plus', 'label' => '91+ days', 'amount' => 0.0, 'invoiceCount' => 0],
        ];

        foreach ($rows as $row) {
            $dueDate = $this->parseDate($row->due_date, $today);
            $daysPastDue = $dueDate->lessThan($today) ? $dueDate->diffInDays($today) : 0;
            $key = 'current';

            if ($daysPastDue > 90) {
                $key = 'days_91_plus';
            } elseif ($daysPastDue > 60) {
                $key = 'days_61_90';
            } elseif ($daysPastDue > 30) {
                $key = 'days_31_60';
            } elseif ($daysPastDue > 0) {
                $key = 'days_1_30';
            }

            $buckets[$key]['amount'] += (float) $row->amount_due;
            $buckets[$key]['invoiceCount']++;
        }

        return array_map(function (array $bucket) {
            $bucket['amount'] = round((float) $bucket['amount'], 2);

            return $bucket;
        }, $buckets);
    }

    private function customerExposureRows(Collection $rows, Carbon $today): Collection
    {
        return $rows
            ->groupBy(fn ($row) => (string) $row->debtorno)
            ->map(function (Collection $customerRows) use ($today) {
                $first = $customerRows->first();
                $balance = $customerRows->sum(fn ($row) => (float) $row->amount_due);
                $overdueRows = $customerRows->filter(fn ($row) => $this->parseDate($row->due_date, $today)->lessThan($today));
                $overdueBalance = $overdueRows->sum(fn ($row) => (float) $row->amount_due);
                $oldestDueDate = $overdueRows
                    ->map(fn ($row) => $this->parseDate($row->due_date, $today))
                    ->sort()
                    ->first();
                $creditLimit = (float) ($first->credit_limit ?? 0);
                $utilizationPct = $creditLimit > 0 ? ($balance / $creditLimit) * 100 : 0;

                return [
                    'debtorNo' => (string) $first->debtorno,
                    'customerName' => (string) $first->customer_name,
                    'email' => (string) ($first->email ?? ''),
                    'phone' => (string) ($first->phone ?? ''),
                    'balance' => round((float) $balance, 2),
                    'overdueBalance' => round((float) $overdueBalance, 2),
                    'invoiceCount' => $customerRows->count(),
                    'overdueInvoices' => $overdueRows->count(),
                    'creditLimit' => round($creditLimit, 2),
                    'utilizationPct' => round($utilizationPct, 1),
                    'oldestDueDate' => $oldestDueDate ? $oldestDueDate->toDateString() : '',
                    'daysOverdue' => $oldestDueDate ? (int) $oldestDueDate->diffInDays($today) : 0,
                    'status' => $overdueBalance > 0 ? 'Overdue' : ($utilizationPct >= 80 ? 'Watch' : 'Current'),
                ];
            })
            ->values();
    }

    private function priorityInvoices(Collection $rows, Carbon $today, int $limit): array
    {
        return $rows
            ->map(function ($row) use ($today) {
                $dueDate = $this->parseDate($row->due_date, $today);

                return [
                    'transNo' => (string) ($row->trans_no ?? ''),
                    'transactionType' => (string) ($row->transaction_type ?? ''),
                    'reference' => (string) ($row->reference ?? ''),
                    'debtorNo' => (string) $row->debtorno,
                    'customerName' => (string) $row->customer_name,
                    'transactionDate' => (string) ($row->transaction_date ?? ''),
                    'dueDate' => $dueDate->toDateString(),
                    'amountDue' => round((float) $row->amount_due, 2),
                    'daysOverdue' => $dueDate->lessThan($today) ? (int) $dueDate->diffInDays($today) : 0,
                    'status' => $dueDate->lessThan($today) ? 'Overdue' : ($dueDate->lessThanOrEqualTo($today->copy()->addDays(14)) ? 'Due soon' : 'Current'),
                ];
            })
            ->sortBy([
                ['daysOverdue', 'desc'],
                ['amountDue', 'desc'],
            ])
            ->take($limit)
            ->values()
            ->all();
    }

    private function actionQueue(array $summary, Collection $customers): array
    {
        $currency = $this->companyCurrency();
        $actions = [];

        if ((int) $summary['overdueInvoices'] > 0) {
            $actions[] = $this->action(
                'overdue-collection',
                1,
                'Collect overdue customer invoices',
                (int) $summary['overdueInvoices'] . ' invoices are past due.',
                'danger',
                (float) $summary['overdueReceivables'],
                $currency
            );
        }

        if ((float) $summary['dueSoonReceivables'] > 0) {
            $actions[] = $this->action(
                'due-soon',
                2,
                'Prepare due-soon follow-up',
                (int) $summary['dueSoonInvoices'] . ' invoices are due in the next 14 days.',
                'warning',
                (float) $summary['dueSoonReceivables'],
                $currency
            );
        }

        $highUtilization = $customers->filter(fn (array $row) => (float) $row['creditLimit'] > 0 && (float) $row['utilizationPct'] >= 80)->count();
        if ($highUtilization > 0) {
            $actions[] = $this->action(
                'credit-watch',
                3,
                'Review credit-limit exposure',
                $highUtilization . ' customers are above 80% credit utilization.',
                'pending',
                (float) $highUtilization,
                ''
            );
        }

        $missingContacts = $customers->filter(fn (array $row) => trim($row['email'] . $row['phone']) === '')->count();
        if ($missingContacts > 0) {
            $actions[] = $this->action(
                'missing-contact',
                4,
                'Complete collection contact details',
                $missingContacts . ' open-balance customers are missing email and phone details.',
                'info',
                (float) $missingContacts,
                ''
            );
        }

        if (count($actions) === 0) {
            $actions[] = [
                'id' => 'receivables-clear',
                'priority' => 1,
                'title' => 'No urgent receivables exceptions',
                'detail' => 'Customer balances are current against the collection signals.',
                'tone' => 'success',
                'value' => 0,
                'valueLabel' => 'Clear',
            ];
        }

        return collect($actions)->sortBy('priority')->values()->take(5)->all();
    }

    private function action(string $id, int $priority, string $title, string $detail, string $tone, float $value, string $currency): array
    {
        return [
            'id' => $id,
            'priority' => $priority,
            'title' => $title,
            'detail' => $detail,
            'tone' => $tone,
            'value' => round($value, 2),
            'valueLabel' => $currency !== '' ? $currency . ' ' . number_format($value, 0) : number_format($value, 0),
        ];
    }

    private function customerContactSubquery()
    {
        if (!Schema::hasTable('custbranch') || !Schema::hasColumn('custbranch', 'debtorno')) {
            return null;
        }

        $phoneColumn = $this->firstExistingColumn('custbranch', ['phoneno', 'phone', 'brphone', 'telephone', 'contactphone']);
        $query = DB::table('custbranch')->select('debtorno');
        $query->selectRaw(Schema::hasColumn('custbranch', 'email') ? "MAX(NULLIF(email, '')) as email" : "'' as email");
        $query->selectRaw($phoneColumn ? "MAX(NULLIF($phoneColumn, '')) as phone" : "'' as phone");

        return $query->groupBy('debtorno');
    }

    private function openAmountExpression(string $alias): string
    {
        $prefix = $alias . '.';
        $parts = [];

        foreach (['ovamount', 'ovgst', 'ovfreight'] as $column) {
            if (Schema::hasColumn('debtortrans', $column)) {
                $parts[] = 'COALESCE(' . $prefix . $column . ', 0)';
            }
        }

        if (Schema::hasColumn('debtortrans', 'ovdiscount')) {
            $parts[] = '(-1 * COALESCE(' . $prefix . 'ovdiscount, 0))';
        }

        if (Schema::hasColumn('debtortrans', 'alloc')) {
            $parts[] = '(-1 * COALESCE(' . $prefix . 'alloc, 0))';
        }

        return '(' . (count($parts) > 0 ? implode(' + ', $parts) : '0') . ')';
    }

    private function receivableDueDateExpression(string $transactionDate, bool $usesPaymentTerms): string
    {
        if (
            $usesPaymentTerms
            && Schema::hasColumn('paymentterms', 'daysbeforedue')
            && Schema::hasColumn('paymentterms', 'dayinfollowingmonth')
        ) {
            if (DB::connection()->getDriverName() === 'sqlite') {
                return '(CASE WHEN COALESCE(pt.daysbeforedue, 0) > 0 '
                    . "THEN date($transactionDate, '+' || CAST(COALESCE(pt.daysbeforedue, 0) AS TEXT) || ' days') "
                    . "ELSE date($transactionDate, 'start of month', '+1 month', '-1 day', '+' || CAST(COALESCE(pt.dayinfollowingmonth, 0) AS TEXT) || ' days') END)";
            }

            return '(CASE WHEN COALESCE(pt.daysbeforedue, 0) > 0 '
                . 'THEN DATE_ADD(' . $transactionDate . ', INTERVAL COALESCE(pt.daysbeforedue, 0) DAY) '
                . 'ELSE DATE_ADD(LAST_DAY(' . $transactionDate . '), INTERVAL COALESCE(pt.dayinfollowingmonth, 0) DAY) END)';
        }

        return $transactionDate;
    }

    private function customerNameExpression(): string
    {
        if (Schema::hasTable('debtorsmaster') && Schema::hasColumn('debtorsmaster', 'name')) {
            return 'COALESCE(NULLIF(dm.name, \'\'), dt.debtorno)';
        }

        return 'dt.debtorno';
    }

    private function customerCreditLimitExpression(): string
    {
        return Schema::hasTable('debtorsmaster') && Schema::hasColumn('debtorsmaster', 'creditlimit')
            ? 'COALESCE(dm.creditlimit, 0)'
            : '0';
    }

    private function contactExpression(string $column, bool $hasContactSubquery): string
    {
        return $hasContactSubquery ? 'COALESCE(contact.' . $column . ', \'\')' : "''";
    }

    private function optionalColumnExpression(string $table, string $column, string $alias): string
    {
        return Schema::hasColumn($table, $column) ? $alias . '.' . $column : "''";
    }

    private function validDateTextExpression(string $column): string
    {
        return "NULLIF(CAST($column AS CHAR), '0000-00-00')";
    }

    private function parseDate($value, Carbon $fallback): Carbon
    {
        $raw = trim((string) $value);
        if ($raw === '' || $raw === '0000-00-00') {
            return $fallback->copy();
        }

        try {
            return Carbon::parse($raw)->startOfDay();
        } catch (\Throwable) {
            return $fallback->copy();
        }
    }

    private function firstExistingColumn(string $table, array $columns): ?string
    {
        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) {
                return $column;
            }
        }

        return null;
    }

    private function companyCurrency(): string
    {
        if (!Schema::hasTable('companies')) {
            return 'TZS';
        }

        $currency = strtoupper(trim((string) DB::table('companies')->where('coycode', 1)->value('currencydefault')));

        return preg_match('/^[A-Z]{3}$/', $currency) ? $currency : 'TZS';
    }

    private function safeLimit($value, int $min, int $max): int
    {
        return max($min, min((int) $value, $max));
    }

    private function emptyDashboard(Carbon $today): array
    {
        return [
            'currency' => $this->companyCurrency(),
            'asOf' => now()->toIso8601String(),
            'summary' => [
                'totalReceivables' => 0.0,
                'openInvoices' => 0,
                'customersWithBalance' => 0,
                'overdueReceivables' => 0.0,
                'overdueInvoices' => 0,
                'dueSoonReceivables' => 0.0,
                'dueSoonInvoices' => 0,
                'currentReceivables' => 0.0,
                'highestCustomerBalance' => 0.0,
                'averageDaysOverdue' => 0.0,
                'oldestDaysOverdue' => 0,
            ],
            'aging' => array_values($this->agingBuckets(collect(), $today)),
            'topCustomers' => [],
            'priorityInvoices' => [],
            'actionQueue' => [[
                'id' => 'receivables-clear',
                'priority' => 1,
                'title' => 'No urgent receivables exceptions',
                'detail' => 'Customer balances are current against the collection signals.',
                'tone' => 'success',
                'value' => 0,
                'valueLabel' => 'Clear',
            ]],
        ];
    }
}
