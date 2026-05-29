<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class PettyCashController extends Controller
{
    public function dashboard(Request $request)
    {
        try {
            if (!Schema::hasTable('pctabs') && !Schema::hasTable('pcashdetails')) {
                return response()->json(['success' => true, 'data' => $this->emptyDashboard()]);
            }

            $filters = $this->filters($request);
            $movements = $this->movementRows($filters);
            $tabs = $this->tabRows($filters, $movements);

            return response()->json([
                'success' => true,
                'data' => [
                    'settings' => $this->settings(),
                    'asOf' => now()->toIso8601String(),
                    'summary' => $this->summary($tabs, $movements),
                    'tabs' => $tabs->values(),
                    'movements' => $movements->values(),
                    'tabExposure' => $this->tabExposure($tabs),
                    'expenseExposure' => $this->expenseExposure($movements),
                    'monthlyFlow' => $this->monthlyFlow($movements),
                    'filterOptions' => [
                        'tabs' => $this->tabOptions(),
                        'expenses' => $this->expenseOptions(),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Petty cash dashboard could not be loaded.',
            ], 500);
        }
    }

    private function filters(Request $request): array
    {
        return [
            'q' => trim((string) $request->query('q', '')),
            'tab' => trim((string) $request->query('tab', 'all')),
            'status' => trim((string) $request->query('status', 'all')),
            'from' => $this->filterDate($request->query('from')),
            'to' => $this->filterDate($request->query('to')),
        ];
    }

    private function movementRows(array $filters): Collection
    {
        if (!Schema::hasTable('pcashdetails')) {
            return collect();
        }

        $hasTabs = Schema::hasTable('pctabs');
        $hasExpenses = Schema::hasTable('pcexpenses');
        $hasTaxes = Schema::hasTable('pcashdetailtaxes');
        $hasReceipts = Schema::hasTable('pcreceipts');
        $hasCurrencies = Schema::hasTable('currencies');
        $hasTags = Schema::hasTable('tags');

        $query = DB::table('pcashdetails as pc');

        if ($hasTabs) {
            $query->leftJoin('pctabs as pt', 'pt.tabcode', '=', 'pc.tabcode');
        }

        if ($hasExpenses) {
            $query->leftJoin('pcexpenses as pe', 'pe.codeexpense', '=', 'pc.codeexpense');
        }

        if ($hasCurrencies && $hasTabs) {
            $query->leftJoin('currencies as cu', 'cu.currabrev', '=', 'pt.currency');
        }

        if ($hasTags) {
            $query->leftJoin('tags as tg', 'tg.tagref', '=', 'pc.tag');
        }

        if ($hasTaxes) {
            $taxSubquery = DB::table('pcashdetailtaxes')
                ->select('pccashdetail', DB::raw('SUM(amount) as tax_amount'))
                ->groupBy('pccashdetail');

            $query->leftJoinSub($taxSubquery, 'taxes', 'taxes.pccashdetail', '=', 'pc.counterindex');
        }

        if ($hasReceipts) {
            $receiptSubquery = DB::table('pcreceipts')
                ->select('pccashdetail', DB::raw('COUNT(*) as receipt_count'), DB::raw('MAX(type) as receipt_type'))
                ->groupBy('pccashdetail');

            $query->leftJoinSub($receiptSubquery, 'receipts', 'receipts.pccashdetail', '=', 'pc.counterindex');
        }

        if ($filters['q'] !== '') {
            $needle = '%' . $filters['q'] . '%';
            $query->where(function ($inner) use ($needle, $hasExpenses, $hasTabs) {
                $inner
                    ->where('pc.tabcode', 'like', $needle)
                    ->orWhere('pc.codeexpense', 'like', $needle)
                    ->orWhere('pc.purpose', 'like', $needle)
                    ->orWhere('pc.notes', 'like', $needle);

                if ($hasExpenses) {
                    $inner->orWhere('pe.description', 'like', $needle);
                }

                if ($hasTabs) {
                    $inner
                        ->orWhere('pt.usercode', 'like', $needle)
                        ->orWhere('pt.typetabcode', 'like', $needle);
                }
            });
        }

        if ($filters['tab'] !== '' && strtolower($filters['tab']) !== 'all') {
            $query->where('pc.tabcode', $filters['tab']);
        }

        if ($filters['from']) {
            $query->where('pc.date', '>=', $filters['from']);
        }

        if ($filters['to']) {
            $query->where('pc.date', '<=', $filters['to']);
        }

        $status = strtolower($filters['status']);
        if ($status === 'pending') {
            $this->wherePending($query);
        } elseif ($status === 'authorised' || $status === 'authorized') {
            $this->whereAuthorised($query);
        } elseif ($status === 'posted') {
            $query->where('pc.posted', 1);
        } elseif ($status === 'unposted') {
            $query->where('pc.posted', '<>', 1);
        } elseif ($status === 'cash') {
            $query->where('pc.codeexpense', 'ASSIGNCASH');
        } elseif ($status === 'expense') {
            $query->where(function ($inner) {
                $inner->where('pc.codeexpense', '<>', 'ASSIGNCASH')
                    ->orWhereNull('pc.codeexpense');
            });
        }

        $selects = [
            'pc.counterindex',
            'pc.tabcode',
            'pc.tag',
            'pc.date',
            'pc.codeexpense',
            'pc.amount',
            'pc.authorized',
            'pc.posted',
            'pc.purpose',
            'pc.notes',
        ];

        $selects[] = $hasTabs ? 'pt.usercode' : DB::raw('NULL as usercode');
        $selects[] = $hasTabs ? 'pt.typetabcode' : DB::raw('NULL as typetabcode');
        $selects[] = $hasTabs ? 'pt.currency' : DB::raw('NULL as currency');
        $selects[] = $hasExpenses ? 'pe.description as expense_description' : DB::raw('NULL as expense_description');
        $selects[] = $hasExpenses ? 'pe.glaccount as expense_gl_account' : DB::raw('NULL as expense_gl_account');
        $selects[] = ($hasCurrencies && $hasTabs) ? 'cu.decimalplaces' : DB::raw('NULL as decimalplaces');
        $selects[] = $hasTaxes ? DB::raw('COALESCE(taxes.tax_amount, 0) as tax_amount') : DB::raw('0 as tax_amount');
        $selects[] = $hasReceipts ? DB::raw('COALESCE(receipts.receipt_count, 0) as receipt_count') : DB::raw('0 as receipt_count');
        $selects[] = $hasReceipts ? 'receipts.receipt_type' : DB::raw('NULL as receipt_type');
        $selects[] = $hasTags ? 'tg.tagdescription' : DB::raw('NULL as tagdescription');

        return $query
            ->select($selects)
            ->orderByDesc('pc.date')
            ->orderByDesc('pc.counterindex')
            ->limit(5000)
            ->get()
            ->map(fn (object $row) => $this->mapMovement($row));
    }

    private function tabRows(array $filters, Collection $movements): Collection
    {
        if (!Schema::hasTable('pctabs')) {
            return $this->unregisteredTabs($movements);
        }

        $hasTabTypes = Schema::hasTable('pctypetabs');
        $hasCurrencies = Schema::hasTable('currencies');
        $hasChart = Schema::hasTable('chartmaster');
        $hasTags = Schema::hasTable('tags');
        $hasTaxGroups = Schema::hasTable('taxgroups');
        $detailsByTab = $movements->groupBy('tabCode');

        $query = DB::table('pctabs as pt');

        if ($hasTabTypes) {
            $query->leftJoin('pctypetabs as tt', 'tt.typetabcode', '=', 'pt.typetabcode');
        }

        if ($hasCurrencies) {
            $query->leftJoin('currencies as cu', 'cu.currabrev', '=', 'pt.currency');
        }

        if ($hasChart) {
            $query
                ->leftJoin('chartmaster as assignment_account', 'assignment_account.accountcode', '=', 'pt.glaccountassignment')
                ->leftJoin('chartmaster as tab_account', 'tab_account.accountcode', '=', 'pt.glaccountpcash');
        }

        if ($hasTags) {
            $query->leftJoin('tags as tg', 'tg.tagref', '=', 'pt.defaulttag');
        }

        if ($hasTaxGroups) {
            $query->leftJoin('taxgroups as txg', 'txg.taxgroupid', '=', 'pt.taxgroupid');
        }

        if ($filters['q'] !== '') {
            $needle = '%' . $filters['q'] . '%';
            $query->where(function ($inner) use ($needle, $hasTabTypes) {
                $inner
                    ->where('pt.tabcode', 'like', $needle)
                    ->orWhere('pt.usercode', 'like', $needle)
                    ->orWhere('pt.typetabcode', 'like', $needle)
                    ->orWhere('pt.assigner', 'like', $needle)
                    ->orWhere('pt.authorizer', 'like', $needle)
                    ->orWhere('pt.authorizerexpenses', 'like', $needle);

                if ($hasTabTypes) {
                    $inner->orWhere('tt.typetabdescription', 'like', $needle);
                }
            });
        }

        if ($filters['tab'] !== '' && strtolower($filters['tab']) !== 'all') {
            $query->where('pt.tabcode', $filters['tab']);
        }

        $selects = [
            'pt.tabcode',
            'pt.usercode',
            'pt.typetabcode',
            'pt.currency',
            'pt.tablimit',
            'pt.assigner',
            'pt.authorizer',
            'pt.authorizerexpenses',
            'pt.glaccountassignment',
            'pt.glaccountpcash',
            'pt.defaulttag',
            'pt.taxgroupid',
        ];

        $selects[] = $hasTabTypes ? 'tt.typetabdescription' : DB::raw('NULL as typetabdescription');
        $selects[] = $hasCurrencies ? 'cu.decimalplaces' : DB::raw('NULL as decimalplaces');
        $selects[] = $hasChart ? 'assignment_account.accountname as assignment_account_name' : DB::raw('NULL as assignment_account_name');
        $selects[] = $hasChart ? 'tab_account.accountname as tab_account_name' : DB::raw('NULL as tab_account_name');
        $selects[] = $hasTags ? 'tg.tagdescription' : DB::raw('NULL as tagdescription');
        $selects[] = $hasTaxGroups ? 'txg.taxgroupdescription' : DB::raw('NULL as taxgroupdescription');

        $rows = $query
            ->select($selects)
            ->orderBy('pt.tabcode')
            ->get()
            ->map(fn (object $row) => $this->mapTab($row, $detailsByTab->get((string) ($row->tabcode ?? ''), collect())));

        return $this->filterTabsByMovementStatus($rows, $filters['status']);
    }

    private function mapMovement(object $row): array
    {
        $amount = (float) ($row->amount ?? 0);
        $taxAmount = (float) ($row->tax_amount ?? 0);
        $expenseCode = strtoupper(trim((string) ($row->codeexpense ?? '')));
        $isCash = $expenseCode === 'ASSIGNCASH';
        $authorisedDate = $this->validDate($row->authorized ?? null);
        $status = $authorisedDate ? 'Authorised' : 'Pending';
        $date = $this->validDate($row->date ?? null);

        return [
            'id' => (int) ($row->counterindex ?? 0),
            'tabCode' => (string) ($row->tabcode ?? ''),
            'tabUser' => (string) ($row->usercode ?? ''),
            'tabType' => (string) ($row->typetabcode ?? ''),
            'currencyCode' => strtoupper((string) ($row->currency ?? '')),
            'currencyDecimalPlaces' => (int) ($row->decimalplaces ?? 2),
            'date' => $date,
            'expenseCode' => $expenseCode,
            'expenseDescription' => (string) ($row->expense_description ?? ''),
            'kind' => $isCash ? 'cash' : 'expense',
            'movementLabel' => $isCash ? ($amount >= 0 ? 'Cash assigned' : 'Cash transfer') : 'Expense claim',
            'direction' => $amount >= 0 ? 'In' : 'Out',
            'amount' => $amount,
            'grossAmount' => abs($amount),
            'taxAmount' => abs($taxAmount),
            'netAmount' => max(0, abs($amount) - abs($taxAmount)),
            'status' => $status,
            'authorisedDate' => $authorisedDate,
            'posted' => ((int) ($row->posted ?? 0)) === 1,
            'purpose' => (string) ($row->purpose ?? ''),
            'notes' => (string) ($row->notes ?? ''),
            'tag' => (int) ($row->tag ?? 0),
            'tagDescription' => (string) ($row->tagdescription ?? ''),
            'expenseGlAccount' => (string) ($row->expense_gl_account ?? ''),
            'hasReceipt' => ((int) ($row->receipt_count ?? 0)) > 0,
            'receiptType' => (string) ($row->receipt_type ?? ''),
        ];
    }

    private function mapTab(object $row, Collection $movements): array
    {
        $tabLimit = (float) ($row->tablimit ?? 0);
        $balance = (float) $movements->sum('amount');
        $assignedCash = (float) $movements
            ->filter(fn (array $movement) => $movement['kind'] === 'cash' && $movement['amount'] > 0)
            ->sum('amount');
        $transferredCash = abs((float) $movements
            ->filter(fn (array $movement) => $movement['kind'] === 'cash' && $movement['amount'] < 0)
            ->sum('amount'));
        $claimedExpenses = abs((float) $movements
            ->filter(fn (array $movement) => $movement['kind'] === 'expense' && $movement['amount'] < 0)
            ->sum('amount'));
        $pendingCash = (float) $movements
            ->filter(fn (array $movement) => $movement['kind'] === 'cash' && $movement['status'] === 'Pending')
            ->sum('amount');
        $pendingExpenses = abs((float) $movements
            ->filter(fn (array $movement) => $movement['kind'] === 'expense' && $movement['status'] === 'Pending')
            ->sum('amount'));
        $pendingValue = abs($pendingCash) + $pendingExpenses;
        $utilisation = $tabLimit > 0 ? round(($balance / $tabLimit) * 100, 2) : 0;

        $status = 'Ready';
        if ($tabLimit > 0 && $balance > $tabLimit) {
            $status = 'Over limit';
        } elseif ($pendingValue > 0) {
            $status = 'Pending review';
        } elseif ($balance <= 0 && $assignedCash <= 0) {
            $status = 'Needs funding';
        }

        return [
            'id' => (string) ($row->tabcode ?? ''),
            'tabCode' => (string) ($row->tabcode ?? ''),
            'userCode' => (string) ($row->usercode ?? ''),
            'typeCode' => (string) ($row->typetabcode ?? ''),
            'typeDescription' => (string) ($row->typetabdescription ?? $row->typetabcode ?? ''),
            'currencyCode' => strtoupper((string) ($row->currency ?? '')),
            'currencyDecimalPlaces' => (int) ($row->decimalplaces ?? 2),
            'tabLimit' => $tabLimit,
            'currentBalance' => $balance,
            'availableToLimit' => max(0, $tabLimit - $balance),
            'limitUtilisation' => $utilisation,
            'assignedCash' => $assignedCash,
            'transferredCash' => $transferredCash,
            'claimedExpenses' => $claimedExpenses,
            'pendingCash' => $pendingCash,
            'pendingExpenses' => $pendingExpenses,
            'movementCount' => $movements->count(),
            'unpostedCount' => $movements->where('posted', false)->count(),
            'assignmentAccount' => (string) ($row->glaccountassignment ?? ''),
            'assignmentAccountName' => (string) ($row->assignment_account_name ?? ''),
            'pettyCashAccount' => (string) ($row->glaccountpcash ?? ''),
            'pettyCashAccountName' => (string) ($row->tab_account_name ?? ''),
            'assigner' => (string) ($row->assigner ?? ''),
            'cashAuthoriser' => (string) ($row->authorizer ?? ''),
            'expenseAuthoriser' => (string) ($row->authorizerexpenses ?? ''),
            'defaultTag' => (int) ($row->defaulttag ?? 0),
            'defaultTagDescription' => (string) ($row->tagdescription ?? ''),
            'taxGroupId' => (int) ($row->taxgroupid ?? 0),
            'taxGroupDescription' => (string) ($row->taxgroupdescription ?? ''),
            'status' => $status,
        ];
    }

    private function unregisteredTabs(Collection $movements): Collection
    {
        return $movements
            ->groupBy('tabCode')
            ->map(function (Collection $rows, string $tabCode) {
                $row = (object) [
                    'tabcode' => $tabCode,
                    'usercode' => '',
                    'typetabcode' => 'Unregistered',
                    'typetabdescription' => 'Unregistered tab',
                    'currency' => (string) ($rows->first()['currencyCode'] ?? ''),
                    'decimalplaces' => (int) ($rows->first()['currencyDecimalPlaces'] ?? 2),
                    'tablimit' => 0,
                ];

                return $this->mapTab($row, $rows);
            })
            ->values();
    }

    private function filterTabsByMovementStatus(Collection $tabs, string $status): Collection
    {
        $status = strtolower($status);
        if ($status === '' || $status === 'all') {
            return $tabs;
        }

        if ($status === 'pending') {
            return $tabs
                ->filter(fn (array $tab) => abs((float) $tab['pendingCash']) + (float) $tab['pendingExpenses'] > 0)
                ->values();
        }

        return $tabs
            ->filter(fn (array $tab) => (int) $tab['movementCount'] > 0)
            ->values();
    }

    private function summary(Collection $tabs, Collection $movements): array
    {
        $assignedCash = (float) $movements
            ->filter(fn (array $movement) => $movement['kind'] === 'cash' && $movement['amount'] > 0)
            ->sum('amount');
        $transferredCash = abs((float) $movements
            ->filter(fn (array $movement) => $movement['kind'] === 'cash' && $movement['amount'] < 0)
            ->sum('amount'));
        $claimedExpenses = abs((float) $movements
            ->filter(fn (array $movement) => $movement['kind'] === 'expense' && $movement['amount'] < 0)
            ->sum('amount'));

        return [
            'tabCount' => $tabs->count(),
            'totalLimit' => (float) $tabs->sum('tabLimit'),
            'currentBalance' => (float) $tabs->sum('currentBalance'),
            'assignedCash' => $assignedCash,
            'transferredCash' => $transferredCash,
            'claimedExpenses' => $claimedExpenses,
            'pendingCash' => (float) $movements
                ->filter(fn (array $movement) => $movement['kind'] === 'cash' && $movement['status'] === 'Pending')
                ->sum('amount'),
            'pendingExpenses' => abs((float) $movements
                ->filter(fn (array $movement) => $movement['kind'] === 'expense' && $movement['status'] === 'Pending')
                ->sum('amount')),
            'authorisedMovements' => $movements->where('status', 'Authorised')->count(),
            'unpostedMovements' => $movements->where('posted', false)->count(),
            'overLimitTabs' => $tabs->where('status', 'Over limit')->count(),
        ];
    }

    private function tabExposure(Collection $tabs): array
    {
        return $tabs
            ->sortByDesc(fn (array $tab) => abs((float) ($tab['currentBalance'] ?? 0)))
            ->take(8)
            ->values()
            ->map(fn (array $tab) => [
                'tabCode' => $tab['tabCode'],
                'userCode' => $tab['userCode'],
                'currencyCode' => $tab['currencyCode'],
                'currencyDecimalPlaces' => $tab['currencyDecimalPlaces'],
                'tabLimit' => $tab['tabLimit'],
                'currentBalance' => $tab['currentBalance'],
                'claimedExpenses' => $tab['claimedExpenses'],
                'pendingValue' => abs((float) $tab['pendingCash']) + (float) $tab['pendingExpenses'],
                'status' => $tab['status'],
            ])
            ->all();
    }

    private function expenseExposure(Collection $movements): array
    {
        return $movements
            ->filter(fn (array $movement) => $movement['kind'] === 'expense')
            ->groupBy('expenseCode')
            ->map(function (Collection $rows, string $expenseCode) {
                $first = $rows->first();

                return [
                    'expenseCode' => $expenseCode ?: 'Uncoded',
                    'expenseDescription' => (string) ($first['expenseDescription'] ?? ''),
                    'movementCount' => $rows->count(),
                    'grossAmount' => (float) $rows->sum('grossAmount'),
                    'taxAmount' => (float) $rows->sum('taxAmount'),
                    'pendingCount' => $rows->where('status', 'Pending')->count(),
                ];
            })
            ->sortByDesc('grossAmount')
            ->take(8)
            ->values()
            ->all();
    }

    private function monthlyFlow(Collection $movements): array
    {
        return $movements
            ->filter(fn (array $movement) => !empty($movement['date']))
            ->groupBy(fn (array $movement) => substr((string) $movement['date'], 0, 7))
            ->map(function (Collection $rows, string $period) {
                $cashIn = (float) $rows
                    ->filter(fn (array $movement) => $movement['kind'] === 'cash' && $movement['amount'] > 0)
                    ->sum('amount');
                $cashOut = abs((float) $rows
                    ->filter(fn (array $movement) => $movement['kind'] === 'cash' && $movement['amount'] < 0)
                    ->sum('amount'));
                $expenses = (float) $rows
                    ->filter(fn (array $movement) => $movement['kind'] === 'expense')
                    ->sum('grossAmount');

                return [
                    'period' => $period,
                    'cashIn' => $cashIn,
                    'cashOut' => $cashOut,
                    'expenses' => $expenses,
                    'netMovement' => (float) $rows->sum('amount'),
                ];
            })
            ->sortKeys()
            ->values()
            ->slice(-12)
            ->values()
            ->all();
    }

    private function tabOptions(): array
    {
        if (Schema::hasTable('pctabs')) {
            return DB::table('pctabs')
                ->select('tabcode', 'usercode')
                ->orderBy('tabcode')
                ->get()
                ->map(fn (object $row) => [
                    'id' => (string) ($row->tabcode ?? ''),
                    'label' => trim((string) ($row->tabcode ?? '') . ' ' . (string) ($row->usercode ?? '')),
                ])
                ->values()
                ->all();
        }

        if (!Schema::hasTable('pcashdetails')) {
            return [];
        }

        return DB::table('pcashdetails')
            ->select('tabcode')
            ->distinct()
            ->orderBy('tabcode')
            ->get()
            ->map(fn (object $row) => [
                'id' => (string) ($row->tabcode ?? ''),
                'label' => (string) ($row->tabcode ?? ''),
            ])
            ->values()
            ->all();
    }

    private function expenseOptions(): array
    {
        if (!Schema::hasTable('pcexpenses')) {
            return [];
        }

        return DB::table('pcexpenses')
            ->select('codeexpense', 'description')
            ->orderBy('codeexpense')
            ->get()
            ->map(fn (object $row) => [
                'id' => (string) ($row->codeexpense ?? ''),
                'label' => trim((string) ($row->codeexpense ?? '') . ' ' . (string) ($row->description ?? '')),
            ])
            ->values()
            ->all();
    }

    private function settings(): array
    {
        $company = Schema::hasTable('companies')
            ? DB::table('companies')->orderBy('coycode')->select('coyname', 'currencydefault')->first()
            : null;

        $currencyCode = strtoupper(trim((string) ($company->currencydefault ?? '')));
        if ($currencyCode === '') {
            $currencyCode = 'USD';
        }

        $currency = Schema::hasTable('currencies')
            ? DB::table('currencies')->where('currabrev', $currencyCode)->select('currency', 'currabrev', 'decimalplaces')->first()
            : null;

        return [
            'companyName' => (string) ($company->coyname ?? 'Company'),
            'currencyCode' => (string) ($currency->currabrev ?? $currencyCode),
            'currencyName' => (string) ($currency->currency ?? $currencyCode),
            'currencyDecimalPlaces' => (int) ($currency->decimalplaces ?? 2),
            'dateFormat' => $this->dateFormat(),
        ];
    }

    private function wherePending($query): void
    {
        $query->where(function ($inner) {
            $inner
                ->whereNull('pc.authorized')
                ->orWhere('pc.authorized', '')
                ->orWhere('pc.authorized', '0000-00-00');
        });
    }

    private function whereAuthorised($query): void
    {
        $query
            ->whereNotNull('pc.authorized')
            ->where('pc.authorized', '<>', '')
            ->where('pc.authorized', '<>', '0000-00-00');
    }

    private function dateFormat(): string
    {
        if (!Schema::hasTable('config')) {
            return 'Y-m-d';
        }

        return (string) (DB::table('config')
            ->where('confname', 'DefaultDateFormat')
            ->value('confvalue') ?? 'Y-m-d');
    }

    private function filterDate(mixed $value): ?string
    {
        $date = trim((string) ($value ?? ''));
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1 ? $date : null;
    }

    private function validDate(mixed $value): ?string
    {
        $date = trim((string) ($value ?? ''));
        if ($date === '' || $date === '0000-00-00') {
            return null;
        }

        return substr($date, 0, 10);
    }

    private function emptyDashboard(): array
    {
        return [
            'settings' => $this->settings(),
            'asOf' => now()->toIso8601String(),
            'summary' => [
                'tabCount' => 0,
                'totalLimit' => 0,
                'currentBalance' => 0,
                'assignedCash' => 0,
                'transferredCash' => 0,
                'claimedExpenses' => 0,
                'pendingCash' => 0,
                'pendingExpenses' => 0,
                'authorisedMovements' => 0,
                'unpostedMovements' => 0,
                'overLimitTabs' => 0,
            ],
            'tabs' => [],
            'movements' => [],
            'tabExposure' => [],
            'expenseExposure' => [],
            'monthlyFlow' => [],
            'filterOptions' => [
                'tabs' => [],
                'expenses' => [],
            ],
        ];
    }
}
