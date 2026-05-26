<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DashboardController extends Controller
{
    public function show()
    {
        try {
            return response()->json([
                'success' => true,
                'data' => [
                    'companyName' => $this->companyName(),
                    'currency' => $this->currency(),
                    'asOf' => now()->toDateString(),
                    'cards' => [
                        'cashAtRisk' => $this->cashAtRiskCard(),
                        'overdueReceivables' => $this->overdueReceivablesCard(),
                        'approvalBacklog' => $this->approvalBacklogCard(),
                        'stockExposure' => $this->stockExposureCard(),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Dashboard data could not be loaded.',
            ], 500);
        }
    }

    private function cashAtRiskCard(): array
    {
        $horizonDays = 14;
        $native = $this->nativePayablesDueWithin($horizonDays);
        $legacy = $this->legacyPayablesDueWithin($horizonDays);
        $amount = round($native['amount'] + $legacy['amount'], 2);
        $count = $native['count'] + $legacy['count'];

        return [
            'value' => $amount,
            'count' => $count,
            'detail' => $count > 0
                ? $this->plural($count, 'supplier bill', 'supplier bills') . ' due now or within ' . $horizonDays . ' days'
                : 'No supplier bills due in the next ' . $horizonDays . ' days',
            'status' => $count > 0 ? 'Due soon' : 'Clear',
            'tone' => $count > 0 ? 'danger' : 'success',
            'meta' => [
                'horizonDays' => $horizonDays,
                'nativeBills' => $native['count'],
                'legacyBills' => $legacy['count'],
            ],
        ];
    }

    private function overdueReceivablesCard(): array
    {
        $summary = $this->legacyOverdueReceivables();
        $amount = round($summary['amount'], 2);
        $count = $summary['count'];

        return [
            'value' => $amount,
            'count' => $count,
            'detail' => $count > 0
                ? $this->plural($count, 'invoice', 'invoices') . ' beyond credit terms'
                : 'No invoices beyond credit terms',
            'status' => $count > 0 ? 'Collect' : 'Clear',
            'tone' => $count > 0 ? 'warning' : 'success',
        ];
    }

    private function approvalBacklogCard(): array
    {
        $supplierBills = $this->pendingSupplierBillApprovals();
        $purchaseOrders = $this->pendingPurchaseOrderApprovals();
        $count = $supplierBills + $purchaseOrders;

        return [
            'value' => $count,
            'count' => $count,
            'detail' => $count > 0
                ? $purchaseOrders . ' POs and ' . $supplierBills . ' supplier bills awaiting decision'
                : 'No purchasing approvals awaiting decision',
            'status' => $count > 0 ? 'Aging' : 'Clear',
            'tone' => $count > 0 ? 'pending' : 'success',
            'meta' => [
                'purchaseOrders' => $purchaseOrders,
                'supplierBills' => $supplierBills,
            ],
        ];
    }

    private function stockExposureCard(): array
    {
        $summary = $this->stockExposureSummary();
        $count = $summary['total'];

        return [
            'value' => $count,
            'count' => $count,
            'detail' => $count > 0
                ? $this->plural($count, 'low or negative balance', 'low or negative balances') . ' affecting sales'
                : 'No low or negative stock balances',
            'status' => $count > 0 ? 'Review' : 'Clear',
            'tone' => $count > 0 ? 'info' : 'success',
            'meta' => $summary,
        ];
    }

    private function nativePayablesDueWithin(int $days): array
    {
        if (!Schema::hasTable('ap_bills')) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $query = DB::table('ap_bills as b')
            ->where('b.amount_due', '>', 0)
            ->whereDate('b.due_date', '<=', now()->addDays($days)->toDateString());

        $this->withoutDeleted($query, 'ap_bills', 'b');

        $row = $query
            ->selectRaw('COALESCE(SUM(b.amount_due), 0) as amount, COUNT(*) as count')
            ->first();

        return [
            'amount' => (float) ($row->amount ?? 0),
            'count' => (int) ($row->count ?? 0),
        ];
    }

    private function legacyPayablesDueWithin(int $days): array
    {
        if (!Schema::hasTable('supptrans')) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $dueDateColumn = $this->firstExistingColumn('supptrans', ['duedate', 'trandate']);
        if ($dueDateColumn === null) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $amountExpression = $this->legacySupplierAmountExpression('st');
        $query = DB::table('supptrans as st')
            ->whereRaw($amountExpression . ' > 0')
            ->whereDate('st.' . $dueDateColumn, '<=', now()->addDays($days)->toDateString());

        if (Schema::hasColumn('supptrans', 'hold')) {
            $query->where('st.hold', 0);
        }

        if (Schema::hasColumn('supptrans', 'void')) {
            $query->where('st.void', 0);
        }

        $row = $query
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as amount, COUNT(*) as count')
            ->first();

        return [
            'amount' => (float) ($row->amount ?? 0),
            'count' => (int) ($row->count ?? 0),
        ];
    }

    private function legacyOverdueReceivables(): array
    {
        if (!Schema::hasTable('debtortrans')) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $dateColumn = $this->firstExistingColumn('debtortrans', ['trandate', 'inputdate']);
        if ($dateColumn === null) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $amountExpression = $this->legacyCustomerAmountExpression('dt');
        $query = DB::table('debtortrans as dt');
        $usesPaymentTerms = false;

        if (Schema::hasTable('debtorsmaster') && Schema::hasColumn('debtorsmaster', 'debtorno')) {
            $query->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'dt.debtorno');

            if (
                Schema::hasTable('paymentterms')
                && Schema::hasColumn('debtorsmaster', 'paymentterms')
                && Schema::hasColumn('paymentterms', 'termsindicator')
            ) {
                $query->leftJoin('paymentterms as pt', 'pt.termsindicator', '=', 'dm.paymentterms');
                $usesPaymentTerms = true;
            }
        }

        if (Schema::hasColumn('debtortrans', 'type')) {
            $query->where('dt.type', 10);
        }

        if (Schema::hasColumn('debtortrans', 'settled')) {
            $query->where('dt.settled', 0);
        }

        $query
            ->whereRaw($amountExpression . ' > 0.004')
            ->whereRaw($this->receivableDueDateExpression('dt.' . $dateColumn, $usesPaymentTerms) . ' < CURDATE()');

        $row = $query
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as amount, COUNT(*) as count')
            ->first();

        return [
            'amount' => (float) ($row->amount ?? 0),
            'count' => (int) ($row->count ?? 0),
        ];
    }

    private function pendingSupplierBillApprovals(): int
    {
        if (!Schema::hasTable('ap_bill_approval_instances')) {
            return 0;
        }

        $query = DB::table('ap_bill_approval_instances as i')
            ->where('i.status', 'pending');

        $this->withoutDeleted($query, 'ap_bill_approval_instances', 'i');

        return (int) $query->count();
    }

    private function pendingPurchaseOrderApprovals(): int
    {
        if (!Schema::hasTable('purchorders') || !Schema::hasColumn('purchorders', 'status')) {
            return 0;
        }

        return (int) DB::table('purchorders')
            ->whereIn('status', ['Pending', 'Reviewed'])
            ->count();
    }

    private function stockExposureSummary(): array
    {
        if (
            !Schema::hasTable('locstock')
            || !Schema::hasTable('stockmaster')
            || !Schema::hasColumn('locstock', 'quantity')
            || !Schema::hasColumn('locstock', 'stockid')
            || !Schema::hasColumn('stockmaster', 'stockid')
        ) {
            return ['total' => 0, 'negative' => 0, 'outOfStock' => 0, 'atReorderLevel' => 0];
        }

        $negative = (int) $this->stockBaseQuery()
            ->where('ls.quantity', '<', 0)
            ->count();

        $outOfStock = 0;
        $atReorderLevel = 0;

        if (Schema::hasColumn('locstock', 'reorderlevel')) {
            $outOfStock = (int) $this->stockBaseQuery()
                ->where('ls.quantity', '=', 0)
                ->where('ls.reorderlevel', '>', 0)
                ->count();

            $atReorderLevel = (int) $this->stockBaseQuery()
                ->where('ls.quantity', '>', 0)
                ->where('ls.reorderlevel', '>', 0)
                ->whereColumn('ls.quantity', '<=', 'ls.reorderlevel')
                ->count();
        }

        return [
            'total' => $negative + $outOfStock + $atReorderLevel,
            'negative' => $negative,
            'outOfStock' => $outOfStock,
            'atReorderLevel' => $atReorderLevel,
        ];
    }

    private function stockBaseQuery()
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid');

        if (Schema::hasColumn('stockmaster', 'mbflag')) {
            $query->whereNotIn('sm.mbflag', ['A', 'D', 'K']);
        }

        return $query;
    }

    private function legacySupplierAmountExpression(string $tableAlias = ''): string
    {
        $prefix = $tableAlias !== '' ? $tableAlias . '.' : '';
        $parts = [];

        foreach (['ovamount', 'ovgst', 'ovfreight'] as $column) {
            if (Schema::hasColumn('supptrans', $column)) {
                $parts[] = 'COALESCE(' . $prefix . $column . ', 0)';
            }
        }

        if (Schema::hasColumn('supptrans', 'ovdiscount')) {
            $parts[] = '- COALESCE(' . $prefix . 'ovdiscount, 0)';
        }

        $gross = count($parts) > 0 ? implode(' + ', $parts) : '0';
        if (Schema::hasColumn('supptrans', 'alloc')) {
            return '(' . $gross . ' - COALESCE(' . $prefix . 'alloc, 0))';
        }

        return '(' . $gross . ')';
    }

    private function legacyCustomerAmountExpression(string $tableAlias = ''): string
    {
        $prefix = $tableAlias !== '' ? $tableAlias . '.' : '';
        $parts = [];

        foreach (['ovamount', 'ovgst', 'ovfreight', 'ovdiscount'] as $column) {
            if (Schema::hasColumn('debtortrans', $column)) {
                $parts[] = 'COALESCE(' . $prefix . $column . ', 0)';
            }
        }

        $gross = count($parts) > 0 ? implode(' + ', $parts) : '0';
        if (Schema::hasColumn('debtortrans', 'alloc')) {
            return '(' . $gross . ' - COALESCE(' . $prefix . 'alloc, 0))';
        }

        return '(' . $gross . ')';
    }

    private function receivableDueDateExpression(string $transactionDate, bool $usesPaymentTerms): string
    {
        if (
            $usesPaymentTerms
            && Schema::hasTable('paymentterms')
            && Schema::hasColumn('paymentterms', 'daysbeforedue')
            && Schema::hasColumn('paymentterms', 'dayinfollowingmonth')
        ) {
            return '(CASE WHEN COALESCE(pt.daysbeforedue, 0) > 0 '
                . 'THEN DATE_ADD(' . $transactionDate . ', INTERVAL COALESCE(pt.daysbeforedue, 0) DAY) '
                . 'ELSE DATE_ADD(LAST_DAY(' . $transactionDate . '), INTERVAL COALESCE(pt.dayinfollowingmonth, 0) DAY) END)';
        }

        return $transactionDate;
    }

    private function withoutDeleted($query, string $table, string $alias = '')
    {
        if (Schema::hasColumn($table, 'deleted_at')) {
            $query->whereNull(($alias !== '' ? $alias : $table) . '.deleted_at');
        }

        return $query;
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

    private function currency(): string
    {
        if (!Schema::hasTable('companies')) {
            return 'TZS';
        }

        return (string) (DB::table('companies')->where('coycode', 1)->value('currencydefault') ?: 'TZS');
    }

    private function companyName(): string
    {
        if (!Schema::hasTable('companies')) {
            return 'Akiva ERP';
        }

        return html_entity_decode((string) (DB::table('companies')->where('coycode', 1)->value('coyname') ?: 'Akiva ERP'));
    }

    private function plural(int $count, string $singular, string $plural): string
    {
        return $count . ' ' . ($count === 1 ? $singular : $plural);
    }
}
