<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class GeneralLedgerController extends Controller
{
    public function accounts(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 400), 25, 2000);
        $search = trim((string) $request->query('q', ''));
        $groupName = trim((string) $request->query('group', ''));
        $sectionId = trim((string) $request->query('section', ''));
        $accountType = trim((string) $request->query('accountType', ''));
        $cashFlowActivity = trim((string) $request->query('cashFlowActivity', ''));

        try {
            $latestPeriod = (int) (DB::table('periods')->max('periodno') ?? 0);

            $query = DB::table('chartmaster as cm')
                ->join('accountgroups as ag', 'ag.groupname', '=', 'cm.group_')
                ->leftJoin('accountsection as acs', 'acs.sectionid', '=', 'ag.sectioninaccounts')
                ->leftJoin('chartdetails as cd', function ($join) use ($latestPeriod) {
                    $join
                        ->on('cd.accountcode', '=', 'cm.accountcode')
                        ->where('cd.period', '=', $latestPeriod);
                })
                ->select(
                    'cm.accountcode',
                    'cm.accountname',
                    'cm.group_',
                    'cm.cashflowsactivity',
                    'ag.sectioninaccounts',
                    'ag.pandl',
                    'ag.sequenceintb',
                    'ag.parentgroupname',
                    'acs.sectionname',
                    DB::raw('COALESCE(cd.bfwd + cd.actual, 0) AS balance')
                )
                ->orderBy('ag.sequenceintb')
                ->orderBy('cm.accountcode')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('cm.accountcode', 'like', $like)
                        ->orWhere('cm.accountname', 'like', $like)
                        ->orWhere('cm.group_', 'like', $like)
                        ->orWhere('acs.sectionname', 'like', $like);
                });
            }

            if ($groupName !== '') {
                $query->where('cm.group_', '=', $groupName);
            }

            if ($sectionId !== '') {
                $query->where('ag.sectioninaccounts', '=', (int) $sectionId);
            }

            if ($accountType !== '') {
                $query->where('ag.pandl', '=', (int) $accountType);
            }

            if ($cashFlowActivity !== '') {
                $query->where('cm.cashflowsactivity', '=', (int) $cashFlowActivity);
            }

            $rows = $query->get();

            $summary = [
                'accounts' => (int) $rows->count(),
                'balanceSheetAccounts' => (int) $rows->where('pandl', 0)->count(),
                'profitLossAccounts' => (int) $rows->where('pandl', 1)->count(),
            ];

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'accountCode' => (string) $row->accountcode,
                        'accountName' => (string) $row->accountname,
                        'groupName' => (string) $row->group_,
                        'sectionId' => (int) $row->sectioninaccounts,
                        'sectionName' => (string) ($row->sectionname ?? ''),
                        'accountType' => (int) $row->pandl,
                        'accountTypeLabel' => ((int) $row->pandl) === 1 ? 'Profit/Loss' : 'Balance Sheet',
                        'sequenceInTB' => (int) $row->sequenceintb,
                        'parentGroupName' => (string) ($row->parentgroupname ?? ''),
                        'cashFlowsActivity' => (int) $row->cashflowsactivity,
                        'cashFlowsActivityName' => $this->cashFlowActivityName((int) $row->cashflowsactivity),
                        'balance' => (float) $row->balance,
                    ];
                }),
                'meta' => [
                    'latestPeriod' => $latestPeriod,
                    'summary' => $summary,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'latestPeriod' => 0,
                    'summary' => [
                        'accounts' => 0,
                        'balanceSheetAccounts' => 0,
                        'profitLossAccounts' => 0,
                    ],
                ],
            ]);
        }
    }

    public function transactions(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 50), 25, 500);
        $page = $this->safePage($request->query('page', 1));
        $search = trim((string) $request->query('q', ''));
        $accountCode = strtoupper(trim((string) $request->query('account', '')));
        $dateFrom = trim((string) $request->query('dateFrom', ''));
        $dateTo = trim((string) $request->query('dateTo', ''));
        $status = strtolower(trim((string) $request->query('status', '')));
        $offset = ($page - 1) * $limit;

        try {
            $entryKeyExpression = "CONCAT(gl.type, '|', gl.typeno, '|', gl.periodno, '|', gl.trandate)";

            $aggregated = DB::table('gltrans as gl')
                ->leftJoin('chartmaster as cm', 'cm.accountcode', '=', 'gl.account')
                ->leftJoin('systypes as st', 'st.typeid', '=', 'gl.type')
                ->select(
                    DB::raw($entryKeyExpression . ' AS entry_key'),
                    'gl.type',
                    'gl.typeno',
                    'gl.periodno',
                    'gl.trandate',
                    DB::raw("MAX(COALESCE(NULLIF(TRIM(st.typename), ''), 'GL Transaction')) AS type_name"),
                    DB::raw("MAX(COALESCE(NULLIF(TRIM(gl.narrative), ''), '')) AS narrative"),
                    DB::raw('MAX(gl.counterindex) AS max_counterindex'),
                    DB::raw('SUM(CASE WHEN gl.amount > 0 THEN gl.amount ELSE 0 END) AS debit_total'),
                    DB::raw('MAX(ABS(gl.amount)) AS max_abs_amount'),
                    DB::raw('COUNT(*) AS line_count'),
                    DB::raw('SUM(CASE WHEN gl.posted = 1 THEN 1 ELSE 0 END) AS posted_count')
                )
                ->groupBy('gl.type', 'gl.typeno', 'gl.periodno', 'gl.trandate');

            if ($search !== '') {
                $like = '%' . $search . '%';
                $aggregated->where(function ($builder) use ($like) {
                    $builder
                        ->where('gl.narrative', 'like', $like)
                        ->orWhere('gl.account', 'like', $like)
                        ->orWhere('cm.accountname', 'like', $like)
                        ->orWhereRaw('CAST(gl.typeno AS CHAR) LIKE ?', [$like]);
                });
            }

            if ($accountCode !== '') {
                $aggregated->where('gl.account', $accountCode);
            }

            if ($dateFrom !== '') {
                $aggregated->whereDate('gl.trandate', '>=', $dateFrom);
            }

            if ($dateTo !== '') {
                $aggregated->whereDate('gl.trandate', '<=', $dateTo);
            }

            if ($status === 'posted') {
                $aggregated->havingRaw('SUM(CASE WHEN gl.posted = 1 THEN 1 ELSE 0 END) = COUNT(*)');
            } elseif ($status === 'pending') {
                $aggregated->havingRaw('SUM(CASE WHEN gl.posted = 1 THEN 1 ELSE 0 END) < COUNT(*)');
            }

            $totalEntries = (int) DB::query()
                ->fromSub(clone $aggregated, 'gl_entries')
                ->count();

            if ($totalEntries === 0) {
                return response()->json([
                    'success' => true,
                    'data' => [],
                    'meta' => [
                        'summary' => [
                            'entries' => 0,
                            'postedEntries' => 0,
                            'pendingEntries' => 0,
                            'totalDebits' => 0,
                            'totalCredits' => 0,
                            'balance' => 0,
                        ],
                        'pagination' => [
                            'page' => $page,
                            'limit' => $limit,
                            'total' => 0,
                            'totalPages' => 0,
                            'hasMore' => false,
                        ],
                    ],
                ]);
            }

            $entryRows = (clone $aggregated)
                ->orderByDesc('max_counterindex')
                ->offset($offset)
                ->limit($limit)
                ->get();

            $entryKeys = $entryRows->pluck('entry_key');

            $lines = DB::table('gltrans as gl')
                ->leftJoin('chartmaster as cm', 'cm.accountcode', '=', 'gl.account')
                ->select(
                    DB::raw($entryKeyExpression . ' AS entry_key'),
                    'gl.account',
                    'gl.amount',
                    'cm.accountname'
                )
                ->whereIn(DB::raw($entryKeyExpression), $entryKeys->all())
                ->orderByDesc('gl.counterindex')
                ->get();

            $accountLinesByEntry = [];
            foreach ($lines as $line) {
                $entryKey = (string) $line->entry_key;
                if (!isset($accountLinesByEntry[$entryKey])) {
                    $accountLinesByEntry[$entryKey] = [
                        'debitAccounts' => [],
                        'creditAccounts' => [],
                    ];
                }

                $label = (string) $line->account;
                $accountName = trim((string) ($line->accountname ?? ''));
                if ($accountName !== '') {
                    $label .= ' - ' . $accountName;
                }

                if (((float) $line->amount) >= 0) {
                    $accountLinesByEntry[$entryKey]['debitAccounts'][$label] = true;
                } else {
                    $accountLinesByEntry[$entryKey]['creditAccounts'][$label] = true;
                }
            }

            $data = [];
            foreach ($entryRows as $entry) {
                $entryKey = (string) $entry->entry_key;
                $lineCount = (int) $entry->line_count;
                $postedCount = (int) $entry->posted_count;
                $statusLabel = $lineCount > 0 && $postedCount === $lineCount ? 'Posted' : 'Pending';
                $amount = (float) $entry->debit_total;
                if (abs($amount) < 0.000001) {
                    $amount = (float) $entry->max_abs_amount;
                }

                $debitAccounts = $accountLinesByEntry[$entryKey]['debitAccounts'] ?? [];
                $creditAccounts = $accountLinesByEntry[$entryKey]['creditAccounts'] ?? [];

                $reference = trim((string) $entry->type_name) . ' #' . (int) $entry->typeno;
                $description = trim((string) $entry->narrative);

                $data[] = [
                    'id' => $entryKey,
                    'date' => (string) $entry->trandate,
                    'reference' => $reference,
                    'description' => $description !== '' ? $description : $reference,
                    'debitAccount' => count($debitAccounts) > 0 ? implode(', ', array_keys($debitAccounts)) : '-',
                    'creditAccount' => count($creditAccounts) > 0 ? implode(', ', array_keys($creditAccounts)) : '-',
                    'amount' => $amount,
                    'status' => $statusLabel,
                    'type' => (int) $entry->type,
                    'typeNo' => (int) $entry->typeno,
                    'periodNo' => (int) $entry->periodno,
                    'lineCount' => $lineCount,
                ];
            }

            $totalDebits = array_reduce($data, static function (float $sum, array $entry): float {
                return $sum + (float) $entry['amount'];
            }, 0.0);

            $postedEntries = count(array_filter($data, static function (array $entry): bool {
                return $entry['status'] === 'Posted';
            }));

            $pendingEntries = count($data) - $postedEntries;
            $totalPages = (int) ceil($totalEntries / $limit);

            return response()->json([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'summary' => [
                        'entries' => count($data),
                        'postedEntries' => $postedEntries,
                        'pendingEntries' => $pendingEntries,
                        'totalDebits' => (float) $totalDebits,
                        'totalCredits' => (float) $totalDebits,
                        'balance' => 0.0,
                    ],
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => $totalEntries,
                        'totalPages' => $totalPages,
                        'hasMore' => $page < $totalPages,
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'summary' => [
                        'entries' => 0,
                        'postedEntries' => 0,
                        'pendingEntries' => 0,
                        'totalDebits' => 0,
                        'totalCredits' => 0,
                        'balance' => 0,
                    ],
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => 0,
                        'totalPages' => 0,
                        'hasMore' => false,
                    ],
                ],
            ]);
        }
    }

    public function createTransaction(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'tranDate' => ['required', 'date_format:Y-m-d'],
            'narrative' => ['nullable', 'string', 'max:200'],
            'lines' => ['required', 'array', 'min:2'],
            'lines.*.accountCode' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'lines.*.debit' => ['nullable', 'numeric', 'min:0'],
            'lines.*.credit' => ['nullable', 'numeric', 'min:0'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $tranDate = (string) $payload['tranDate'];
        $narrative = trim((string) ($payload['narrative'] ?? ''));
        $inputLines = is_array($payload['lines']) ? $payload['lines'] : [];

        $normalizedLines = [];
        $totalDebits = 0.0;
        $totalCredits = 0.0;

        foreach ($inputLines as $line) {
            $accountCode = strtoupper(trim((string) ($line['accountCode'] ?? '')));
            $debit = isset($line['debit']) ? (float) $line['debit'] : 0.0;
            $credit = isset($line['credit']) ? (float) $line['credit'] : 0.0;

            if ($debit > 0 && $credit > 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Each line must contain either a debit or a credit amount, not both.',
                ], 422);
            }

            if ($debit <= 0 && $credit <= 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Each line must contain a positive debit or credit amount.',
                ], 422);
            }

            $amount = $debit > 0 ? $debit : -$credit;

            $normalizedLines[] = [
                'accountCode' => $accountCode,
                'amount' => $amount,
            ];

            $totalDebits += max($debit, 0);
            $totalCredits += max($credit, 0);
        }

        if (abs($totalDebits - $totalCredits) > 0.00001) {
            return response()->json([
                'success' => false,
                'message' => 'Journal entry is not balanced. Total debits must equal total credits.',
            ], 422);
        }

        try {
            $result = DB::transaction(function () use ($tranDate, $narrative, $normalizedLines, $totalDebits) {
                $periodNo = $this->resolvePeriodForDate($tranDate);

                $systype = DB::table('systypes')
                    ->where('typeid', 0)
                    ->lockForUpdate()
                    ->first();

                if (!$systype) {
                    DB::table('systypes')->insert([
                        'typeid' => 0,
                        'typename' => 'Journal - GL',
                        'typeno' => 1,
                    ]);
                    $typeNo = 1;
                } else {
                    $typeNo = (int) $systype->typeno;
                }

                DB::table('systypes')
                    ->where('typeid', 0)
                    ->update(['typeno' => $typeNo + 1]);

                foreach ($normalizedLines as $line) {
                    DB::table('gltrans')->insert([
                        'type' => 0,
                        'typeno' => $typeNo,
                        'chequeno' => 0,
                        'trandate' => $tranDate,
                        'periodno' => $periodNo,
                        'account' => $line['accountCode'],
                        'narrative' => $narrative,
                        'amount' => $line['amount'],
                        'posted' => 1,
                        'jobref' => '',
                        'tag' => 0,
                    ]);

                    $chartRow = DB::table('chartdetails')
                        ->where('accountcode', $line['accountCode'])
                        ->where('period', $periodNo)
                        ->lockForUpdate()
                        ->first();

                    if ($chartRow) {
                        DB::table('chartdetails')
                            ->where('accountcode', $line['accountCode'])
                            ->where('period', $periodNo)
                            ->update([
                                'actual' => (float) $chartRow->actual + (float) $line['amount'],
                            ]);
                    } else {
                        DB::table('chartdetails')->insert([
                            'accountcode' => $line['accountCode'],
                            'period' => $periodNo,
                            'budget' => 0,
                            'actual' => (float) $line['amount'],
                            'bfwd' => 0,
                            'bfwdbudget' => 0,
                        ]);
                    }
                }

                return [
                    'reference' => 'Journal - GL #' . $typeNo,
                    'type' => 0,
                    'typeNo' => $typeNo,
                    'periodNo' => $periodNo,
                    'lineCount' => count($normalizedLines),
                    'totalDebits' => $totalDebits,
                ];
            }, 5);

            return response()->json([
                'success' => true,
                'message' => 'Journal entry posted successfully.',
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function createAccount(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'accountCode' => ['required', 'string', 'max:20'],
            'accountName' => ['required', 'string', 'max:50'],
            'groupName' => ['required', 'string', 'max:20'],
            'cashFlowsActivity' => ['required', 'integer', 'between:-1,4'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $accountCode = trim((string) $payload['accountCode']);

        try {
            $created = DB::transaction(function () use ($payload, $accountCode) {
                $groupExists = DB::table('accountgroups')->where('groupname', $payload['groupName'])->exists();
                if (!$groupExists) {
                    throw new \RuntimeException('Account group does not exist.');
                }

                $exists = DB::table('chartmaster')->where('accountcode', $accountCode)->exists();
                if ($exists) {
                    throw new \RuntimeException('The account code already exists.');
                }

                DB::table('chartmaster')->insert([
                    'accountcode' => $accountCode,
                    'accountname' => trim((string) $payload['accountName']),
                    'group_' => trim((string) $payload['groupName']),
                    'cashflowsactivity' => (int) $payload['cashFlowsActivity'],
                ]);

                $this->ensureChartDetailsForAccount($accountCode);

                return [
                    'accountCode' => $accountCode,
                    'accountName' => trim((string) $payload['accountName']),
                ];
            }, 5);

            return response()->json([
                'success' => true,
                'data' => $created,
                'message' => 'The new general ledger account has been added.',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function updateAccount(Request $request, string $accountCode)
    {
        $validator = Validator::make($request->all(), [
            'accountName' => ['required', 'string', 'max:50'],
            'groupName' => ['required', 'string', 'max:20'],
            'cashFlowsActivity' => ['required', 'integer', 'between:-1,4'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $accountCode = trim($accountCode);

        try {
            DB::transaction(function () use ($payload, $accountCode) {
                $exists = DB::table('chartmaster')->where('accountcode', $accountCode)->exists();
                if (!$exists) {
                    throw new \RuntimeException('Account not found.');
                }

                $groupExists = DB::table('accountgroups')->where('groupname', $payload['groupName'])->exists();
                if (!$groupExists) {
                    throw new \RuntimeException('Account group does not exist.');
                }

                DB::table('chartmaster')
                    ->where('accountcode', $accountCode)
                    ->update([
                        'accountname' => trim((string) $payload['accountName']),
                        'group_' => trim((string) $payload['groupName']),
                        'cashflowsactivity' => (int) $payload['cashFlowsActivity'],
                    ]);
            }, 5);

            return response()->json([
                'success' => true,
                'message' => 'The general ledger account has been updated.',
                'data' => [
                    'accountCode' => $accountCode,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function deleteAccount(string $accountCode)
    {
        $accountCode = trim($accountCode);

        try {
            $dependencies = $this->accountDependencyCounts($accountCode);

            $blockingDependencies = array_values(array_filter($dependencies, static function (array $entry) {
                return $entry['count'] > 0;
            }));

            if (count($blockingDependencies) > 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete this account because dependent records exist.',
                    'dependencies' => $blockingDependencies,
                ], 409);
            }

            DB::transaction(function () use ($accountCode) {
                DB::table('chartdetails')->where('accountcode', $accountCode)->delete();
                DB::table('glaccountusers')->where('accountcode', $accountCode)->delete();
                DB::table('chartmaster')->where('accountcode', $accountCode)->delete();
            }, 5);

            return response()->json([
                'success' => true,
                'message' => sprintf('Account %s has been deleted.', $accountCode),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function changeAccountCode(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'oldAccountCode' => ['required', 'string', 'max:20'],
            'newAccountCode' => ['required', 'string', 'max:20'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $oldAccountCode = strtoupper(trim((string) $request->input('oldAccountCode')));
        $newAccountCode = strtoupper(trim((string) $request->input('newAccountCode')));

        if ($oldAccountCode === $newAccountCode) {
            return response()->json([
                'success' => false,
                'message' => 'Old and new account codes must be different.',
            ], 422);
        }

        if (!preg_match('/^[A-Z0-9._-]+$/', $newAccountCode)) {
            return response()->json([
                'success' => false,
                'message' => 'The new GL account code contains illegal characters.',
            ], 422);
        }

        try {
            DB::transaction(function () use ($oldAccountCode, $newAccountCode) {
                $oldExists = DB::table('chartmaster')->where('accountcode', $oldAccountCode)->exists();
                if (!$oldExists) {
                    throw new \RuntimeException('The old GL account code does not exist.');
                }

                $newExists = DB::table('chartmaster')->where('accountcode', $newAccountCode)->exists();
                if ($newExists) {
                    throw new \RuntimeException('The replacement GL account code already exists.');
                }

                $oldRow = DB::table('chartmaster')
                    ->where('accountcode', $oldAccountCode)
                    ->select('accountname', 'group_', 'cashflowsactivity')
                    ->first();

                DB::table('chartmaster')->insert([
                    'accountcode' => $newAccountCode,
                    'accountname' => (string) $oldRow->accountname,
                    'group_' => (string) $oldRow->group_,
                    'cashflowsactivity' => (int) $oldRow->cashflowsactivity,
                ]);

                $fieldMap = [
                    ['table' => 'bankaccounts', 'column' => 'accountcode'],
                    ['table' => 'bankaccountusers', 'column' => 'accountcode'],
                    ['table' => 'banktrans', 'column' => 'bankact'],
                    ['table' => 'chartdetails', 'column' => 'accountcode'],
                    ['table' => 'cogsglpostings', 'column' => 'glcode'],
                    ['table' => 'companies', 'column' => 'debtorsact'],
                    ['table' => 'companies', 'column' => 'pytdiscountact'],
                    ['table' => 'companies', 'column' => 'creditorsact'],
                    ['table' => 'companies', 'column' => 'payrollact'],
                    ['table' => 'companies', 'column' => 'grnact'],
                    ['table' => 'companies', 'column' => 'exchangediffact'],
                    ['table' => 'companies', 'column' => 'purchasesexchangediffact'],
                    ['table' => 'companies', 'column' => 'retainedearnings'],
                    ['table' => 'companies', 'column' => 'freightact'],
                    ['table' => 'fixedassetcategories', 'column' => 'costact'],
                    ['table' => 'fixedassetcategories', 'column' => 'depnact'],
                    ['table' => 'fixedassetcategories', 'column' => 'disposalact'],
                    ['table' => 'fixedassetcategories', 'column' => 'accumdepnact'],
                    ['table' => 'glaccountusers', 'column' => 'accountcode'],
                    ['table' => 'gltrans', 'column' => 'account'],
                    ['table' => 'lastcostrollup', 'column' => 'stockact'],
                    ['table' => 'lastcostrollup', 'column' => 'adjglact'],
                    ['table' => 'locations', 'column' => 'glaccountcode'],
                    ['table' => 'pcexpenses', 'column' => 'glaccount'],
                    ['table' => 'pctabs', 'column' => 'glaccountassignment'],
                    ['table' => 'pctabs', 'column' => 'glaccountpcash'],
                    ['table' => 'purchorderdetails', 'column' => 'glcode'],
                    ['table' => 'salesglpostings', 'column' => 'discountglcode'],
                    ['table' => 'salesglpostings', 'column' => 'salesglcode'],
                    ['table' => 'stockcategory', 'column' => 'stockact'],
                    ['table' => 'stockcategory', 'column' => 'adjglact'],
                    ['table' => 'stockcategory', 'column' => 'issueglact'],
                    ['table' => 'stockcategory', 'column' => 'purchpricevaract'],
                    ['table' => 'stockcategory', 'column' => 'materialuseagevarac'],
                    ['table' => 'stockcategory', 'column' => 'wipact'],
                    ['table' => 'taxauthorities', 'column' => 'taxglcode'],
                    ['table' => 'taxauthorities', 'column' => 'purchtaxglaccount'],
                    ['table' => 'taxauthorities', 'column' => 'bankacctype'],
                    ['table' => 'workcentres', 'column' => 'overheadrecoveryact'],
                ];

                foreach ($fieldMap as $mapping) {
                    DB::table($mapping['table'])
                        ->where($mapping['column'], $oldAccountCode)
                        ->update([$mapping['column'] => $newAccountCode]);
                }

                DB::table('chartmaster')->where('accountcode', $oldAccountCode)->delete();
            }, 5);

            return response()->json([
                'success' => true,
                'message' => sprintf('GL account code %s was changed to %s.', $oldAccountCode, $newAccountCode),
                'data' => [
                    'oldAccountCode' => $oldAccountCode,
                    'newAccountCode' => $newAccountCode,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function importChartCsv(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => ['required', 'file', 'mimes:csv,txt'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        /** @var UploadedFile $file */
        $file = $request->file('file');

        try {
            $result = DB::transaction(function () use ($file) {
                $handle = fopen($file->getRealPath(), 'rb');
                if ($handle === false) {
                    throw new \RuntimeException('Failed to open uploaded CSV file.');
                }

                $header = fgetcsv($handle);
                if (!is_array($header)) {
                    fclose($handle);
                    throw new \RuntimeException('CSV file is empty.');
                }

                $normalizedHeader = array_map(static function ($item) {
                    return strtoupper(trim((string) $item));
                }, $header);

                $expected = ['ACCOUNT CODE', 'DESCRIPTION', 'ACCOUNT GROUP'];
                if ($normalizedHeader !== $expected) {
                    fclose($handle);
                    throw new \RuntimeException('CSV headers must be: Account Code, Description, Account Group.');
                }

                $line = 1;
                $inserted = 0;

                while (($row = fgetcsv($handle)) !== false) {
                    $line++;

                    if (count($row) < 3) {
                        fclose($handle);
                        throw new \RuntimeException('Invalid CSV format at row ' . $line . '.');
                    }

                    $accountCode = strtoupper(trim((string) $row[0]));
                    $accountName = trim((string) $row[1]);
                    $groupName = trim((string) $row[2]);

                    if ($accountCode === '' && $accountName === '' && $groupName === '') {
                        continue;
                    }

                    if ($accountCode === '' || $accountName === '' || $groupName === '') {
                        fclose($handle);
                        throw new \RuntimeException('Account Code, Description and Account Group are required at row ' . $line . '.');
                    }

                    $groupExists = DB::table('accountgroups')->where('groupname', $groupName)->exists();
                    if (!$groupExists) {
                        fclose($handle);
                        throw new \RuntimeException('Account Group "' . $groupName . '" does not exist (row ' . $line . ').');
                    }

                    $exists = DB::table('chartmaster')->where('accountcode', $accountCode)->exists();
                    if ($exists) {
                        fclose($handle);
                        throw new \RuntimeException('Account code "' . $accountCode . '" already exists (row ' . $line . ').');
                    }

                    DB::table('chartmaster')->insert([
                        'accountcode' => $accountCode,
                        'accountname' => $accountName,
                        'group_' => $groupName,
                        'cashflowsactivity' => -1,
                    ]);

                    $this->ensureChartDetailsForAccount($accountCode);
                    $inserted++;
                }

                fclose($handle);

                return [
                    'inserted' => $inserted,
                ];
            }, 5);

            return response()->json([
                'success' => true,
                'message' => 'Chart of accounts CSV imported successfully.',
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function groups(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 500), 25, 2000);
        $search = trim((string) $request->query('q', ''));

        try {
            $query = DB::table('accountgroups as ag')
                ->leftJoin('accountsection as acs', 'acs.sectionid', '=', 'ag.sectioninaccounts')
                ->leftJoin('chartmaster as cm', 'cm.group_', '=', 'ag.groupname')
                ->select(
                    'ag.groupname',
                    'ag.sectioninaccounts',
                    'ag.pandl',
                    'ag.sequenceintb',
                    'ag.parentgroupname',
                    'acs.sectionname',
                    DB::raw('COUNT(cm.accountcode) AS account_count')
                )
                ->groupBy(
                    'ag.groupname',
                    'ag.sectioninaccounts',
                    'ag.pandl',
                    'ag.sequenceintb',
                    'ag.parentgroupname',
                    'acs.sectionname'
                )
                ->orderBy('ag.sequenceintb')
                ->orderBy('ag.groupname')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('ag.groupname', 'like', $like)
                        ->orWhere('ag.parentgroupname', 'like', $like)
                        ->orWhere('acs.sectionname', 'like', $like);
                });
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'groupName' => (string) $row->groupname,
                        'sectionInAccounts' => (int) $row->sectioninaccounts,
                        'sectionName' => (string) ($row->sectionname ?? ''),
                        'pandL' => (int) $row->pandl,
                        'pandLLabel' => ((int) $row->pandl) === 1 ? 'Yes' : 'No',
                        'sequenceInTB' => (int) $row->sequenceintb,
                        'parentGroupName' => (string) ($row->parentgroupname ?? ''),
                        'accountCount' => (int) $row->account_count,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function createGroup(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'groupName' => ['required', 'string', 'min:1', 'max:20'],
            'sectionInAccounts' => ['required', 'integer', 'min:1', 'max:99999'],
            'sequenceInTB' => ['required', 'integer', 'min:0', 'max:10000'],
            'pandL' => ['required', 'integer', 'in:0,1'],
            'parentGroupName' => ['nullable', 'string', 'max:20'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $groupName = trim((string) $payload['groupName']);

        if (str_contains($groupName, '&') || str_contains($groupName, "'")) {
            return response()->json([
                'success' => false,
                'message' => 'The account group name cannot contain illegal characters.',
            ], 422);
        }

        try {
            DB::transaction(function () use ($payload, $groupName) {
                $exists = DB::table('accountgroups')->where('groupname', $groupName)->exists();
                if ($exists) {
                    throw new \RuntimeException('The account group name already exists.');
                }

                $resolved = $this->resolveInheritedGroupProperties(
                    $groupName,
                    $payload['parentGroupName'] ?? '',
                    (int) $payload['sectionInAccounts'],
                    (int) $payload['sequenceInTB'],
                    (int) $payload['pandL']
                );

                DB::table('accountgroups')->insert([
                    'groupname' => $groupName,
                    'sectioninaccounts' => $resolved['sectionInAccounts'],
                    'sequenceintb' => $resolved['sequenceInTB'],
                    'pandl' => $resolved['pandL'],
                    'parentgroupname' => $resolved['parentGroupName'],
                ]);
            }, 5);

            return response()->json([
                'success' => true,
                'message' => 'Account group inserted.',
                'data' => [
                    'groupName' => $groupName,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function updateGroup(Request $request, string $selectedGroupName)
    {
        $validator = Validator::make($request->all(), [
            'groupName' => ['required', 'string', 'min:1', 'max:20'],
            'sectionInAccounts' => ['required', 'integer', 'min:1', 'max:99999'],
            'sequenceInTB' => ['required', 'integer', 'min:0', 'max:10000'],
            'pandL' => ['required', 'integer', 'in:0,1'],
            'parentGroupName' => ['nullable', 'string', 'max:20'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $selectedGroupName = trim($selectedGroupName);
        $groupName = trim((string) $payload['groupName']);

        if (str_contains($groupName, '&') || str_contains($groupName, "'")) {
            return response()->json([
                'success' => false,
                'message' => 'The account group name cannot contain illegal characters.',
            ], 422);
        }

        try {
            DB::transaction(function () use ($payload, $selectedGroupName, $groupName) {
                $exists = DB::table('accountgroups')->where('groupname', $selectedGroupName)->exists();
                if (!$exists) {
                    throw new \RuntimeException('Account group not found.');
                }

                if ($groupName !== $selectedGroupName) {
                    $nameExists = DB::table('accountgroups')->where('groupname', $groupName)->exists();
                    if ($nameExists) {
                        throw new \RuntimeException('The account group name already exists.');
                    }

                    DB::table('chartmaster')
                        ->where('group_', $selectedGroupName)
                        ->update(['group_' => $groupName]);

                    DB::table('accountgroups')
                        ->where('parentgroupname', $selectedGroupName)
                        ->update(['parentgroupname' => $groupName]);
                }

                $resolved = $this->resolveInheritedGroupProperties(
                    $groupName,
                    $payload['parentGroupName'] ?? '',
                    (int) $payload['sectionInAccounts'],
                    (int) $payload['sequenceInTB'],
                    (int) $payload['pandL']
                );

                DB::table('accountgroups')
                    ->where('groupname', $selectedGroupName)
                    ->update([
                        'groupname' => $groupName,
                        'sectioninaccounts' => $resolved['sectionInAccounts'],
                        'sequenceintb' => $resolved['sequenceInTB'],
                        'pandl' => $resolved['pandL'],
                        'parentgroupname' => $resolved['parentGroupName'],
                    ]);
            }, 5);

            return response()->json([
                'success' => true,
                'message' => 'Account group updated.',
                'data' => [
                    'groupName' => $groupName,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function deleteGroup(string $groupName)
    {
        $groupName = trim($groupName);

        try {
            $accountCount = (int) DB::table('chartmaster')->where('group_', $groupName)->count();
            if ($accountCount > 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete this account group because general ledger accounts use it.',
                    'accountsUsingGroup' => $accountCount,
                ], 409);
            }

            $childCount = (int) DB::table('accountgroups')->where('parentgroupname', $groupName)->count();
            if ($childCount > 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete this account group because it has child account groups.',
                    'childGroupCount' => $childCount,
                ], 409);
            }

            DB::table('accountgroups')->where('groupname', $groupName)->delete();

            return response()->json([
                'success' => true,
                'message' => sprintf('Account group %s deleted.', $groupName),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function moveGroup(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'originalAccountGroup' => ['required', 'string', 'max:20'],
            'destinyAccountGroup' => ['required', 'string', 'max:20'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $original = trim((string) $request->input('originalAccountGroup'));
        $destiny = trim((string) $request->input('destinyAccountGroup'));

        if ($original === $destiny) {
            return response()->json([
                'success' => false,
                'message' => 'Origin and destination group must be different.',
            ], 422);
        }

        try {
            $updated = DB::table('chartmaster')
                ->where('group_', $original)
                ->update(['group_' => $destiny]);

            return response()->json([
                'success' => true,
                'message' => 'All accounts in the original group were moved.',
                'data' => [
                    'updatedAccounts' => (int) $updated,
                    'originalAccountGroup' => $original,
                    'destinyAccountGroup' => $destiny,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function sections(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 200), 20, 1000);
        $search = trim((string) $request->query('q', ''));

        try {
            $this->ensureMinimumAccountSections();

            $query = DB::table('accountsection as acs')
                ->leftJoin('accountgroups as ag', 'ag.sectioninaccounts', '=', 'acs.sectionid')
                ->select(
                    'acs.sectionid',
                    'acs.sectionname',
                    DB::raw('COUNT(ag.groupname) AS group_count')
                )
                ->groupBy('acs.sectionid', 'acs.sectionname')
                ->orderBy('acs.sectionid')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('acs.sectionname', 'like', $like)
                        ->orWhere('acs.sectionid', 'like', $like);
                });
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(static function ($row) {
                    return [
                        'sectionId' => (int) $row->sectionid,
                        'sectionName' => (string) $row->sectionname,
                        'groupCount' => (int) $row->group_count,
                        'restricted' => in_array((int) $row->sectionid, [1, 2], true),
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function createSection(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'sectionId' => ['required', 'integer', 'min:1', 'max:99999'],
            'sectionName' => ['required', 'string', 'min:1', 'max:255'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $sectionId = (int) $request->input('sectionId');
        $sectionName = trim((string) $request->input('sectionName'));

        try {
            $exists = DB::table('accountsection')->where('sectionid', $sectionId)->exists();
            if ($exists) {
                return response()->json([
                    'success' => false,
                    'message' => 'The account section already exists.',
                ], 409);
            }

            DB::table('accountsection')->insert([
                'sectionid' => $sectionId,
                'sectionname' => $sectionName,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Account section inserted.',
                'data' => [
                    'sectionId' => $sectionId,
                    'sectionName' => $sectionName,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function updateSection(Request $request, int $sectionId)
    {
        $validator = Validator::make($request->all(), [
            'sectionName' => ['required', 'string', 'min:1', 'max:255'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $sectionName = trim((string) $request->input('sectionName'));

        try {
            $exists = DB::table('accountsection')->where('sectionid', $sectionId)->exists();
            if (!$exists) {
                return response()->json([
                    'success' => false,
                    'message' => 'Account section not found.',
                ], 404);
            }

            DB::table('accountsection')
                ->where('sectionid', $sectionId)
                ->update(['sectionname' => $sectionName]);

            return response()->json([
                'success' => true,
                'message' => 'Account section updated.',
                'data' => [
                    'sectionId' => $sectionId,
                    'sectionName' => $sectionName,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function deleteSection(int $sectionId)
    {
        if (in_array($sectionId, [1, 2], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Sections 1 and 2 are restricted and cannot be deleted.',
            ], 409);
        }

        try {
            $groupCount = (int) DB::table('accountgroups')->where('sectioninaccounts', $sectionId)->count();
            if ($groupCount > 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete this section because account groups use it.',
                    'groupCount' => $groupCount,
                ], 409);
            }

            DB::table('accountsection')->where('sectionid', $sectionId)->delete();

            return response()->json([
                'success' => true,
                'message' => sprintf('Account section %d deleted.', $sectionId),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function lookups()
    {
        try {
            $groups = DB::table('accountgroups')
                ->select('groupname', 'sectioninaccounts', 'pandl', 'sequenceintb', 'parentgroupname')
                ->orderBy('sequenceintb')
                ->orderBy('groupname')
                ->get();

            $sections = DB::table('accountsection')
                ->select('sectionid', 'sectionname')
                ->orderBy('sectionid')
                ->get();

            $cashFlowActivities = [
                ['value' => -1, 'label' => 'Not set up'],
                ['value' => 0, 'label' => 'No effect on cash flow'],
                ['value' => 1, 'label' => 'Operating activity'],
                ['value' => 2, 'label' => 'Investing activity'],
                ['value' => 3, 'label' => 'Financing activity'],
                ['value' => 4, 'label' => 'Cash or cash equivalent'],
            ];

            return response()->json([
                'success' => true,
                'data' => [
                    'groups' => $groups->map(static function ($row) {
                        return [
                            'groupName' => (string) $row->groupname,
                            'sectionInAccounts' => (int) $row->sectioninaccounts,
                            'pandL' => (int) $row->pandl,
                            'sequenceInTB' => (int) $row->sequenceintb,
                            'parentGroupName' => (string) ($row->parentgroupname ?? ''),
                        ];
                    }),
                    'sections' => $sections->map(static function ($row) {
                        return [
                            'sectionId' => (int) $row->sectionid,
                            'sectionName' => (string) $row->sectionname,
                        ];
                    }),
                    'cashFlowActivities' => $cashFlowActivities,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [
                    'groups' => [],
                    'sections' => [],
                    'cashFlowActivities' => [],
                ],
            ]);
        }
    }

    public function settings()
    {
        try {
            $company = DB::table('companies')
                ->orderBy('coycode')
                ->select('coycode', 'coyname', 'currencydefault')
                ->first();

            $currencyCode = strtoupper(trim((string) ($company->currencydefault ?? '')));
            if ($currencyCode === '') {
                $currencyCode = 'USD';
            }

            $currency = DB::table('currencies')
                ->where('currabrev', $currencyCode)
                ->select('currency', 'currabrev', 'decimalplaces', 'hundredsname')
                ->first();

            $dateFormat = (string) (DB::table('config')
                ->where('confname', 'DefaultDateFormat')
                ->value('confvalue') ?? 'Y-m-d');

            return response()->json([
                'success' => true,
                'data' => [
                    'companyCode' => (int) ($company->coycode ?? 1),
                    'companyName' => (string) ($company->coyname ?? 'Company'),
                    'currencyCode' => (string) ($currency->currabrev ?? $currencyCode),
                    'currencyName' => (string) ($currency->currency ?? $currencyCode),
                    'currencyDecimalPlaces' => (int) ($currency->decimalplaces ?? 2),
                    'hundredsName' => (string) ($currency->hundredsname ?? ''),
                    'dateFormat' => $dateFormat,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [
                    'companyCode' => 1,
                    'companyName' => 'Company',
                    'currencyCode' => 'USD',
                    'currencyName' => 'US Dollar',
                    'currencyDecimalPlaces' => 2,
                    'hundredsName' => 'Cents',
                    'dateFormat' => 'Y-m-d',
                ],
            ]);
        }
    }

    public function trialBalance(Request $request)
    {
        $period = (int) $request->query('period', 0);
        $search = trim((string) $request->query('q', ''));
        $includeZero = strtolower(trim((string) $request->query('includeZero', 'false'))) === 'true';
        $limit = $this->safeLimit($request->query('limit', 2000), 500, 5000);

        try {
            $latestPeriod = (int) (DB::table('periods')->max('periodno') ?? 0);
            $periodToUse = $period > 0 ? $period : $latestPeriod;

            $query = DB::table('chartmaster as cm')
                ->join('accountgroups as ag', 'ag.groupname', '=', 'cm.group_')
                ->leftJoin('accountsection as acs', 'acs.sectionid', '=', 'ag.sectioninaccounts')
                ->leftJoin('chartdetails as cd', function ($join) use ($periodToUse) {
                    $join
                        ->on('cd.accountcode', '=', 'cm.accountcode')
                        ->where('cd.period', '=', $periodToUse);
                })
                ->select(
                    'cm.accountcode',
                    'cm.accountname',
                    'cm.group_',
                    'ag.sectioninaccounts',
                    'ag.pandl',
                    'ag.sequenceintb',
                    'acs.sectionname',
                    DB::raw('COALESCE(cd.bfwd + cd.actual, 0) AS balance'),
                    DB::raw('COALESCE(cd.bfwdbudget + cd.budget, 0) AS budget')
                )
                ->orderBy('ag.sequenceintb')
                ->orderBy('cm.accountcode')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('cm.accountcode', 'like', $like)
                        ->orWhere('cm.accountname', 'like', $like)
                        ->orWhere('cm.group_', 'like', $like)
                        ->orWhere('acs.sectionname', 'like', $like);
                });
            }

            if (!$includeZero) {
                $query->whereRaw('COALESCE(cd.bfwd + cd.actual, 0) <> 0');
            }

            $rows = $query->get();

            $data = $rows->map(function ($row) {
                $balance = (float) $row->balance;
                return [
                    'accountCode' => (string) $row->accountcode,
                    'accountName' => (string) $row->accountname,
                    'groupName' => (string) $row->group_,
                    'sectionId' => (int) $row->sectioninaccounts,
                    'sectionName' => (string) ($row->sectionname ?? ''),
                    'accountType' => (int) $row->pandl,
                    'accountTypeLabel' => ((int) $row->pandl) === 1 ? 'Profit/Loss' : 'Balance Sheet',
                    'balance' => $balance,
                    'debit' => $balance >= 0 ? $balance : 0.0,
                    'credit' => $balance < 0 ? abs($balance) : 0.0,
                    'budget' => (float) $row->budget,
                    'variance' => $balance - (float) $row->budget,
                ];
            });

            $totalDebits = (float) $data->sum('debit');
            $totalCredits = (float) $data->sum('credit');

            return response()->json([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'period' => $periodToUse,
                    'latestPeriod' => $latestPeriod,
                    'summary' => [
                        'accounts' => (int) $data->count(),
                        'totalDebits' => $totalDebits,
                        'totalCredits' => $totalCredits,
                        'difference' => $totalDebits - $totalCredits,
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'period' => 0,
                    'latestPeriod' => 0,
                    'summary' => [
                        'accounts' => 0,
                        'totalDebits' => 0,
                        'totalCredits' => 0,
                        'difference' => 0,
                    ],
                ],
            ]);
        }
    }

    public function cashFlowReport(Request $request)
    {
        $dateFrom = trim((string) $request->query('dateFrom', ''));
        $dateTo = trim((string) $request->query('dateTo', ''));

        try {
            $query = DB::table('gltrans as gl')
                ->join('chartmaster as cm', 'cm.accountcode', '=', 'gl.account')
                ->select(
                    'cm.cashflowsactivity',
                    DB::raw('SUM(CASE WHEN gl.amount > 0 THEN gl.amount ELSE 0 END) AS inflow'),
                    DB::raw('SUM(CASE WHEN gl.amount < 0 THEN ABS(gl.amount) ELSE 0 END) AS outflow'),
                    DB::raw('SUM(gl.amount) AS net')
                )
                ->groupBy('cm.cashflowsactivity')
                ->orderBy('cm.cashflowsactivity');

            if ($dateFrom !== '') {
                $query->whereDate('gl.trandate', '>=', $dateFrom);
            }

            if ($dateTo !== '') {
                $query->whereDate('gl.trandate', '<=', $dateTo);
            }

            $rows = $query->get();

            $data = $rows->map(function ($row) {
                $activity = (int) $row->cashflowsactivity;
                return [
                    'activity' => $activity,
                    'activityName' => $this->cashFlowActivityName($activity),
                    'inflow' => (float) $row->inflow,
                    'outflow' => (float) $row->outflow,
                    'net' => (float) $row->net,
                ];
            });

            return response()->json([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'summary' => [
                        'totalInflow' => (float) $data->sum('inflow'),
                        'totalOutflow' => (float) $data->sum('outflow'),
                        'netCashFlow' => (float) $data->sum('net'),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'summary' => [
                        'totalInflow' => 0,
                        'totalOutflow' => 0,
                        'netCashFlow' => 0,
                    ],
                ],
            ]);
        }
    }

    public function bankAccounts()
    {
        try {
            if (!Schema::hasTable('bankaccounts')) {
                return response()->json([
                    'success' => true,
                    'data' => [],
                ]);
            }

            $latestPeriod = (int) (DB::table('periods')->max('periodno') ?? 0);

            $rows = DB::table('bankaccounts as ba')
                ->leftJoin('chartmaster as cm', 'cm.accountcode', '=', 'ba.accountcode')
                ->leftJoin('currencies as cur', 'cur.currabrev', '=', 'ba.currcode')
                ->leftJoin('chartdetails as cd', function ($join) use ($latestPeriod) {
                    $join
                        ->on('cd.accountcode', '=', 'ba.accountcode')
                        ->where('cd.period', '=', $latestPeriod);
                })
                ->select(
                    'ba.accountcode',
                    'ba.currcode',
                    'ba.invoice',
                    'ba.bankaccountcode',
                    'ba.bankaccountname',
                    'ba.bankaccountnumber',
                    'ba.bankaddress',
                    'ba.importformat',
                    'cm.accountname',
                    'cur.currency',
                    'cur.decimalplaces',
                    DB::raw('COALESCE(cd.bfwd + cd.actual, 0) AS balance')
                )
                ->orderBy('ba.accountcode')
                ->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(static function ($row) {
                    return [
                        'accountCode' => (string) $row->accountcode,
                        'accountName' => (string) ($row->accountname ?? ''),
                        'bankAccountName' => trim((string) ($row->bankaccountname ?? '')),
                        'bankAccountCode' => trim((string) ($row->bankaccountcode ?? '')),
                        'bankAccountNumber' => trim((string) ($row->bankaccountnumber ?? '')),
                        'bankAddress' => trim((string) ($row->bankaddress ?? '')),
                        'currencyCode' => (string) ($row->currcode ?? ''),
                        'currencyName' => (string) ($row->currency ?? ''),
                        'currencyDecimalPlaces' => (int) ($row->decimalplaces ?? 2),
                        'importFormat' => (string) ($row->importformat ?? ''),
                        'invoiceMode' => (int) ($row->invoice ?? 0),
                        'balance' => (float) $row->balance,
                    ];
                }),
                'meta' => [
                    'summary' => [
                        'accounts' => (int) $rows->count(),
                        'totalBalance' => (float) $rows->sum('balance'),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'summary' => [
                        'accounts' => 0,
                        'totalBalance' => 0,
                    ],
                ],
            ]);
        }
    }

    public function createBankAccount(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'accountCode' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode', 'unique:bankaccounts,accountcode'],
            'currCode' => ['required', 'string', 'size:3', 'exists:currencies,currabrev'],
            'invoiceMode' => ['required', 'integer', 'between:0,2'],
            'bankAccountCode' => ['nullable', 'string', 'max:50'],
            'bankAccountName' => ['required', 'string', 'max:50'],
            'bankAccountNumber' => ['nullable', 'string', 'max:50'],
            'bankAddress' => ['nullable', 'string', 'max:50'],
            'importFormat' => ['nullable', 'string', 'max:10'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();

        try {
            DB::table('bankaccounts')->insert([
                'accountcode' => strtoupper(trim((string) $payload['accountCode'])),
                'currcode' => strtoupper(trim((string) $payload['currCode'])),
                'invoice' => (int) $payload['invoiceMode'],
                'bankaccountcode' => trim((string) ($payload['bankAccountCode'] ?? '')),
                'bankaccountname' => trim((string) $payload['bankAccountName']),
                'bankaccountnumber' => trim((string) ($payload['bankAccountNumber'] ?? '')),
                'bankaddress' => trim((string) ($payload['bankAddress'] ?? '')),
                'importformat' => trim((string) ($payload['importFormat'] ?? '')),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Bank account created.',
                'data' => [
                    'accountCode' => strtoupper(trim((string) $payload['accountCode'])),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function updateBankAccount(Request $request, string $accountCode)
    {
        $validator = Validator::make($request->all(), [
            'currCode' => ['required', 'string', 'size:3', 'exists:currencies,currabrev'],
            'invoiceMode' => ['required', 'integer', 'between:0,2'],
            'bankAccountCode' => ['nullable', 'string', 'max:50'],
            'bankAccountName' => ['required', 'string', 'max:50'],
            'bankAccountNumber' => ['nullable', 'string', 'max:50'],
            'bankAddress' => ['nullable', 'string', 'max:50'],
            'importFormat' => ['nullable', 'string', 'max:10'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $accountCode = strtoupper(trim($accountCode));

        try {
            $exists = DB::table('bankaccounts')->where('accountcode', $accountCode)->exists();
            if (!$exists) {
                return response()->json([
                    'success' => false,
                    'message' => 'Bank account not found.',
                ], 404);
            }

            DB::table('bankaccounts')
                ->where('accountcode', $accountCode)
                ->update([
                    'currcode' => strtoupper(trim((string) $payload['currCode'])),
                    'invoice' => (int) $payload['invoiceMode'],
                    'bankaccountcode' => trim((string) ($payload['bankAccountCode'] ?? '')),
                    'bankaccountname' => trim((string) $payload['bankAccountName']),
                    'bankaccountnumber' => trim((string) ($payload['bankAccountNumber'] ?? '')),
                    'bankaddress' => trim((string) ($payload['bankAddress'] ?? '')),
                    'importformat' => trim((string) ($payload['importFormat'] ?? '')),
                ]);

            return response()->json([
                'success' => true,
                'message' => 'Bank account updated.',
                'data' => [
                    'accountCode' => $accountCode,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function deleteBankAccount(string $accountCode)
    {
        $accountCode = strtoupper(trim($accountCode));

        try {
            $bankTransCount = (int) DB::table('banktrans')->where('bankact', $accountCode)->count();
            if ($bankTransCount > 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete bank account because transactions exist.',
                    'bankTransactionCount' => $bankTransCount,
                ], 409);
            }

            $userLinkCount = (int) DB::table('bankaccountusers')->where('accountcode', $accountCode)->count();
            if ($userLinkCount > 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete bank account because user authorisations exist.',
                    'userLinkCount' => $userLinkCount,
                ], 409);
            }

            DB::table('bankaccounts')->where('accountcode', $accountCode)->delete();

            return response()->json([
                'success' => true,
                'message' => sprintf('Bank account %s deleted.', $accountCode),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function createBankTransaction(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'kind' => ['required', 'string', 'in:payment,receipt'],
            'bankAccountCode' => ['required', 'string', 'max:20', 'exists:bankaccounts,accountcode'],
            'tranDate' => ['required', 'date_format:Y-m-d'],
            'reference' => ['nullable', 'string', 'max:50'],
            'chequeNo' => ['nullable', 'string', 'max:16'],
            'narrative' => ['nullable', 'string', 'max:200'],
            'currencyCode' => ['nullable', 'string', 'size:3'],
            'exRate' => ['nullable', 'numeric', 'gt:0'],
            'functionalExRate' => ['nullable', 'numeric', 'gt:0'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.accountCode' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'lines.*.amount' => ['required', 'numeric', 'gt:0'],
            'lines.*.narrative' => ['nullable', 'string', 'max:200'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $kind = strtolower(trim((string) $payload['kind']));
        $bankAccountCode = strtoupper(trim((string) $payload['bankAccountCode']));
        $tranDate = (string) $payload['tranDate'];
        $reference = trim((string) ($payload['reference'] ?? ''));
        $chequeNo = trim((string) ($payload['chequeNo'] ?? ''));
        $narrative = trim((string) ($payload['narrative'] ?? ''));
        $exRate = isset($payload['exRate']) ? (float) $payload['exRate'] : 1.0;
        $functionalExRate = isset($payload['functionalExRate']) ? (float) $payload['functionalExRate'] : 1.0;

        $lineItems = is_array($payload['lines']) ? $payload['lines'] : [];
        $total = 0.0;
        foreach ($lineItems as $line) {
            $total += (float) $line['amount'];
        }

        if ($total <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'Transaction amount must be greater than zero.',
            ], 422);
        }

        try {
            $result = DB::transaction(function () use (
                $kind,
                $bankAccountCode,
                $tranDate,
                $reference,
                $chequeNo,
                $narrative,
                $exRate,
                $functionalExRate,
                $lineItems,
                $total
            ) {
                $bankAccount = DB::table('bankaccounts')
                    ->where('accountcode', $bankAccountCode)
                    ->select('currcode')
                    ->first();

                if (!$bankAccount) {
                    throw new \RuntimeException('Bank account not found.');
                }

                $currencyCode = strtoupper(trim((string) ($bankAccount->currcode ?? '')));
                if ($currencyCode === '') {
                    $currencyCode = 'USD';
                }

                $periodNo = $this->resolvePeriodForDate($tranDate);
                $isPayment = $kind === 'payment';
                $typeId = $isPayment ? 1 : 2;
                $typeName = $isPayment ? 'Payment - GL' : 'Receipt - GL';
                $typeNo = $this->nextSystemTypeNumber($typeId, $typeName);
                $bankAmount = $isPayment ? -abs($total) : abs($total);

                DB::table('banktrans')->insert([
                    'type' => $typeId,
                    'transno' => $typeNo,
                    'bankact' => $bankAccountCode,
                    'ref' => $reference,
                    'amountcleared' => 0,
                    'exrate' => $exRate,
                    'functionalexrate' => $functionalExRate,
                    'transdate' => $tranDate,
                    'banktranstype' => $isPayment ? 'Payment' : 'Receipt',
                    'amount' => $bankAmount,
                    'currcode' => $currencyCode,
                    'chequeno' => $chequeNo,
                ]);

                DB::table('gltrans')->insert([
                    'type' => $typeId,
                    'typeno' => $typeNo,
                    'chequeno' => 0,
                    'trandate' => $tranDate,
                    'periodno' => $periodNo,
                    'account' => $bankAccountCode,
                    'narrative' => $narrative,
                    'amount' => $bankAmount,
                    'posted' => 1,
                    'jobref' => '',
                    'tag' => 0,
                ]);
                $this->applyChartDetailAmount($bankAccountCode, $periodNo, $bankAmount);

                foreach ($lineItems as $line) {
                    $lineAccount = strtoupper(trim((string) $line['accountCode']));
                    $lineAmountInput = abs((float) $line['amount']);
                    $lineAmount = $isPayment ? $lineAmountInput : -$lineAmountInput;
                    $lineNarrative = trim((string) ($line['narrative'] ?? ''));

                    DB::table('gltrans')->insert([
                        'type' => $typeId,
                        'typeno' => $typeNo,
                        'chequeno' => 0,
                        'trandate' => $tranDate,
                        'periodno' => $periodNo,
                        'account' => $lineAccount,
                        'narrative' => $lineNarrative !== '' ? $lineNarrative : $narrative,
                        'amount' => $lineAmount,
                        'posted' => 1,
                        'jobref' => '',
                        'tag' => 0,
                    ]);
                    $this->applyChartDetailAmount($lineAccount, $periodNo, $lineAmount);
                }

                return [
                    'type' => $typeId,
                    'typeNo' => $typeNo,
                    'reference' => ($isPayment ? 'Payment - GL' : 'Receipt - GL') . ' #' . $typeNo,
                    'amount' => abs($total),
                    'currencyCode' => $currencyCode,
                    'lineCount' => count($lineItems) + 1,
                ];
            }, 5);

            return response()->json([
                'success' => true,
                'message' => 'Bank transaction posted successfully.',
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function importBankTransactionsCsv(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => ['required', 'file', 'mimes:csv,txt'],
            'bankAccountCode' => ['nullable', 'string', 'max:20', 'exists:bankaccounts,accountcode'],
            'defaultKind' => ['nullable', 'string', 'in:payment,receipt'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        /** @var UploadedFile $file */
        $file = $request->file('file');
        $defaultBankAccount = strtoupper(trim((string) $request->input('bankAccountCode', '')));
        $defaultKind = strtolower(trim((string) $request->input('defaultKind', '')));

        if (!$file || !$file->isValid()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid CSV file upload.',
            ], 422);
        }

        $handle = fopen($file->getRealPath(), 'rb');
        if ($handle === false) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to open uploaded file.',
            ], 422);
        }

        $headerRow = fgetcsv($handle);
        if ($headerRow === false || !is_array($headerRow) || count($headerRow) === 0) {
            fclose($handle);
            return response()->json([
                'success' => false,
                'message' => 'The CSV file does not contain a header row.',
            ], 422);
        }

        $headers = array_map(static fn ($value) => strtolower(trim((string) $value)), $headerRow);
        $imported = 0;
        $skipped = 0;
        $errors = [];
        $lineNo = 1;

        try {
            DB::transaction(function () use (
                $handle,
                $headers,
                $defaultBankAccount,
                $defaultKind,
                &$imported,
                &$skipped,
                &$errors,
                &$lineNo
            ) {
                while (($row = fgetcsv($handle)) !== false) {
                    $lineNo++;
                    if (!is_array($row) || count($row) === 0) {
                        continue;
                    }

                    $record = [];
                    foreach ($headers as $index => $header) {
                        $record[$header] = isset($row[$index]) ? trim((string) $row[$index]) : '';
                    }

                    $bankAccount = strtoupper(trim((string) (
                        $record['bankaccountcode'] ??
                        $record['bankact'] ??
                        $defaultBankAccount
                    )));
                    if ($bankAccount === '') {
                        $skipped++;
                        $errors[] = "Line {$lineNo}: bank account code is required.";
                        continue;
                    }

                    $bankAccountRow = DB::table('bankaccounts')
                        ->where('accountcode', $bankAccount)
                        ->select('currcode')
                        ->first();
                    if (!$bankAccountRow) {
                        $skipped++;
                        $errors[] = "Line {$lineNo}: bank account {$bankAccount} not found.";
                        continue;
                    }

                    $dateValue = trim((string) (
                        $record['transdate'] ??
                        $record['date'] ??
                        $record['trandate'] ??
                        ''
                    ));
                    if ($dateValue === '' || !$this->isValidIsoDate($dateValue)) {
                        $skipped++;
                        $errors[] = "Line {$lineNo}: invalid date value.";
                        continue;
                    }

                    $amountRaw = (string) ($record['amount'] ?? '');
                    $amount = $this->csvAmountToFloat($amountRaw);
                    if (abs($amount) < 0.000001) {
                        $skipped++;
                        $errors[] = "Line {$lineNo}: amount cannot be zero.";
                        continue;
                    }

                    $kindRaw = strtolower(trim((string) (
                        $record['kind'] ??
                        $record['type'] ??
                        $record['banktranstype'] ??
                        $defaultKind
                    )));

                    $isPayment = false;
                    if (in_array($kindRaw, ['payment', 'payments', 'pay'], true)) {
                        $isPayment = true;
                    } elseif (in_array($kindRaw, ['receipt', 'receipts', 'receive'], true)) {
                        $isPayment = false;
                    } else {
                        $isPayment = $amount < 0;
                    }

                    $typeId = $isPayment ? 1 : 2;
                    $typeName = $isPayment ? 'Payment - GL' : 'Receipt - GL';
                    $signedAmount = $isPayment ? -abs($amount) : abs($amount);
                    $typeNo = $this->nextSystemTypeNumber($typeId, $typeName);

                    $currencyCode = strtoupper(trim((string) ($record['currcode'] ?? '')));
                    if ($currencyCode === '') {
                        $currencyCode = strtoupper(trim((string) ($bankAccountRow->currcode ?? 'USD')));
                    }
                    if ($currencyCode === '') {
                        $currencyCode = 'USD';
                    }

                    $amountCleared = $this->csvAmountToFloat((string) ($record['amountcleared'] ?? '0'));
                    $reference = trim((string) ($record['ref'] ?? ($record['reference'] ?? '')));
                    $chequeNo = trim((string) ($record['chequeno'] ?? ''));

                    DB::table('banktrans')->insert([
                        'type' => $typeId,
                        'transno' => $typeNo,
                        'bankact' => $bankAccount,
                        'ref' => $reference,
                        'amountcleared' => $amountCleared,
                        'exrate' => 1,
                        'functionalexrate' => 1,
                        'transdate' => $dateValue,
                        'banktranstype' => $isPayment ? 'Payment' : 'Receipt',
                        'amount' => $signedAmount,
                        'currcode' => $currencyCode,
                        'chequeno' => $chequeNo,
                    ]);

                    $imported++;
                }
            }, 5);
        } catch (\Throwable $e) {
            fclose($handle);
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }

        fclose($handle);

        return response()->json([
            'success' => true,
            'message' => 'Bank transactions import completed.',
            'data' => [
                'imported' => $imported,
                'skipped' => $skipped,
                'errors' => array_slice($errors, 0, 50),
            ],
        ]);
    }

    public function bankTransactions(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 50), 25, 500);
        $page = $this->safePage($request->query('page', 1));
        $offset = ($page - 1) * $limit;
        $accountCode = strtoupper(trim((string) $request->query('accountCode', '')));
        $dateFrom = trim((string) $request->query('dateFrom', ''));
        $dateTo = trim((string) $request->query('dateTo', ''));
        $matchStatus = strtolower(trim((string) $request->query('matchStatus', 'all')));
        $transactionKind = strtolower(trim((string) $request->query('kind', 'all')));

        try {
            if (!Schema::hasTable('banktrans')) {
                return response()->json([
                    'success' => true,
                    'data' => [],
                    'meta' => [
                        'pagination' => [
                            'page' => $page,
                            'limit' => $limit,
                            'total' => 0,
                            'totalPages' => 0,
                            'hasMore' => false,
                        ],
                    ],
                ]);
            }

            $query = DB::table('banktrans as bt')
                ->leftJoin('bankaccounts as ba', 'ba.accountcode', '=', 'bt.bankact')
                ->leftJoin('systypes as st', 'st.typeid', '=', 'bt.type')
                ->select(
                    'bt.banktransid',
                    'bt.type',
                    'bt.transno',
                    'bt.bankact',
                    'bt.ref',
                    'bt.amountcleared',
                    'bt.exrate',
                    'bt.functionalexrate',
                    'bt.transdate',
                    'bt.banktranstype',
                    'bt.amount',
                    'bt.currcode',
                    'bt.chequeno',
                    'ba.bankaccountname',
                    DB::raw("COALESCE(NULLIF(TRIM(st.typename), ''), 'Bank Transaction') AS typename")
                );

            if ($accountCode !== '') {
                $query->where('bt.bankact', $accountCode);
            }

            if ($dateFrom !== '') {
                $query->whereDate('bt.transdate', '>=', $dateFrom);
            }

            if ($dateTo !== '') {
                $query->whereDate('bt.transdate', '<=', $dateTo);
            }

            if ($matchStatus === 'matched') {
                $query->whereRaw('ABS(bt.amountcleared) > 0.000001');
            } elseif ($matchStatus === 'unmatched') {
                $query->whereRaw('ABS(bt.amountcleared) <= 0.000001');
            }

            if ($transactionKind === 'payments') {
                $query->where('bt.amount', '<', 0);
            } elseif ($transactionKind === 'receipts') {
                $query->where('bt.amount', '>', 0);
            }

            $total = (int) (clone $query)->count();
            $rows = $query
                ->orderByDesc('bt.transdate')
                ->orderByDesc('bt.banktransid')
                ->offset($offset)
                ->limit($limit)
                ->get();

            $totalPages = $total > 0 ? (int) ceil($total / $limit) : 0;

            return response()->json([
                'success' => true,
                'data' => $rows->map(static function ($row) {
                    $amount = (float) $row->amount;
                    return [
                        'id' => (int) $row->banktransid,
                        'date' => (string) $row->transdate,
                        'reference' => trim((string) ($row->ref ?? '')),
                        'bankAccountCode' => (string) $row->bankact,
                        'bankAccountName' => trim((string) ($row->bankaccountname ?? '')),
                        'type' => (int) $row->type,
                        'typeNo' => (int) $row->transno,
                        'typeName' => (string) $row->typename,
                        'chequeNo' => trim((string) ($row->chequeno ?? '')),
                        'currencyCode' => (string) ($row->currcode ?? ''),
                        'bankTransactionType' => (string) ($row->banktranstype ?? ''),
                        'amount' => $amount,
                        'amountCleared' => (float) $row->amountcleared,
                        'status' => abs((float) $row->amountcleared) > 0.000001 ? 'Matched' : 'Unmatched',
                        'direction' => $amount < 0 ? 'Payment' : 'Receipt',
                    ];
                }),
                'meta' => [
                    'summary' => [
                        'entries' => (int) $rows->count(),
                        'totalPayments' => (float) $rows->filter(static fn ($row) => (float) $row->amount < 0)->sum('amount') * -1,
                        'totalReceipts' => (float) $rows->filter(static fn ($row) => (float) $row->amount > 0)->sum('amount'),
                        'net' => (float) $rows->sum('amount'),
                    ],
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => $total,
                        'totalPages' => $totalPages,
                        'hasMore' => $page < $totalPages,
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'summary' => [
                        'entries' => 0,
                        'totalPayments' => 0,
                        'totalReceipts' => 0,
                        'net' => 0,
                    ],
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => 0,
                        'totalPages' => 0,
                        'hasMore' => false,
                    ],
                ],
            ]);
        }
    }

    public function budgets(Request $request)
    {
        $period = (int) $request->query('period', 0);
        $search = trim((string) $request->query('q', ''));
        $limit = $this->safeLimit($request->query('limit', 2000), 500, 5000);

        try {
            $latestPeriod = (int) (DB::table('periods')->max('periodno') ?? 0);
            $periodToUse = $period > 0 ? $period : $latestPeriod;

            $query = DB::table('chartdetails as cd')
                ->join('chartmaster as cm', 'cm.accountcode', '=', 'cd.accountcode')
                ->join('accountgroups as ag', 'ag.groupname', '=', 'cm.group_')
                ->leftJoin('accountsection as acs', 'acs.sectionid', '=', 'ag.sectioninaccounts')
                ->where('cd.period', '=', $periodToUse)
                ->select(
                    'cd.accountcode',
                    'cm.accountname',
                    'cm.group_',
                    'ag.sectioninaccounts',
                    'acs.sectionname',
                    'cd.period',
                    'cd.budget',
                    'cd.actual',
                    'cd.bfwd',
                    'cd.bfwdbudget'
                )
                ->orderBy('ag.sequenceintb')
                ->orderBy('cd.accountcode')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('cd.accountcode', 'like', $like)
                        ->orWhere('cm.accountname', 'like', $like)
                        ->orWhere('cm.group_', 'like', $like)
                        ->orWhere('acs.sectionname', 'like', $like);
                });
            }

            $rows = $query->get();

            $data = $rows->map(static function ($row) {
                $budget = (float) $row->budget;
                $actual = (float) $row->actual;
                return [
                    'accountCode' => (string) $row->accountcode,
                    'accountName' => (string) $row->accountname,
                    'groupName' => (string) $row->group_,
                    'sectionId' => (int) $row->sectioninaccounts,
                    'sectionName' => (string) ($row->sectionname ?? ''),
                    'period' => (int) $row->period,
                    'budget' => $budget,
                    'actual' => $actual,
                    'bfwd' => (float) $row->bfwd,
                    'bfwdBudget' => (float) $row->bfwdbudget,
                    'variance' => $actual - $budget,
                ];
            });

            return response()->json([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'period' => $periodToUse,
                    'latestPeriod' => $latestPeriod,
                    'summary' => [
                        'accounts' => (int) $data->count(),
                        'budget' => (float) $data->sum('budget'),
                        'actual' => (float) $data->sum('actual'),
                        'variance' => (float) $data->sum('variance'),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'period' => 0,
                    'latestPeriod' => 0,
                    'summary' => [
                        'accounts' => 0,
                        'budget' => 0,
                        'actual' => 0,
                        'variance' => 0,
                    ],
                ],
            ]);
        }
    }

    public function tags(Request $request)
    {
        $search = trim((string) $request->query('q', ''));
        $dateFrom = trim((string) $request->query('dateFrom', ''));
        $dateTo = trim((string) $request->query('dateTo', ''));

        try {
            if (!Schema::hasTable('tags')) {
                return response()->json([
                    'success' => true,
                    'data' => [],
                ]);
            }

            $query = DB::table('tags as t')
                ->leftJoin('gltrans as gl', function ($join) use ($dateFrom, $dateTo) {
                    $join->on('gl.tag', '=', 't.tagref');
                    if ($dateFrom !== '') {
                        $join->whereDate('gl.trandate', '>=', $dateFrom);
                    }
                    if ($dateTo !== '') {
                        $join->whereDate('gl.trandate', '<=', $dateTo);
                    }
                })
                ->select(
                    't.tagref',
                    't.tagdescription',
                    DB::raw('COUNT(gl.counterindex) AS transaction_count'),
                    DB::raw('COALESCE(SUM(CASE WHEN gl.amount > 0 THEN gl.amount ELSE 0 END), 0) AS total_debits'),
                    DB::raw('COALESCE(SUM(CASE WHEN gl.amount < 0 THEN ABS(gl.amount) ELSE 0 END), 0) AS total_credits')
                )
                ->groupBy('t.tagref', 't.tagdescription')
                ->orderBy('t.tagref');

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('t.tagdescription', 'like', $like)
                        ->orWhereRaw('CAST(t.tagref AS CHAR) LIKE ?', [$like]);
                });
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(static function ($row) {
                    return [
                        'tagRef' => (int) $row->tagref,
                        'tagDescription' => (string) $row->tagdescription,
                        'transactionCount' => (int) $row->transaction_count,
                        'totalDebits' => (float) $row->total_debits,
                        'totalCredits' => (float) $row->total_credits,
                        'balance' => (float) $row->total_debits - (float) $row->total_credits,
                    ];
                }),
                'meta' => [
                    'summary' => [
                        'tags' => (int) $rows->count(),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'summary' => [
                        'tags' => 0,
                    ],
                ],
            ]);
        }
    }

    public function createTag(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'tagDescription' => ['required', 'string', 'max:50'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $tagRef = DB::table('tags')->insertGetId([
                'tagdescription' => trim((string) $request->input('tagDescription')),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'GL tag created.',
                'data' => [
                    'tagRef' => (int) $tagRef,
                    'tagDescription' => trim((string) $request->input('tagDescription')),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function updateTag(Request $request, int $tagRef)
    {
        $validator = Validator::make($request->all(), [
            'tagDescription' => ['required', 'string', 'max:50'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $exists = DB::table('tags')->where('tagref', $tagRef)->exists();
            if (!$exists) {
                return response()->json([
                    'success' => false,
                    'message' => 'Tag not found.',
                ], 404);
            }

            $tagDescription = trim((string) $request->input('tagDescription'));
            DB::table('tags')->where('tagref', $tagRef)->update(['tagdescription' => $tagDescription]);

            return response()->json([
                'success' => true,
                'message' => 'GL tag updated.',
                'data' => [
                    'tagRef' => $tagRef,
                    'tagDescription' => $tagDescription,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function deleteTag(int $tagRef)
    {
        try {
            $usage = (int) DB::table('gltrans')->where('tag', $tagRef)->count();
            if ($usage > 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete tag because GL transactions reference it.',
                    'transactionCount' => $usage,
                ], 409);
            }

            DB::table('tags')->where('tagref', $tagRef)->delete();

            return response()->json([
                'success' => true,
                'message' => sprintf('GL tag %d deleted.', $tagRef),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function accountUsers(Request $request)
    {
        $scope = strtolower(trim((string) $request->query('scope', 'gl')));

        try {
            if ($scope === 'bank') {
                $rows = DB::table('bankaccountusers as bau')
                    ->leftJoin('www_users as wu', 'wu.userid', '=', 'bau.userid')
                    ->leftJoin('bankaccounts as ba', 'ba.accountcode', '=', 'bau.accountcode')
                    ->leftJoin('chartmaster as cm', 'cm.accountcode', '=', 'bau.accountcode')
                    ->select(
                        'bau.userid',
                        'wu.realname',
                        'wu.email',
                        'bau.accountcode',
                        'ba.bankaccountname',
                        'cm.accountname'
                    )
                    ->orderBy('bau.userid')
                    ->orderBy('bau.accountcode')
                    ->get();

                return response()->json([
                    'success' => true,
                    'data' => $rows->map(static function ($row) {
                        return [
                            'scope' => 'bank',
                            'userId' => (string) $row->userid,
                            'userName' => (string) ($row->realname ?? ''),
                            'email' => (string) ($row->email ?? ''),
                            'accountCode' => (string) $row->accountcode,
                            'accountName' => (string) ($row->accountname ?? ''),
                            'bankAccountName' => trim((string) ($row->bankaccountname ?? '')),
                            'canView' => true,
                            'canUpdate' => true,
                        ];
                    }),
                ]);
            }

            $rows = DB::table('glaccountusers as gau')
                ->leftJoin('www_users as wu', 'wu.userid', '=', 'gau.userid')
                ->leftJoin('chartmaster as cm', 'cm.accountcode', '=', 'gau.accountcode')
                ->select(
                    'gau.userid',
                    'wu.realname',
                    'wu.email',
                    'gau.accountcode',
                    'cm.accountname',
                    'gau.canview',
                    'gau.canupd'
                )
                ->orderBy('gau.userid')
                ->orderBy('gau.accountcode')
                ->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(static function ($row) {
                    return [
                        'scope' => 'gl',
                        'userId' => (string) $row->userid,
                        'userName' => (string) ($row->realname ?? ''),
                        'email' => (string) ($row->email ?? ''),
                        'accountCode' => (string) $row->accountcode,
                        'accountName' => (string) ($row->accountname ?? ''),
                        'canView' => (int) ($row->canview ?? 0) === 1,
                        'canUpdate' => (int) ($row->canupd ?? 0) === 1,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function taxReport(Request $request)
    {
        $dateFrom = trim((string) $request->query('dateFrom', ''));
        $dateTo = trim((string) $request->query('dateTo', ''));

        try {
            $salesTaxTotals = DB::table('gltrans')
                ->select('account', DB::raw('SUM(amount) AS total'))
                ->when($dateFrom !== '', fn ($query) => $query->whereDate('trandate', '>=', $dateFrom))
                ->when($dateTo !== '', fn ($query) => $query->whereDate('trandate', '<=', $dateTo))
                ->groupBy('account');

            $purchTaxTotals = DB::table('gltrans')
                ->select('account', DB::raw('SUM(amount) AS total'))
                ->when($dateFrom !== '', fn ($query) => $query->whereDate('trandate', '>=', $dateFrom))
                ->when($dateTo !== '', fn ($query) => $query->whereDate('trandate', '<=', $dateTo))
                ->groupBy('account');

            $rows = DB::table('taxauthorities as ta')
                ->leftJoinSub($salesTaxTotals, 'sales_total', function ($join) {
                    $join->on('sales_total.account', '=', 'ta.taxglcode');
                })
                ->leftJoinSub($purchTaxTotals, 'purch_total', function ($join) {
                    $join->on('purch_total.account', '=', 'ta.purchtaxglaccount');
                })
                ->leftJoin('chartmaster as sales_cm', 'sales_cm.accountcode', '=', 'ta.taxglcode')
                ->leftJoin('chartmaster as purch_cm', 'purch_cm.accountcode', '=', 'ta.purchtaxglaccount')
                ->select(
                    'ta.taxid',
                    'ta.description',
                    'ta.taxglcode',
                    'ta.purchtaxglaccount',
                    'sales_cm.accountname as sales_account_name',
                    'purch_cm.accountname as purchase_account_name',
                    DB::raw('COALESCE(sales_total.total, 0) AS sales_tax_total'),
                    DB::raw('COALESCE(purch_total.total, 0) AS purchase_tax_total')
                )
                ->orderBy('ta.taxid')
                ->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(static function ($row) {
                    $salesTaxTotal = (float) $row->sales_tax_total;
                    $purchaseTaxTotal = (float) $row->purchase_tax_total;
                    return [
                        'taxId' => (int) $row->taxid,
                        'description' => (string) $row->description,
                        'salesTaxAccountCode' => (string) $row->taxglcode,
                        'salesTaxAccountName' => (string) ($row->sales_account_name ?? ''),
                        'purchaseTaxAccountCode' => (string) $row->purchtaxglaccount,
                        'purchaseTaxAccountName' => (string) ($row->purchase_account_name ?? ''),
                        'salesTaxTotal' => $salesTaxTotal,
                        'purchaseTaxTotal' => $purchaseTaxTotal,
                        'netTax' => $salesTaxTotal + $purchaseTaxTotal,
                    ];
                }),
                'meta' => [
                    'summary' => [
                        'authorities' => (int) $rows->count(),
                        'salesTaxTotal' => (float) $rows->sum('sales_tax_total'),
                        'purchaseTaxTotal' => (float) $rows->sum('purchase_tax_total'),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'summary' => [
                        'authorities' => 0,
                        'salesTaxTotal' => 0,
                        'purchaseTaxTotal' => 0,
                    ],
                ],
            ]);
        }
    }

    public function financialStatement(Request $request)
    {
        $statementType = strtolower(trim((string) $request->query('type', 'balance-sheet')));
        $period = (int) $request->query('period', 0);
        $limit = $this->safeLimit($request->query('limit', 5000), 2000, 10000);
        $isProfitAndLoss = $statementType === 'profit-loss';

        try {
            $latestPeriod = (int) (DB::table('periods')->max('periodno') ?? 0);
            $periodToUse = $period > 0 ? $period : $latestPeriod;

            $rows = DB::table('chartmaster as cm')
                ->join('accountgroups as ag', 'ag.groupname', '=', 'cm.group_')
                ->leftJoin('accountsection as acs', 'acs.sectionid', '=', 'ag.sectioninaccounts')
                ->leftJoin('chartdetails as cd', function ($join) use ($periodToUse) {
                    $join
                        ->on('cd.accountcode', '=', 'cm.accountcode')
                        ->where('cd.period', '=', $periodToUse);
                })
                ->where('ag.pandl', $isProfitAndLoss ? 1 : 0)
                ->select(
                    'cm.accountcode',
                    'cm.accountname',
                    'cm.group_',
                    'ag.sectioninaccounts',
                    'acs.sectionname',
                    DB::raw('COALESCE(cd.bfwd + cd.actual, 0) AS balance')
                )
                ->orderBy('ag.sectioninaccounts')
                ->orderBy('ag.sequenceintb')
                ->orderBy('cm.accountcode')
                ->limit($limit)
                ->get();

            $data = $rows->map(static function ($row) {
                $balance = (float) $row->balance;
                return [
                    'accountCode' => (string) $row->accountcode,
                    'accountName' => (string) $row->accountname,
                    'groupName' => (string) $row->group_,
                    'sectionId' => (int) $row->sectioninaccounts,
                    'sectionName' => (string) ($row->sectionname ?? ''),
                    'balance' => $balance,
                    'debit' => $balance >= 0 ? $balance : 0.0,
                    'credit' => $balance < 0 ? abs($balance) : 0.0,
                ];
            });

            return response()->json([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'statementType' => $isProfitAndLoss ? 'profit-loss' : 'balance-sheet',
                    'period' => $periodToUse,
                    'latestPeriod' => $latestPeriod,
                    'summary' => [
                        'accounts' => (int) $data->count(),
                        'totalDebits' => (float) $data->sum('debit'),
                        'totalCredits' => (float) $data->sum('credit'),
                        'net' => (float) $data->sum('balance'),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'statementType' => $isProfitAndLoss ? 'profit-loss' : 'balance-sheet',
                    'period' => 0,
                    'latestPeriod' => 0,
                    'summary' => [
                        'accounts' => 0,
                        'totalDebits' => 0,
                        'totalCredits' => 0,
                        'net' => 0,
                    ],
                ],
            ]);
        }
    }

    public function horizontalAnalysis(Request $request)
    {
        $statement = strtolower(trim((string) $request->query('statement', 'position')));
        $period = (int) $request->query('period', 0);
        $limit = $this->safeLimit($request->query('limit', 5000), 2000, 10000);
        $pandL = $statement === 'income' ? 1 : 0;

        try {
            $latestPeriod = (int) (DB::table('periods')->max('periodno') ?? 0);
            $currentPeriod = $period > 0 ? $period : $latestPeriod;
            $previousPeriod = (int) (DB::table('periods')
                ->where('periodno', '<', $currentPeriod)
                ->orderByDesc('periodno')
                ->value('periodno') ?? $currentPeriod);

            $rows = DB::table('chartmaster as cm')
                ->join('accountgroups as ag', 'ag.groupname', '=', 'cm.group_')
                ->leftJoin('accountsection as acs', 'acs.sectionid', '=', 'ag.sectioninaccounts')
                ->leftJoin('chartdetails as curr', function ($join) use ($currentPeriod) {
                    $join
                        ->on('curr.accountcode', '=', 'cm.accountcode')
                        ->where('curr.period', '=', $currentPeriod);
                })
                ->leftJoin('chartdetails as prev', function ($join) use ($previousPeriod) {
                    $join
                        ->on('prev.accountcode', '=', 'cm.accountcode')
                        ->where('prev.period', '=', $previousPeriod);
                })
                ->where('ag.pandl', $pandL)
                ->select(
                    'cm.accountcode',
                    'cm.accountname',
                    'cm.group_',
                    'ag.sectioninaccounts',
                    'acs.sectionname',
                    DB::raw('COALESCE(curr.bfwd + curr.actual, 0) AS current_balance'),
                    DB::raw('COALESCE(prev.bfwd + prev.actual, 0) AS previous_balance')
                )
                ->orderBy('ag.sectioninaccounts')
                ->orderBy('ag.sequenceintb')
                ->orderBy('cm.accountcode')
                ->limit($limit)
                ->get();

            $data = $rows->map(static function ($row) {
                $current = (float) $row->current_balance;
                $previous = (float) $row->previous_balance;
                $change = $current - $previous;
                $changePct = abs($previous) < 0.000001 ? null : (($change / $previous) * 100);

                return [
                    'accountCode' => (string) $row->accountcode,
                    'accountName' => (string) $row->accountname,
                    'groupName' => (string) $row->group_,
                    'sectionId' => (int) $row->sectioninaccounts,
                    'sectionName' => (string) ($row->sectionname ?? ''),
                    'currentBalance' => $current,
                    'previousBalance' => $previous,
                    'change' => $change,
                    'changePct' => $changePct,
                ];
            });

            return response()->json([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'statement' => $statement === 'income' ? 'income' : 'position',
                    'currentPeriod' => $currentPeriod,
                    'previousPeriod' => $previousPeriod,
                    'summary' => [
                        'accounts' => (int) $data->count(),
                        'currentTotal' => (float) $data->sum('currentBalance'),
                        'previousTotal' => (float) $data->sum('previousBalance'),
                        'changeTotal' => (float) $data->sum('change'),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'statement' => $statement === 'income' ? 'income' : 'position',
                    'currentPeriod' => 0,
                    'previousPeriod' => 0,
                    'summary' => [
                        'accounts' => 0,
                        'currentTotal' => 0,
                        'previousTotal' => 0,
                        'changeTotal' => 0,
                    ],
                ],
            ]);
        }
    }

    public function accountTrend(Request $request)
    {
        $accountCode = strtoupper(trim((string) $request->query('accountCode', '')));
        $periodsBack = $this->safeLimit($request->query('periods', 12), 12, 60);

        if ($accountCode === '') {
            return response()->json([
                'success' => false,
                'message' => 'Account code is required.',
            ], 422);
        }

        try {
            $periodRows = DB::table('periods')
                ->select('periodno', 'lastdate_in_period')
                ->orderByDesc('periodno')
                ->limit($periodsBack)
                ->get()
                ->sortBy('periodno')
                ->values();

            $periodNos = $periodRows->pluck('periodno')->all();

            $balances = DB::table('chartdetails')
                ->where('accountcode', $accountCode)
                ->whereIn('period', $periodNos)
                ->select('period', DB::raw('COALESCE(bfwd + actual, 0) AS balance'))
                ->get()
                ->keyBy('period');

            $accountName = (string) (DB::table('chartmaster')->where('accountcode', $accountCode)->value('accountname') ?? '');

            $data = $periodRows->map(static function ($periodRow) use ($balances) {
                $periodNo = (int) $periodRow->periodno;
                $balanceRow = $balances->get($periodNo);

                return [
                    'period' => $periodNo,
                    'periodEndDate' => (string) $periodRow->lastdate_in_period,
                    'balance' => (float) ($balanceRow->balance ?? 0),
                ];
            });

            return response()->json([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'accountCode' => $accountCode,
                    'accountName' => $accountName,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'accountCode' => $accountCode,
                    'accountName' => '',
                ],
            ]);
        }
    }

    public function accountInquiry(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 100), 50, 500);
        $page = $this->safePage($request->query('page', 1));
        $offset = ($page - 1) * $limit;
        $accountCode = strtoupper(trim((string) $request->query('accountCode', '')));
        $dateFrom = trim((string) $request->query('dateFrom', ''));
        $dateTo = trim((string) $request->query('dateTo', ''));
        $q = trim((string) $request->query('q', ''));

        try {
            $query = DB::table('gltrans as gl')
                ->leftJoin('chartmaster as cm', 'cm.accountcode', '=', 'gl.account')
                ->leftJoin('systypes as st', 'st.typeid', '=', 'gl.type')
                ->select(
                    'gl.counterindex',
                    'gl.type',
                    'gl.typeno',
                    'gl.trandate',
                    'gl.periodno',
                    'gl.account',
                    'cm.accountname',
                    'gl.narrative',
                    'gl.amount',
                    'gl.posted',
                    DB::raw("COALESCE(NULLIF(TRIM(st.typename), ''), 'GL Transaction') AS typename")
                );

            if ($accountCode !== '') {
                $query->where('gl.account', $accountCode);
            }

            if ($dateFrom !== '') {
                $query->whereDate('gl.trandate', '>=', $dateFrom);
            }

            if ($dateTo !== '') {
                $query->whereDate('gl.trandate', '<=', $dateTo);
            }

            if ($q !== '') {
                $like = '%' . $q . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('gl.narrative', 'like', $like)
                        ->orWhere('gl.account', 'like', $like)
                        ->orWhere('cm.accountname', 'like', $like)
                        ->orWhereRaw('CAST(gl.typeno AS CHAR) LIKE ?', [$like]);
                });
            }

            $total = (int) (clone $query)->count();
            $rows = $query
                ->orderByDesc('gl.trandate')
                ->orderByDesc('gl.counterindex')
                ->offset($offset)
                ->limit($limit)
                ->get();

            $totalPages = $total > 0 ? (int) ceil($total / $limit) : 0;

            $data = $rows->map(static function ($row) {
                $amount = (float) $row->amount;
                return [
                    'id' => (int) $row->counterindex,
                    'date' => (string) $row->trandate,
                    'periodNo' => (int) $row->periodno,
                    'accountCode' => (string) $row->account,
                    'accountName' => (string) ($row->accountname ?? ''),
                    'reference' => trim((string) $row->typename) . ' #' . (int) $row->typeno,
                    'narrative' => (string) ($row->narrative ?? ''),
                    'debit' => $amount > 0 ? $amount : 0.0,
                    'credit' => $amount < 0 ? abs($amount) : 0.0,
                    'amount' => $amount,
                    'status' => (int) $row->posted === 1 ? 'Posted' : 'Pending',
                ];
            });

            return response()->json([
                'success' => true,
                'data' => $data,
                'meta' => [
                    'summary' => [
                        'entries' => (int) $data->count(),
                        'debits' => (float) $data->sum('debit'),
                        'credits' => (float) $data->sum('credit'),
                        'net' => (float) $data->sum('amount'),
                    ],
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => $total,
                        'totalPages' => $totalPages,
                        'hasMore' => $page < $totalPages,
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'meta' => [
                    'summary' => [
                        'entries' => 0,
                        'debits' => 0,
                        'credits' => 0,
                        'net' => 0,
                    ],
                    'pagination' => [
                        'page' => $page,
                        'limit' => $limit,
                        'total' => 0,
                        'totalPages' => 0,
                        'hasMore' => false,
                    ],
                ],
            ]);
        }
    }

    public function matchBankTransaction(Request $request, int $bankTransId)
    {
        $amountClearedInput = $request->input('amountCleared');

        try {
            $bankTrans = DB::table('banktrans')
                ->where('banktransid', $bankTransId)
                ->select('amount')
                ->first();

            if (!$bankTrans) {
                return response()->json([
                    'success' => false,
                    'message' => 'Bank transaction not found.',
                ], 404);
            }

            $amountCleared = $amountClearedInput !== null
                ? (float) $amountClearedInput
                : (float) $bankTrans->amount;

            DB::table('banktrans')
                ->where('banktransid', $bankTransId)
                ->update([
                    'amountcleared' => $amountCleared,
                ]);

            return response()->json([
                'success' => true,
                'message' => 'Bank transaction matched.',
                'data' => [
                    'bankTransId' => $bankTransId,
                    'amountCleared' => $amountCleared,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function unmatchBankTransaction(int $bankTransId)
    {
        try {
            $exists = DB::table('banktrans')->where('banktransid', $bankTransId)->exists();
            if (!$exists) {
                return response()->json([
                    'success' => false,
                    'message' => 'Bank transaction not found.',
                ], 404);
            }

            DB::table('banktrans')
                ->where('banktransid', $bankTransId)
                ->update([
                    'amountcleared' => 0,
                ]);

            return response()->json([
                'success' => true,
                'message' => 'Bank transaction unmatched.',
                'data' => [
                    'bankTransId' => $bankTransId,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function upsertBudget(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'accountCode' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'period' => ['required', 'integer', 'exists:periods,periodno'],
            'budget' => ['required', 'numeric'],
            'bfwdBudget' => ['nullable', 'numeric'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $accountCode = strtoupper(trim((string) $payload['accountCode']));
        $period = (int) $payload['period'];
        $budget = (float) $payload['budget'];
        $bfwdBudget = isset($payload['bfwdBudget']) ? (float) $payload['bfwdBudget'] : 0.0;

        try {
            DB::transaction(function () use ($accountCode, $period, $budget, $bfwdBudget) {
                $row = DB::table('chartdetails')
                    ->where('accountcode', $accountCode)
                    ->where('period', $period)
                    ->lockForUpdate()
                    ->first();

                if ($row) {
                    DB::table('chartdetails')
                        ->where('accountcode', $accountCode)
                        ->where('period', $period)
                        ->update([
                            'budget' => $budget,
                            'bfwdbudget' => $bfwdBudget,
                        ]);
                    return;
                }

                DB::table('chartdetails')->insert([
                    'accountcode' => $accountCode,
                    'period' => $period,
                    'budget' => $budget,
                    'actual' => 0,
                    'bfwd' => 0,
                    'bfwdbudget' => $bfwdBudget,
                ]);
            }, 5);

            return response()->json([
                'success' => true,
                'message' => 'Budget saved.',
                'data' => [
                    'accountCode' => $accountCode,
                    'period' => $period,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function upsertAccountUser(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'scope' => ['required', 'string', 'in:gl,bank'],
            'userId' => ['required', 'string', 'max:20', 'exists:www_users,userid'],
            'accountCode' => ['required', 'string', 'max:20'],
            'canView' => ['nullable', 'boolean'],
            'canUpdate' => ['nullable', 'boolean'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $scope = (string) $payload['scope'];
        $userId = trim((string) $payload['userId']);
        $accountCode = strtoupper(trim((string) $payload['accountCode']));
        $canView = (bool) ($payload['canView'] ?? true);
        $canUpdate = (bool) ($payload['canUpdate'] ?? false);

        try {
            if ($scope === 'bank') {
                $exists = DB::table('bankaccounts')->where('accountcode', $accountCode)->exists();
                if (!$exists) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Bank account not found.',
                    ], 404);
                }

                $already = DB::table('bankaccountusers')
                    ->where('userid', $userId)
                    ->where('accountcode', $accountCode)
                    ->exists();

                if (!$already) {
                    DB::table('bankaccountusers')->insert([
                        'userid' => $userId,
                        'accountcode' => $accountCode,
                    ]);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Bank account authorisation saved.',
                ]);
            }

            $exists = DB::table('chartmaster')->where('accountcode', $accountCode)->exists();
            if (!$exists) {
                return response()->json([
                    'success' => false,
                    'message' => 'GL account not found.',
                ], 404);
            }

            DB::table('glaccountusers')->updateOrInsert(
                [
                    'userid' => $userId,
                    'accountcode' => $accountCode,
                ],
                [
                    'canview' => $canView ? 1 : 0,
                    'canupd' => $canUpdate ? 1 : 0,
                ]
            );

            return response()->json([
                'success' => true,
                'message' => 'GL account authorisation saved.',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function deleteAccountUser(Request $request)
    {
        $scope = strtolower(trim((string) $request->input('scope', '')));
        $userId = trim((string) $request->input('userId', ''));
        $accountCode = strtoupper(trim((string) $request->input('accountCode', '')));

        if (!in_array($scope, ['gl', 'bank'], true) || $userId === '' || $accountCode === '') {
            return response()->json([
                'success' => false,
                'message' => 'scope, userId and accountCode are required.',
            ], 422);
        }

        try {
            if ($scope === 'bank') {
                DB::table('bankaccountusers')
                    ->where('userid', $userId)
                    ->where('accountcode', $accountCode)
                    ->delete();

                return response()->json([
                    'success' => true,
                    'message' => 'Bank account authorisation removed.',
                ]);
            }

            DB::table('glaccountusers')
                ->where('userid', $userId)
                ->where('accountcode', $accountCode)
                ->delete();

            return response()->json([
                'success' => true,
                'message' => 'GL account authorisation removed.',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    private function ensureMinimumAccountSections(): void
    {
        $incomeExists = DB::table('accountsection')->where('sectionid', 1)->exists();
        if (!$incomeExists) {
            DB::table('accountsection')->insert([
                'sectionid' => 1,
                'sectionname' => 'Income',
            ]);
        }

        $costExists = DB::table('accountsection')->where('sectionid', 2)->exists();
        if (!$costExists) {
            DB::table('accountsection')->insert([
                'sectionid' => 2,
                'sectionname' => 'Cost Of Sales',
            ]);
        }
    }

    private function ensureChartDetailsForAccount(string $accountCode): void
    {
        DB::insert(
            'INSERT INTO chartdetails (accountcode, period, budget, actual, bfwd, bfwdbudget)
            SELECT ?, p.periodno, 0, 0, 0, 0
            FROM periods p
            LEFT JOIN chartdetails cd ON cd.accountcode = ? AND cd.period = p.periodno
            WHERE cd.accountcode IS NULL',
            [$accountCode, $accountCode]
        );
    }

    /**
     * @return array<int, array{name: string, count: int}>
     */
    private function accountDependencyCounts(string $accountCode): array
    {
        $definitions = [
            [
                'name' => 'Chart details with posted activity',
                'query' => fn () => DB::table('chartdetails')
                    ->where('accountcode', $accountCode)
                    ->where('actual', '<>', 0)
                    ->count(),
            ],
            [
                'name' => 'GL transactions',
                'query' => fn () => DB::table('gltrans')->where('account', $accountCode)->count(),
            ],
            [
                'name' => 'Company default account mappings',
                'query' => fn () => DB::table('companies')
                    ->where(function ($builder) use ($accountCode) {
                        $builder
                            ->where('debtorsact', $accountCode)
                            ->orWhere('pytdiscountact', $accountCode)
                            ->orWhere('creditorsact', $accountCode)
                            ->orWhere('payrollact', $accountCode)
                            ->orWhere('grnact', $accountCode)
                            ->orWhere('exchangediffact', $accountCode)
                            ->orWhere('purchasesexchangediffact', $accountCode)
                            ->orWhere('retainedearnings', $accountCode)
                            ->orWhere('freightact', $accountCode);
                    })
                    ->count(),
            ],
            [
                'name' => 'Tax authority mappings',
                'query' => fn () => DB::table('taxauthorities')
                    ->where(function ($builder) use ($accountCode) {
                        $builder
                            ->where('taxglcode', $accountCode)
                            ->orWhere('purchtaxglaccount', $accountCode)
                            ->orWhere('bankacctype', $accountCode);
                    })
                    ->count(),
            ],
            [
                'name' => 'Sales GL posting mappings',
                'query' => fn () => DB::table('salesglpostings')
                    ->where(function ($builder) use ($accountCode) {
                        $builder
                            ->where('salesglcode', $accountCode)
                            ->orWhere('discountglcode', $accountCode);
                    })
                    ->count(),
            ],
            [
                'name' => 'COGS GL posting mappings',
                'query' => fn () => DB::table('cogsglpostings')->where('glcode', $accountCode)->count(),
            ],
            [
                'name' => 'Stock category mappings',
                'query' => fn () => DB::table('stockcategory')
                    ->where(function ($builder) use ($accountCode) {
                        $builder
                            ->where('stockact', $accountCode)
                            ->orWhere('adjglact', $accountCode)
                            ->orWhere('issueglact', $accountCode)
                            ->orWhere('purchpricevaract', $accountCode)
                            ->orWhere('materialuseagevarac', $accountCode)
                            ->orWhere('wipact', $accountCode);
                    })
                    ->count(),
            ],
            [
                'name' => 'Bank account mappings',
                'query' => fn () => DB::table('bankaccounts')->where('accountcode', $accountCode)->count(),
            ],
            [
                'name' => 'Bank transaction mappings',
                'query' => fn () => DB::table('banktrans')->where('bankact', $accountCode)->count(),
            ],
            [
                'name' => 'Petty cash mappings',
                'query' => fn () => DB::table('pcexpenses')->where('glaccount', $accountCode)->count() +
                    DB::table('pctabs')
                        ->where(function ($builder) use ($accountCode) {
                            $builder
                                ->where('glaccountassignment', $accountCode)
                                ->orWhere('glaccountpcash', $accountCode);
                        })
                        ->count(),
            ],
            [
                'name' => 'Fixed asset category mappings',
                'query' => fn () => DB::table('fixedassetcategories')
                    ->where(function ($builder) use ($accountCode) {
                        $builder
                            ->where('costact', $accountCode)
                            ->orWhere('depnact', $accountCode)
                            ->orWhere('disposalact', $accountCode)
                            ->orWhere('accumdepnact', $accountCode);
                    })
                    ->count(),
            ],
            [
                'name' => 'Work centre mappings',
                'query' => fn () => DB::table('workcentres')->where('overheadrecoveryact', $accountCode)->count(),
            ],
            [
                'name' => 'Purchase order mappings',
                'query' => fn () => DB::table('purchorderdetails')->where('glcode', $accountCode)->count(),
            ],
            [
                'name' => 'Location mappings',
                'query' => fn () => DB::table('locations')->where('glaccountcode', $accountCode)->count(),
            ],
        ];

        $results = [];
        foreach ($definitions as $definition) {
            $count = (int) $definition['query']();
            $results[] = [
                'name' => (string) $definition['name'],
                'count' => $count,
            ];
        }

        return $results;
    }

    /**
     * @return array{sectionInAccounts: int, sequenceInTB: int, pandL: int, parentGroupName: string}
     */
    private function resolveInheritedGroupProperties(
        string $groupName,
        string $parentGroupName,
        int $sectionInAccounts,
        int $sequenceInTB,
        int $pandL
    ): array {
        $parent = trim($parentGroupName);
        if ($parent === '') {
            $this->assertSectionExists($sectionInAccounts);
            return [
                'sectionInAccounts' => $sectionInAccounts,
                'sequenceInTB' => $sequenceInTB,
                'pandL' => $pandL,
                'parentGroupName' => '',
            ];
        }

        if ($parent === $groupName) {
            throw new \RuntimeException('Parent account group cannot be the same as the group itself.');
        }

        if ($this->isRecursiveGroup($groupName, $parent)) {
            throw new \RuntimeException('Parent account group results in a recursive account structure.');
        }

        $parentRow = DB::table('accountgroups')
            ->where('groupname', $parent)
            ->select('sectioninaccounts', 'sequenceintb', 'pandl')
            ->first();

        if (!$parentRow) {
            throw new \RuntimeException('Parent account group does not exist.');
        }

        return [
            'sectionInAccounts' => (int) $parentRow->sectioninaccounts,
            'sequenceInTB' => (int) $parentRow->sequenceintb,
            'pandL' => (int) $parentRow->pandl,
            'parentGroupName' => $parent,
        ];
    }

    private function assertSectionExists(int $sectionId): void
    {
        $exists = DB::table('accountsection')->where('sectionid', $sectionId)->exists();
        if (!$exists) {
            throw new \RuntimeException('The section in accounts does not exist.');
        }
    }

    private function isRecursiveGroup(string $groupName, string $parentGroupName): bool
    {
        $current = $parentGroupName;

        while ($current !== '') {
            if ($current === $groupName) {
                return true;
            }

            $row = DB::table('accountgroups')
                ->where('groupname', $current)
                ->select('parentgroupname')
                ->first();

            if (!$row) {
                return false;
            }

            $current = (string) ($row->parentgroupname ?? '');
        }

        return false;
    }

    private function cashFlowActivityName(int $activity): string
    {
        return match ($activity) {
            -1 => 'Not set up',
            0 => 'No effect on cash flow',
            1 => 'Operating activity',
            2 => 'Investing activity',
            3 => 'Financing activity',
            4 => 'Cash or cash equivalent',
            default => 'Unknown',
        };
    }

    private function nextSystemTypeNumber(int $typeId, string $typeName): int
    {
        $row = DB::table('systypes')
            ->where('typeid', $typeId)
            ->lockForUpdate()
            ->first();

        if (!$row) {
            DB::table('systypes')->insert([
                'typeid' => $typeId,
                'typename' => $typeName,
                'typeno' => 1,
            ]);
            return 1;
        }

        $typeNo = (int) $row->typeno;
        DB::table('systypes')
            ->where('typeid', $typeId)
            ->update(['typeno' => $typeNo + 1]);

        return $typeNo;
    }

    private function applyChartDetailAmount(string $accountCode, int $periodNo, float $amount): void
    {
        $row = DB::table('chartdetails')
            ->where('accountcode', $accountCode)
            ->where('period', $periodNo)
            ->lockForUpdate()
            ->first();

        if ($row) {
            DB::table('chartdetails')
                ->where('accountcode', $accountCode)
                ->where('period', $periodNo)
                ->update([
                    'actual' => (float) $row->actual + $amount,
                ]);
            return;
        }

        DB::table('chartdetails')->insert([
            'accountcode' => $accountCode,
            'period' => $periodNo,
            'budget' => 0,
            'actual' => $amount,
            'bfwd' => 0,
            'bfwdbudget' => 0,
        ]);
    }

    private function csvAmountToFloat(string $value): float
    {
        $normalized = trim($value);
        if ($normalized === '') {
            return 0.0;
        }

        $negative = false;
        if (str_starts_with($normalized, '(') && str_ends_with($normalized, ')')) {
            $negative = true;
            $normalized = substr($normalized, 1, -1);
        }

        $normalized = str_replace([',', ' '], '', $normalized);
        if (!is_numeric($normalized)) {
            return 0.0;
        }

        $parsed = (float) $normalized;
        return $negative ? -abs($parsed) : $parsed;
    }

    private function isValidIsoDate(string $value): bool
    {
        if (!preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', $value)) {
            return false;
        }

        [$year, $month, $day] = array_map('intval', explode('-', $value));
        return checkdate($month, $day, $year);
    }

    private function resolvePeriodForDate(string $tranDate): int
    {
        $period = DB::table('periods')
            ->where('lastdate_in_period', '>=', $tranDate)
            ->orderBy('periodno')
            ->value('periodno');

        if ($period === null) {
            $latest = DB::table('periods')->max('periodno');
            if ($latest === null) {
                throw new \RuntimeException('No accounting periods are configured.');
            }
            return (int) $latest;
        }

        return (int) $period;
    }

    private function safePage(mixed $value): int
    {
        if (!is_numeric($value)) {
            return 1;
        }

        $page = (int) $value;
        if ($page < 1) {
            return 1;
        }

        return $page;
    }

    private function safeLimit(mixed $value, int $default, int $max): int
    {
        if (!is_numeric($value)) {
            return $default;
        }

        $limit = (int) $value;

        if ($limit < 1) {
            return $default;
        }

        return min($limit, $max);
    }
}
