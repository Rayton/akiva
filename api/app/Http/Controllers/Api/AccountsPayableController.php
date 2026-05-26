<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApBill;
use App\Models\ApPayment;
use App\Models\ApSupplier;
use App\Services\AccountsPayable\ApprovalWorkflowService;
use App\Services\AccountsPayable\RecurringBillService;
use App\Services\AccountsPayable\ApprovalGovernanceService;
use App\Services\AccountsPayable\PaymentBatchService;
use App\Services\AccountsPayable\CreditNoteLifecycleService;
use App\Services\AccountsPayable\ForecastingService;
use App\Services\AccountsPayable\ExceptionQueueService;
use App\Services\AccountsPayable\MatchingLifecycleService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AccountsPayableController extends Controller
{
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        $hasApSuppliers = Schema::hasTable('ap_suppliers');
        $hasApBills = Schema::hasTable('ap_bills');
        $apSuppliers = $hasApSuppliers
            ? ApSupplier::query()
                ->when($q !== '', fn ($query) => $query->where('name', 'like', "%{$q}%")->orWhere('supplier_code', 'like', "%{$q}%"))
                ->orderBy('name')
                ->limit(250)
                ->get()
            : collect();
        $suppliers = $this->mergedSupplierRows($apSuppliers, $q);

        $summary = [
            'totalPayables' => ($hasApBills ? (float) ApBill::whereIn('status', ['approved', 'part_paid'])->sum('amount_due') : 0.0) + $this->legacyTotalPayables(),
            'activeSuppliers' => (int) $suppliers->filter(fn ($supplier) => (bool) ($supplier['active'] ?? true))->count(),
            'overdueBills' => ($hasApBills ? (int) ApBill::where('amount_due', '>', 0)->whereDate('due_date', '<', now()->toDateString())->count() : 0) + $this->legacyOverdueBills(),
            'dueThisWeek' => ($hasApBills ? (float) ApBill::where('amount_due', '>', 0)->whereBetween('due_date', [now()->startOfWeek(), now()->endOfWeek()])->sum('amount_due') : 0.0) + $this->legacyDueThisWeek(),
        ];

        $upcoming = $hasApBills
            ? ApBill::query()->with('supplier:id,name,supplier_code')
                ->where('amount_due', '>', 0)
                ->orderBy('due_date')
                ->limit(10)
                ->get()
            : collect();
        $upcoming = $upcoming->concat($this->legacyUpcomingBills($q))->take(50)->values();

        $nativeBills = $this->nativeBillRows();
        $matchingQueue = $this->matchingQueueRows();
        $approvalQueue = $this->approvalQueueRows();
        $paymentBatches = $this->paymentBatchRows();
        $exceptions = $this->exceptionRows();
        $creditNotes = $this->creditNoteRows();
        $recurringTemplates = $this->recurringTemplateRows();
        $supplierStatements = $this->supplierStatementRows();
        $governance = [
            'nativeSupplierCount' => $hasApSuppliers ? (int) ApSupplier::count() : 0,
            'nativeOpenBills' => $hasApBills ? (int) ApBill::where('amount_due', '>', 0)->count() : 0,
            'approvalQueue' => $approvalQueue->count(),
            'matchingQueue' => $matchingQueue->count(),
            'paymentBatches' => $paymentBatches->count(),
            'exceptionQueue' => $exceptions->where('status', '!=', 'resolved')->count(),
            'creditNotes' => $creditNotes->count(),
            'recurringTemplates' => $recurringTemplates->count(),
            'supplierStatements' => $supplierStatements->count(),
        ];

        return response()->json(['success' => true, 'data' => compact(
            'suppliers',
            'summary',
            'upcoming',
            'nativeBills',
            'matchingQueue',
            'approvalQueue',
            'paymentBatches',
            'exceptions',
            'creditNotes',
            'recurringTemplates',
            'supplierStatements',
            'governance',
        )]);
    }

    private function nativeBillRows(int $limit = 200)
    {
        if (!Schema::hasTable('ap_bills')) {
            return collect();
        }

        return ApBill::query()
            ->with('supplier:id,name,supplier_code,currency_code')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(fn (ApBill $bill) => $this->billRow($bill));
    }

    private function billRow(ApBill $bill): array
    {
        return [
            'id' => (int) $bill->id,
            'bill_number' => (string) $bill->bill_number,
            'bill_date' => optional($bill->bill_date)->toDateString(),
            'due_date' => optional($bill->due_date)->toDateString(),
            'status' => (string) $bill->status,
            'subtotal' => (float) $bill->subtotal,
            'tax_total' => (float) $bill->tax_total,
            'total' => (float) $bill->total,
            'amount_paid' => (float) $bill->amount_paid,
            'amount_due' => (float) $bill->amount_due,
            'memo' => $bill->memo,
            'matching_status' => (string) ($bill->matching_status ?? 'pending'),
            'matching_blocked' => (bool) ($bill->matching_blocked ?? false),
            'supplier' => $bill->supplier ? [
                'name' => (string) $bill->supplier->name,
                'supplier_code' => (string) $bill->supplier->supplier_code,
                'currency_code' => $bill->supplier->currency_code,
            ] : null,
            'source' => 'accounts_payable',
        ];
    }

    private function matchingQueueRows()
    {
        if (!Schema::hasTable('ap_bills')) {
            return collect();
        }

        $bills = ApBill::query()
            ->with('supplier:id,name,supplier_code,currency_code')
            ->where('amount_due', '>', 0)
            ->orderByDesc('updated_at')
            ->limit(100)
            ->get();

        if ($bills->isEmpty() || !Schema::hasTable('ap_bill_matches')) {
            return $bills->map(fn (ApBill $bill) => $this->billRow($bill));
        }

        $matches = DB::table('ap_bill_matches')
            ->whereIn('bill_id', $bills->pluck('id'))
            ->whereNull('deleted_at')
            ->orderByDesc('id')
            ->get()
            ->unique('bill_id')
            ->keyBy('bill_id');

        return $bills->map(function (ApBill $bill) use ($matches) {
            $match = $matches->get($bill->id);

            return array_merge($this->billRow($bill), [
                'latest_match_status' => $match->status ?? null,
                'latest_match_type' => $match->match_type ?? null,
                'variance_amount' => isset($match->variance_amount) ? (float) $match->variance_amount : 0.0,
                'variance_qty' => isset($match->variance_qty) ? (float) $match->variance_qty : 0.0,
            ]);
        });
    }

    private function approvalQueueRows()
    {
        if (!Schema::hasTable('ap_bill_approval_instances')) {
            return collect();
        }

        $escalatedAt = Schema::hasColumn('ap_bill_approval_instances', 'escalated_at') ? 'i.escalated_at' : DB::raw('NULL as escalated_at');

        return DB::table('ap_bill_approval_instances as i')
            ->leftJoin('ap_bills as b', 'b.id', '=', 'i.bill_id')
            ->leftJoin('ap_suppliers as s', 's.id', '=', 'b.supplier_id')
            ->leftJoin('ap_approval_policies as p', 'p.id', '=', 'i.policy_id')
            ->whereNull('i.deleted_at')
            ->select([
                'i.id',
                'i.bill_id',
                'i.status',
                'i.current_step',
                'i.submitted_at',
                $escalatedAt,
                'p.name as policy_name',
                'b.bill_number',
                'b.total',
                'b.amount_due',
                's.name as supplier_name',
                's.supplier_code',
            ])
            ->orderByDesc('i.created_at')
            ->limit(100)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'bill_id' => $row->bill_id !== null ? (int) $row->bill_id : null,
                'bill_number' => $row->bill_number,
                'supplier' => [
                    'name' => $row->supplier_name,
                    'supplier_code' => $row->supplier_code,
                ],
                'policy_name' => $row->policy_name,
                'current_step' => (int) $row->current_step,
                'status' => (string) $row->status,
                'submitted_at' => $row->submitted_at,
                'escalated_at' => $row->escalated_at ?? null,
                'total' => (float) ($row->total ?? 0),
                'amount_due' => (float) ($row->amount_due ?? 0),
            ]);
    }

    private function paymentBatchRows()
    {
        if (!Schema::hasTable('ap_payment_batches')) {
            return collect();
        }

        return DB::table('ap_payment_batches as b')
            ->leftJoin('ap_payment_batch_lines as l', 'l.batch_id', '=', 'b.id')
            ->whereNull('b.deleted_at')
            ->select([
                'b.id',
                'b.batch_number',
                'b.status',
                'b.scheduled_date',
                'b.approved_at',
                'b.approved_by_user_id',
                'b.executed_at',
                'b.total_amount',
                DB::raw('COUNT(l.id) as line_count'),
            ])
            ->groupBy('b.id', 'b.batch_number', 'b.status', 'b.scheduled_date', 'b.approved_at', 'b.approved_by_user_id', 'b.executed_at', 'b.total_amount')
            ->orderByDesc('b.created_at')
            ->limit(100)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'batch_number' => (string) $row->batch_number,
                'status' => (string) $row->status,
                'scheduled_date' => $row->scheduled_date,
                'approved_at' => $row->approved_at,
                'approved_by_user_id' => $row->approved_by_user_id,
                'executed_at' => $row->executed_at,
                'total_amount' => (float) $row->total_amount,
                'line_count' => (int) $row->line_count,
            ]);
    }

    private function exceptionRows()
    {
        if (!Schema::hasTable('ap_exceptions')) {
            return collect();
        }

        $assignedColumn = Schema::hasColumn('ap_exceptions', 'assigned_to_user_id') ? 'e.assigned_to_user_id' : 'e.assigned_to';
        $dueAtColumn = Schema::hasColumn('ap_exceptions', 'due_at') ? 'e.due_at' : DB::raw('NULL as due_at');

        return DB::table('ap_exceptions as e')
            ->leftJoin('ap_bills as b', 'b.id', '=', 'e.bill_id')
            ->leftJoin('ap_suppliers as s', 's.id', '=', 'b.supplier_id')
            ->whereNull('e.deleted_at')
            ->select([
                'e.id',
                'e.bill_id',
                'e.type',
                'e.status',
                'e.severity',
                'e.message',
                DB::raw($assignedColumn . ' as assigned_to_user_id'),
                $dueAtColumn,
                'e.resolved_at',
                'b.bill_number',
                's.name as supplier_name',
                's.supplier_code',
            ])
            ->orderByDesc('e.created_at')
            ->limit(100)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'bill_id' => $row->bill_id !== null ? (int) $row->bill_id : null,
                'bill_number' => $row->bill_number,
                'supplier' => [
                    'name' => $row->supplier_name,
                    'supplier_code' => $row->supplier_code,
                ],
                'type' => (string) $row->type,
                'status' => (string) $row->status,
                'severity' => (string) $row->severity,
                'message' => (string) $row->message,
                'assigned_to_user_id' => $row->assigned_to_user_id,
                'due_at' => $row->due_at ?? null,
                'resolved_at' => $row->resolved_at,
            ]);
    }

    private function creditNoteRows()
    {
        if (!Schema::hasTable('ap_credit_notes')) {
            return collect();
        }

        return DB::table('ap_credit_notes as c')
            ->leftJoin('ap_suppliers as s', 's.id', '=', 'c.supplier_id')
            ->whereNull('c.deleted_at')
            ->select([
                'c.id',
                'c.credit_number',
                'c.credit_date',
                'c.amount_total',
                'c.amount_available',
                'c.status',
                'c.dispute_status',
                's.name as supplier_name',
                's.supplier_code',
            ])
            ->orderByDesc('c.created_at')
            ->limit(100)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'credit_number' => (string) $row->credit_number,
                'credit_date' => $row->credit_date,
                'amount_total' => (float) $row->amount_total,
                'amount_available' => (float) $row->amount_available,
                'status' => (string) $row->status,
                'dispute_status' => $row->dispute_status ?? 'none',
                'supplier' => [
                    'name' => $row->supplier_name,
                    'supplier_code' => $row->supplier_code,
                ],
            ]);
    }

    private function recurringTemplateRows()
    {
        if (!Schema::hasTable('ap_recurring_bill_templates')) {
            return collect();
        }

        return DB::table('ap_recurring_bill_templates as r')
            ->leftJoin('ap_suppliers as s', 's.id', '=', 'r.supplier_id')
            ->whereNull('r.deleted_at')
            ->select([
                'r.id',
                'r.template_name',
                'r.frequency',
                'r.interval_value',
                'r.next_run_date',
                'r.default_amount',
                'r.requires_approval',
                'r.active',
                's.name as supplier_name',
                's.supplier_code',
            ])
            ->orderBy('r.next_run_date')
            ->limit(100)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'template_name' => (string) $row->template_name,
                'frequency' => (string) $row->frequency,
                'interval_value' => (int) $row->interval_value,
                'next_run_date' => $row->next_run_date,
                'default_amount' => (float) $row->default_amount,
                'requires_approval' => (bool) $row->requires_approval,
                'active' => (bool) $row->active,
                'supplier' => [
                    'name' => $row->supplier_name,
                    'supplier_code' => $row->supplier_code,
                ],
            ]);
    }

    private function supplierStatementRows()
    {
        if (!Schema::hasTable('ap_supplier_statements')) {
            return collect();
        }

        return DB::table('ap_supplier_statements as st')
            ->leftJoin('ap_suppliers as s', 's.id', '=', 'st.supplier_id')
            ->whereNull('st.deleted_at')
            ->select([
                'st.id',
                'st.statement_date',
                'st.closing_balance',
                'st.status',
                's.name as supplier_name',
                's.supplier_code',
            ])
            ->orderByDesc('st.statement_date')
            ->limit(100)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'statement_date' => $row->statement_date,
                'closing_balance' => (float) $row->closing_balance,
                'status' => (string) $row->status,
                'supplier' => [
                    'name' => $row->supplier_name,
                    'supplier_code' => $row->supplier_code,
                ],
            ]);
    }

    private function mergedSupplierRows($apSuppliers, string $q)
    {
        $rows = collect($apSuppliers)->map(function (ApSupplier $supplier) {
            return [
                'id' => $supplier->id,
                'supplier_code' => (string) $supplier->supplier_code,
                'name' => (string) $supplier->name,
                'email' => $supplier->email,
                'phone' => $supplier->phone,
                'currency_code' => $supplier->currency_code,
                'payment_term_code' => $supplier->payment_term_code,
                'credit_limit' => $supplier->credit_limit,
                'active' => (bool) $supplier->active,
                'source' => 'accounts_payable',
            ];
        });

        return $rows
            ->concat($this->legacySupplierRows($q))
            ->unique(fn ($supplier) => strtolower((string) ($supplier['supplier_code'] ?? $supplier['id'] ?? '')))
            ->sortBy(fn ($supplier) => strtolower((string) ($supplier['name'] ?? '')))
            ->values();
    }

    private function legacySupplierRows(string $q)
    {
        if (!Schema::hasTable('suppliers')) {
            return collect();
        }

        $emailColumn = $this->firstExistingColumn('suppliers', ['email', 'emailaddress']);
        $phoneColumn = $this->firstExistingColumn('suppliers', ['telephone', 'phone', 'phoneno', 'tel']);
        $currencyColumn = $this->firstExistingColumn('suppliers', ['currcode']);
        $termsColumn = $this->firstExistingColumn('suppliers', ['paymentterms']);

        $query = DB::table('suppliers')
            ->select([
                DB::raw('supplierid as id'),
                DB::raw('supplierid as supplier_code'),
                DB::raw('suppname as name'),
                $emailColumn ? DB::raw($emailColumn . ' as email') : DB::raw('NULL as email'),
                $phoneColumn ? DB::raw($phoneColumn . ' as phone') : DB::raw('NULL as phone'),
                $currencyColumn ? DB::raw($currencyColumn . ' as currency_code') : DB::raw('NULL as currency_code'),
                $termsColumn ? DB::raw($termsColumn . ' as payment_term_code') : DB::raw('NULL as payment_term_code'),
                DB::raw('NULL as credit_limit'),
            ]);

        if ($q !== '') {
            $query->where(function ($search) use ($q) {
                $search->where('supplierid', 'like', "%{$q}%")
                    ->orWhere('suppname', 'like', "%{$q}%");
            });
        }

        return $query
            ->orderBy('suppname')
            ->limit(500)
            ->get()
            ->map(function ($row) {
                return [
                    'id' => (string) $row->id,
                    'supplier_code' => (string) $row->supplier_code,
                    'name' => html_entity_decode((string) ($row->name ?: $row->supplier_code)),
                    'email' => $row->email ? (string) $row->email : null,
                    'phone' => $row->phone ? (string) $row->phone : null,
                    'currency_code' => $row->currency_code ? (string) $row->currency_code : null,
                    'payment_term_code' => $row->payment_term_code ? (string) $row->payment_term_code : null,
                    'credit_limit' => null,
                    'active' => true,
                    'source' => 'legacy',
                ];
            });
    }

    private function legacyUpcomingBills(string $q)
    {
        if (!Schema::hasTable('supptrans')) {
            return collect();
        }

        $supplierColumn = $this->firstExistingColumn('supptrans', ['supplierno', 'supplierid']);
        if ($supplierColumn === null) {
            return collect();
        }

        $idColumn = $this->firstExistingColumn('supptrans', ['id', 'transno']);
        if ($idColumn === null) {
            return collect();
        }

        $referenceColumn = $this->firstExistingColumn('supptrans', ['suppreference', 'suppref', 'reference', 'transno']);
        $dateColumn = $this->firstExistingColumn('supptrans', ['trandate', 'inputdate']);
        $dueDateColumn = $this->firstExistingColumn('supptrans', ['duedate', 'trandate']);
        $amountExpression = $this->legacySupplierTransactionAmountExpression('st');

        $query = DB::table('supptrans as st')
            ->leftJoin('suppliers as s', 's.supplierid', '=', 'st.' . $supplierColumn)
            ->select([
                DB::raw("CONCAT('legacy-', st." . $idColumn . ') as id'),
                $referenceColumn ? DB::raw('st.' . $referenceColumn . ' as bill_number') : DB::raw('st.' . $idColumn . ' as bill_number'),
                $dateColumn ? DB::raw('st.' . $dateColumn . ' as bill_date') : DB::raw('NULL as bill_date'),
                $dueDateColumn ? DB::raw('st.' . $dueDateColumn . ' as due_date') : DB::raw('NULL as due_date'),
                DB::raw('"open" as status'),
                DB::raw($amountExpression . ' as total'),
                DB::raw('0 as amount_paid'),
                DB::raw($amountExpression . ' as amount_due'),
                DB::raw('st.' . $supplierColumn . ' as supplier_code'),
                DB::raw('COALESCE(NULLIF(s.suppname, ""), st.' . $supplierColumn . ') as supplier_name'),
            ])
            ->whereRaw($amountExpression . ' > 0');

        if ($q !== '') {
            $query->where(function ($search) use ($q, $referenceColumn, $supplierColumn) {
                $search->where('st.' . $supplierColumn, 'like', "%{$q}%")
                    ->orWhere('s.suppname', 'like', "%{$q}%");

                if ($referenceColumn) {
                    $search->orWhere('st.' . $referenceColumn, 'like', "%{$q}%");
                }
            });
        }

        if ($dueDateColumn) {
            $query->orderBy('st.' . $dueDateColumn);
        }

        return $query
            ->limit(25)
            ->get()
            ->map(function ($row) {
                return [
                    'id' => (string) $row->id,
                    'bill_number' => (string) $row->bill_number,
                    'bill_date' => $row->bill_date,
                    'due_date' => $row->due_date,
                    'status' => (string) $row->status,
                    'total' => (float) $row->total,
                    'amount_paid' => (float) $row->amount_paid,
                    'amount_due' => (float) $row->amount_due,
                    'supplier' => [
                        'name' => html_entity_decode((string) $row->supplier_name),
                        'supplier_code' => (string) $row->supplier_code,
                    ],
                    'source' => 'legacy',
                ];
            });
    }

    private function legacyTotalPayables(): float
    {
        return $this->legacySupplierTransactionAggregate();
    }

    private function legacyOverdueBills(): int
    {
        if (!Schema::hasTable('supptrans')) {
            return 0;
        }

        $dueDateColumn = $this->firstExistingColumn('supptrans', ['duedate', 'trandate']);
        if ($dueDateColumn === null) {
            return 0;
        }

        $amountExpression = $this->legacySupplierTransactionAmountExpression();

        return (int) DB::table('supptrans')
            ->whereRaw($amountExpression . ' > 0')
            ->whereDate($dueDateColumn, '<', now()->toDateString())
            ->count();
    }

    private function legacyDueThisWeek(): float
    {
        if (!Schema::hasTable('supptrans')) {
            return 0.0;
        }

        $dueDateColumn = $this->firstExistingColumn('supptrans', ['duedate', 'trandate']);
        if ($dueDateColumn === null) {
            return 0.0;
        }

        $amountExpression = $this->legacySupplierTransactionAmountExpression();

        return (float) DB::table('supptrans')
            ->whereRaw($amountExpression . ' > 0')
            ->whereBetween($dueDateColumn, [now()->startOfWeek(), now()->endOfWeek()])
            ->sum(DB::raw($amountExpression));
    }

    private function legacySupplierTransactionAggregate(): float
    {
        if (!Schema::hasTable('supptrans')) {
            return 0.0;
        }

        $amountExpression = $this->legacySupplierTransactionAmountExpression();

        return (float) DB::table('supptrans')
            ->whereRaw($amountExpression . ' > 0')
            ->sum(DB::raw($amountExpression));
    }

    private function legacySupplierTransactionAmountExpression(string $tableAlias = ''): string
    {
        $prefix = $tableAlias !== '' ? $tableAlias . '.' : '';
        $parts = [];
        foreach (['ovamount', 'ovgst', 'ovfreight', 'ovdiscount'] as $column) {
            if (Schema::hasColumn('supptrans', $column)) {
                $qualifiedColumn = $prefix . $column;
                $parts[] = $column === 'ovdiscount' ? '- COALESCE(' . $qualifiedColumn . ', 0)' : 'COALESCE(' . $qualifiedColumn . ', 0)';
            }
        }

        $gross = count($parts) > 0 ? implode(' + ', $parts) : '0';
        if (Schema::hasColumn('supptrans', 'alloc')) {
            return '(' . $gross . ' - COALESCE(' . $prefix . 'alloc, 0))';
        }

        return '(' . $gross . ')';
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

    public function storeSupplier(Request $request)
    {
        $data = $request->validate([
            'supplier_code' => 'required|string|max:30|unique:ap_suppliers,supplier_code',
            'name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:60',
            'currency_code' => 'nullable|string|max:10',
            'payment_term_code' => 'nullable|string|max:20',
            'credit_limit' => 'nullable|numeric|min:0',
        ]);
        $data['currency_code'] = $data['currency_code'] ?? 'USD';
        $data['active'] = true;
        $supplier = ApSupplier::create($data);
        $supplier = ApSupplier::where('supplier_code', $data['supplier_code'])->first() ?? $supplier;

        return response()->json(['success' => true, 'data' => $supplier], 201);
    }

    public function storeBill(Request $request)
    {
        $data = $request->validate([
            'supplier_id' => 'required|exists:ap_suppliers,id',
            'bill_number' => 'required|string|max:50',
            'bill_date' => 'required|date',
            'due_date' => 'required|date|after_or_equal:bill_date',
            'memo' => 'nullable|string',
            'lines' => 'required|array|min:1',
            'lines.*.description' => 'required|string|max:255',
            'lines.*.quantity' => 'required|numeric|min:0.0001',
            'lines.*.unit_price' => 'required|numeric|min:0',
            'lines.*.tax_rate' => 'nullable|numeric|min:0',
        ]);

        return DB::transaction(function () use ($data) {
            $subtotal = collect($data['lines'])->sum(fn ($l) => (float) $l['quantity'] * (float) $l['unit_price']);
            $taxTotal = collect($data['lines'])->sum(fn ($l) => ((float) $l['quantity'] * (float) $l['unit_price']) * (((float) ($l['tax_rate'] ?? 0)) / 100));
            $total = round($subtotal + $taxTotal, 2);
            $bill = ApBill::create([
                'supplier_id' => $data['supplier_id'],
                'bill_number' => $data['bill_number'],
                'bill_date' => $data['bill_date'],
                'due_date' => $data['due_date'],
                'status' => 'draft',
                'subtotal' => $subtotal,
                'tax_total' => $taxTotal,
                'total' => $total,
                'amount_paid' => 0,
                'amount_due' => $total,
                'memo' => $data['memo'] ?? null,
            ]);
            $bill = ApBill::where('supplier_id', $data['supplier_id'])
                ->where('bill_number', $data['bill_number'])
                ->first() ?? $bill;

            foreach ($data['lines'] as $line) {
                $lineTotal = round(((float) $line['quantity'] * (float) $line['unit_price']) * (1 + (((float) ($line['tax_rate'] ?? 0)) / 100)), 2);
                DB::table('ap_bill_lines')->insert([
                    'bill_id' => $bill->id,
                    'description' => $line['description'],
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'tax_rate' => $line['tax_rate'] ?? 0,
                    'line_total' => $lineTotal,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            $this->runDuplicateCheck($bill);

            return response()->json(['success' => true, 'data' => $bill], 201);
        });
    }

    public function submitApproval(int $billId, ApprovalWorkflowService $approvalWorkflowService)
    {
        $result = $approvalWorkflowService->submit($billId);
        return response()->json($result['success'] ? ['success' => true, 'data' => $result['data']] : ['success' => false, 'message' => $result['message']], $result['status']);
    }

    public function approvalAction(Request $request, int $instanceId)
    {
        $data = $request->validate([
            'action' => 'required|string|in:approve,reject',
            'actor_user_id' => 'required|string|max:60',
            'comment' => 'nullable|string|max:1000',
        ]);


        $auth = app(ApprovalGovernanceService::class)->canApprove($instanceId, $data['actor_user_id']);
        if (!$auth['allowed']) {
            return response()->json(['success' => false, 'message' => $auth['message']], 403);
        }
        $instance = $auth['instance'];

        DB::table('ap_bill_approval_actions')->insert([
            'approval_instance_id' => $instanceId,
            'step_order' => $instance->current_step,
            'action' => $data['action'],
            'actor_user_id' => $data['actor_user_id'] ?? null,
            'comment' => $data['comment'] ?? null,
            'action_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $steps = DB::table('ap_approval_steps')->where('policy_id', $instance->policy_id)->count();
        $bill = ApBill::findOrFail($instance->bill_id);

        if ($data['action'] === 'reject') {
            DB::table('ap_bill_approval_instances')->where('id', $instanceId)->update(['status' => 'rejected', 'completed_at' => now(), 'updated_at' => now()]);
            $bill->status = 'rejected';
            $bill->save();
            return response()->json(['success' => true, 'data' => ['status' => 'rejected']]);
        }

        if ((int) $instance->current_step >= $steps) {
            DB::table('ap_bill_approval_instances')->where('id', $instanceId)->update(['status' => 'approved', 'completed_at' => now(), 'updated_at' => now()]);
            $bill->status = 'approved';
            $bill->save();
            return response()->json(['success' => true, 'data' => ['status' => 'approved']]);
        }

        DB::table('ap_bill_approval_instances')->where('id', $instanceId)->update(['current_step' => $instance->current_step + 1, 'updated_at' => now()]);
        return response()->json(['success' => true, 'data' => ['status' => 'pending', 'next_step' => $instance->current_step + 1]]);
    }

    public function storePayment(Request $request)
    {
        $data = $request->validate([
            'supplier_id' => 'required|exists:ap_suppliers,id',
            'payment_date' => 'required|date',
            'payment_method' => 'required|string|max:30',
            'reference' => 'nullable|string|max:80',
            'amount' => 'required|numeric|min:0.01',
            'allocations' => 'required|array|min:1',
            'allocations.*.bill_id' => 'required|exists:ap_bills,id',
            'allocations.*.amount' => 'required|numeric|min:0.01',
        ]);

        return DB::transaction(function () use ($data) {
            $payment = ApPayment::create([
                'supplier_id' => $data['supplier_id'],
                'payment_date' => $data['payment_date'],
                'payment_method' => $data['payment_method'],
                'reference' => $data['reference'] ?? null,
                'amount' => $data['amount'],
            ]);
            $payment = ApPayment::query()
                ->where('supplier_id', $data['supplier_id'])
                ->whereDate('payment_date', $data['payment_date'])
                ->where('payment_method', $data['payment_method'])
                ->where('amount', $data['amount'])
                ->orderByDesc('id')
                ->first() ?? $payment;

            foreach ($data['allocations'] as $alloc) {
                $bill = ApBill::findOrFail($alloc['bill_id']);
                if (!in_array($bill->status, ['approved', 'part_paid'], true)) {
                    return response()->json(['success' => false, 'message' => 'Bill must be approved before payment.'], 422);
                }
                if ((bool) ($bill->matching_blocked ?? false)) {
                    return response()->json(['success' => false, 'message' => 'Bill is blocked by matching workflow.'], 422);
                }
                $duplicateBlocked = DB::table('ap_duplicate_checks')->where('bill_id', $bill->id)->whereIn('result', ['suspected', 'duplicate'])->whereNull('resolved_at')->exists();
                if ($duplicateBlocked) {
                    return response()->json(['success' => false, 'message' => 'Bill has unresolved duplicate check findings.'], 422);
                }

                DB::table('ap_payment_allocations')->insert([
                    'payment_id' => $payment->id,
                    'bill_id' => $alloc['bill_id'],
                    'amount' => $alloc['amount'],
                    'created_at' => now(), 'updated_at' => now(),
                ]);
                $bill->amount_paid = round(((float) $bill->amount_paid + (float) $alloc['amount']), 2);
                $bill->amount_due = round(max(0, (float) $bill->total - (float) $bill->amount_paid), 2);
                $bill->status = $bill->amount_due > 0 ? 'part_paid' : 'paid';
                $bill->save();
            }
            return response()->json(['success' => true, 'data' => $payment], 201);
        });
    }

    public function destroySupplier(int $id)
    {
        $supplier = ApSupplier::findOrFail($id);
        $supplier->delete();
        return response()->json(['success' => true]);
    }

    private function runDuplicateCheck(ApBill $bill): void
    {
        $exact = ApBill::query()->where('id', '!=', $bill->id)
            ->where('supplier_id', $bill->supplier_id)
            ->where('bill_number', $bill->bill_number)
            ->first();

        if ($exact !== null) {
            DB::table('ap_duplicate_checks')->insert([
                'bill_id' => $bill->id,
                'possible_duplicate_bill_id' => $exact->id,
                'rule_code' => 'supplier_bill_number_exact',
                'confidence_score' => 99.0,
                'result' => 'duplicate',
                'evidence' => json_encode(['bill_number' => $bill->bill_number]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('ap_exceptions')->insert([
                'bill_id' => $bill->id,
                'type' => 'duplicate_invoice',
                'status' => 'open',
                'severity' => 'high',
                'message' => 'Exact duplicate invoice number detected for supplier.',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function matchingWorkbench(Request $request)
    {
        $billId = (int) $request->query('bill_id', 0);
        if ($billId <= 0) {
            return response()->json(['success' => true, 'data' => [
                'bill' => null,
                'match' => null,
                'queue' => $this->matchingQueueRows(),
                'suggested' => [
                    'matchType' => 'two_way',
                    'purchaseOrderNo' => null,
                    'grnBatchId' => null,
                ],
            ]]);
        }

        $bill = ApBill::with('supplier:id,name,supplier_code')->find($billId);
        if ($bill === null) {
            return response()->json(['success' => false, 'message' => 'Bill not found for matching workbench.'], 404);
        }

        $existing = DB::table('ap_bill_matches')->where('bill_id', $billId)->orderByDesc('id')->first();

        return response()->json(['success' => true, 'data' => [
            'bill' => $bill,
            'match' => $existing,
            'queue' => $this->matchingQueueRows(),
            'suggested' => [
                'matchType' => 'two_way',
                'purchaseOrderNo' => null,
                'grnBatchId' => null,
            ],
        ]]);
    }

    public function upsertMatch(Request $request, int $billId)
    {
        $bill = ApBill::findOrFail($billId);
        $data = $request->validate([
            'match_type' => 'required|string|in:two_way,three_way',
            'purchase_order_no' => 'nullable|integer',
            'grn_batch_id' => 'nullable|integer',
            'variance_qty' => 'nullable|numeric',
            'variance_amount' => 'nullable|numeric',
            'status' => 'nullable|string|in:pending,matched,partial,exception',
            'exception_note' => 'nullable|string|max:1000',
        ]);

        $varianceQty = abs((float) ($data['variance_qty'] ?? 0));
        $varianceAmount = abs((float) ($data['variance_amount'] ?? 0));

        $tolerance = DB::table('ap_tolerance_policies')
            ->where('active', 1)
            ->orderByDesc('id')
            ->first();

        $status = $data['status'] ?? 'pending';
        $exceptionNote = $data['exception_note'] ?? null;
        $exceeded = false;

        if ($tolerance !== null) {
            $qtyExceeded = $varianceQty > (float) $tolerance->qty_tolerance_percent;
            $amountToleranceValue = round(((float) $bill->total * (float) $tolerance->price_tolerance_percent) / 100, 2);
            $amountExceeded = $varianceAmount > $amountToleranceValue;
            $exceeded = $qtyExceeded || $amountExceeded;

            if ($exceeded) {
                $status = 'exception';
                if ($exceptionNote === null) {
                    $exceptionNote = 'Match variance exceeded tolerance policy.';
                }
            } elseif ($status === 'pending') {
                $status = 'matched';
            }
        }

        $id = DB::table('ap_bill_matches')->insertGetId([
            'bill_id' => $bill->id,
            'purchase_order_no' => $data['purchase_order_no'] ?? null,
            'grn_batch_id' => $data['grn_batch_id'] ?? null,
            'match_type' => $data['match_type'],
            'status' => $status,
            'variance_qty' => $varianceQty,
            'variance_amount' => $varianceAmount,
            'exception_note' => $exceptionNote,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        if ((int) $id <= 0) {
            $id = (int) DB::table('ap_bill_matches')
                ->where('bill_id', $bill->id)
                ->orderByDesc('id')
                ->value('id');
        }

        if ($exceeded) {
            DB::table('ap_exceptions')->insert([
                'bill_id' => $bill->id,
                'type' => 'matching_exception',
                'status' => 'open',
                'severity' => 'medium',
                'message' => $exceptionNote,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json(['success' => true, 'data' => ['match_id' => $id, 'status' => $status]], 201);
    }

    public function agingSummary()
    {
        $buckets = $this->legacyAgingBuckets();
        if (!Schema::hasTable('ap_bills')) {
            return response()->json(['success' => true, 'data' => $buckets]);
        }

        $rows = ApBill::query()->where('amount_due', '>', 0)->get();
        $today = now()->startOfDay();
        foreach ($rows as $bill) {
            $days = $today->diffInDays($bill->due_date, false);
            $pastDue = -1 * min(0, $days);
            $amount = (float) $bill->amount_due;
            if ($pastDue <= 0) $buckets['current'] += $amount;
            elseif ($pastDue <= 30) $buckets['days_1_30'] += $amount;
            elseif ($pastDue <= 60) $buckets['days_31_60'] += $amount;
            elseif ($pastDue <= 90) $buckets['days_61_90'] += $amount;
            else $buckets['days_91_plus'] += $amount;
        }
        return response()->json(['success' => true, 'data' => $buckets]);
    }

    private function legacyAgingBuckets(): array
    {
        $buckets = ['current' => 0.0, 'days_1_30' => 0.0, 'days_31_60' => 0.0, 'days_61_90' => 0.0, 'days_91_plus' => 0.0];
        if (!Schema::hasTable('supptrans')) {
            return $buckets;
        }

        $dueDateColumn = $this->firstExistingColumn('supptrans', ['duedate', 'trandate']);
        if ($dueDateColumn === null) {
            return $buckets;
        }

        $amountExpression = $this->legacySupplierTransactionAmountExpression();
        $today = now()->startOfDay();
        $rows = DB::table('supptrans')
            ->select([
                DB::raw($dueDateColumn . ' as due_date'),
                DB::raw($amountExpression . ' as amount_due'),
            ])
            ->whereRaw($amountExpression . ' > 0')
            ->get();

        foreach ($rows as $row) {
            $dueDate = $row->due_date ? Carbon::parse($row->due_date) : $today;
            $days = $today->diffInDays($dueDate, false);
            $pastDue = -1 * min(0, $days);
            $amount = (float) $row->amount_due;
            if ($pastDue <= 0) $buckets['current'] += $amount;
            elseif ($pastDue <= 30) $buckets['days_1_30'] += $amount;
            elseif ($pastDue <= 60) $buckets['days_31_60'] += $amount;
            elseif ($pastDue <= 90) $buckets['days_61_90'] += $amount;
            else $buckets['days_91_plus'] += $amount;
        }

        return $buckets;
    }

    public function storeRecurringTemplate(Request $request)
    {
        $data = $request->validate([
            'supplier_id' => 'required|exists:ap_suppliers,id',
            'template_name' => 'required|string|max:255',
            'frequency' => 'required|string|in:weekly,monthly,quarterly,yearly',
            'interval_value' => 'nullable|integer|min:1|max:52',
            'start_date' => 'required|date',
            'next_run_date' => 'required|date',
            'default_amount' => 'required|numeric|min:0',
            'requires_approval' => 'nullable|boolean',
        ]);
        $id = DB::table('ap_recurring_bill_templates')->insertGetId([
            'supplier_id' => $data['supplier_id'], 'template_name' => $data['template_name'], 'frequency' => $data['frequency'],
            'interval_value' => $data['interval_value'] ?? 1, 'start_date' => $data['start_date'], 'next_run_date' => $data['next_run_date'],
            'default_amount' => $data['default_amount'], 'requires_approval' => $data['requires_approval'] ?? true, 'active' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        if ((int) $id <= 0) {
            $id = (int) DB::table('ap_recurring_bill_templates')
                ->where('supplier_id', $data['supplier_id'])
                ->where('template_name', $data['template_name'])
                ->orderByDesc('id')
                ->value('id');
        }
        return response()->json(['success' => true, 'data' => ['template_id' => $id]], 201);
    }

    public function storeCreditNote(Request $request)
    {
        $data = $request->validate([
            'supplier_id' => 'required|exists:ap_suppliers,id',
            'credit_number' => 'required|string|max:50',
            'credit_date' => 'required|date',
            'amount_total' => 'required|numeric|min:0.01',
            'reason' => 'nullable|string',
        ]);

        $id = DB::table('ap_credit_notes')->insertGetId([
            'supplier_id' => $data['supplier_id'], 'credit_number' => $data['credit_number'], 'credit_date' => $data['credit_date'],
            'amount_total' => $data['amount_total'], 'amount_available' => $data['amount_total'], 'status' => 'open',
            'reason' => $data['reason'] ?? null, 'created_at' => now(), 'updated_at' => now(),
        ]);
        if ((int) $id <= 0) {
            $id = (int) DB::table('ap_credit_notes')
                ->where('supplier_id', $data['supplier_id'])
                ->where('credit_number', $data['credit_number'])
                ->orderByDesc('id')
                ->value('id');
        }
        return response()->json(['success' => true, 'data' => ['credit_note_id' => $id]], 201);
    }


    public function resolveDuplicateCheck(Request $request, int $checkId)
    {
        $data = $request->validate([
            'result' => 'required|string|in:valid,suspected,duplicate',
            'resolution_note' => 'nullable|string|max:1000',
            'resolved_by_user_id' => 'nullable|string|max:60',
        ]);

        $check = DB::table('ap_duplicate_checks')->where('id', $checkId)->first();
        if ($check === null) {
            return response()->json(['success' => false, 'message' => 'Duplicate check not found.'], 404);
        }

        DB::table('ap_duplicate_checks')->where('id', $checkId)->update([
            'result' => $data['result'],
            'resolved_at' => now(),
            'resolved_by_user_id' => $data['resolved_by_user_id'] ?? null,
            'resolution_note' => $data['resolution_note'] ?? null,
            'updated_at' => now(),
        ]);

        if ($check->bill_id !== null) {
            DB::table('ap_exceptions')->where('bill_id', $check->bill_id)->where('type', 'duplicate_invoice')->where('status', 'open')->update([
                'status' => $data['result'] === 'duplicate' ? 'open' : 'resolved',
                'resolved_at' => $data['result'] === 'duplicate' ? null : now(),
                'resolution_note' => $data['resolution_note'] ?? null,
                'updated_at' => now(),
            ]);
        }

        return response()->json(['success' => true]);
    }

    public function runRecurring(Request $request, RecurringBillService $recurringBillService)
    {
        $data = $request->validate([
            'run_date' => 'nullable|date',
        ]);
        $runDate = $data['run_date'] ?? now()->toDateString();

        $result = $recurringBillService->run($runDate);

        return response()->json(['success' => true, 'data' => $result]);
    }

    public function allocateCredit(Request $request, int $creditNoteId)
    {
        $data = $request->validate([
            'bill_id' => 'required|exists:ap_bills,id',
            'amount' => 'required|numeric|min:0.01',
        ]);

        return DB::transaction(function () use ($creditNoteId, $data) {
            $credit = DB::table('ap_credit_notes')->where('id', $creditNoteId)->lockForUpdate()->first();
            if ($credit === null) return response()->json(['success' => false, 'message' => 'Credit note not found.'], 404);
            if ((float) $credit->amount_available < (float) $data['amount']) return response()->json(['success' => false, 'message' => 'Credit amount exceeds available balance.'], 422);

            $bill = ApBill::lockForUpdate()->findOrFail($data['bill_id']);
            DB::table('ap_credit_allocations')->insert([
                'credit_note_id' => $creditNoteId,
                'bill_id' => $bill->id,
                'amount' => $data['amount'],
                'created_at' => now(), 'updated_at' => now(),
            ]);

            $newAvail = round((float) $credit->amount_available - (float) $data['amount'], 2);
            DB::table('ap_credit_notes')->where('id', $creditNoteId)->update(['amount_available' => $newAvail, 'status' => $newAvail > 0 ? 'open' : 'allocated', 'updated_at' => now()]);

            $bill->amount_due = round(max(0, (float) $bill->amount_due - (float) $data['amount']), 2);
            if ($bill->amount_due === 0.0) $bill->status = 'paid';
            $bill->save();

            return response()->json(['success' => true]);
        });
    }

    public function storeSupplierStatement(Request $request)
    {
        $data = $request->validate([
            'supplier_id' => 'required|exists:ap_suppliers,id',
            'statement_date' => 'required|date',
            'closing_balance' => 'required|numeric|min:0',
        ]);

        $id = DB::table('ap_supplier_statements')->insertGetId([
            'supplier_id' => $data['supplier_id'],
            'statement_date' => $data['statement_date'],
            'closing_balance' => $data['closing_balance'],
            'status' => 'imported',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        if ((int) $id <= 0) {
            $id = (int) DB::table('ap_supplier_statements')
                ->where('supplier_id', $data['supplier_id'])
                ->whereDate('statement_date', $data['statement_date'])
                ->where('closing_balance', $data['closing_balance'])
                ->orderByDesc('id')
                ->value('id');
        }

        return response()->json(['success' => true, 'data' => ['statement_id' => $id]], 201);
    }

    public function reconcileStatement(Request $request, int $statementId)
    {
        $data = $request->validate([
            'lines' => 'required|array|min:1',
            'lines.*.bill_id' => 'nullable|exists:ap_bills,id',
            'lines.*.statement_amount' => 'required|numeric|min:0',
            'lines.*.system_amount' => 'required|numeric|min:0',
            'lines.*.notes' => 'nullable|string|max:500',
        ]);

        foreach ($data['lines'] as $line) {
            $state = ((float) $line['statement_amount'] === (float) $line['system_amount']) ? 'matched' : 'disputed';
            DB::table('ap_statement_reconciliation_lines')->insert([
                'statement_id' => $statementId,
                'bill_id' => $line['bill_id'] ?? null,
                'state' => $state,
                'statement_amount' => $line['statement_amount'],
                'system_amount' => $line['system_amount'],
                'notes' => $line['notes'] ?? null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $hasDispute = DB::table('ap_statement_reconciliation_lines')->where('statement_id', $statementId)->where('state', 'disputed')->exists();
        DB::table('ap_supplier_statements')->where('id', $statementId)->update(['status' => $hasDispute ? 'disputed' : 'resolved', 'updated_at' => now()]);

        return response()->json(['success' => true]);
    }



    public function runApprovalEscalation(ApprovalGovernanceService $approvalGovernanceService)
    {
        $count = $approvalGovernanceService->escalatePendingApprovals();
        return response()->json(['success' => true, 'data' => ['escalated' => $count]]);
    }

    public function createPaymentBatch(Request $request, PaymentBatchService $paymentBatchService)
    {
        $data = $request->validate([
            'bill_ids' => 'required|array|min:1',
            'bill_ids.*' => 'required|integer|exists:ap_bills,id',
            'scheduled_date' => 'nullable|date',
        ]);
        $result = $paymentBatchService->create($data['bill_ids'], $data['scheduled_date'] ?? null);
        return response()->json(['success' => true, 'data' => $result], 201);
    }

    public function approvePaymentBatch(Request $request, int $batchId, PaymentBatchService $paymentBatchService)
    {
        $data = $request->validate(['actor_user_id' => 'required|string|max:60']);
        $paymentBatchService->approve($batchId, $data['actor_user_id']);
        return response()->json(['success' => true]);
    }

    public function executePaymentBatch(int $batchId, PaymentBatchService $paymentBatchService)
    {
        $result = $paymentBatchService->execute($batchId);
        return response()->json(['success' => true, 'data' => $result]);
    }



    public function evaluateMatching(Request $request, int $billId, MatchingLifecycleService $matchingLifecycleService)
    {
        $data = $request->validate([
            'match_mode' => 'required|string|in:two_way,three_way',
            'supplier_id' => 'required|integer',
            'variance_qty' => 'nullable|numeric|min:0',
            'variance_amount' => 'nullable|numeric|min:0',
            'variance_tax' => 'nullable|numeric|min:0',
            'variance_freight' => 'nullable|numeric|min:0',
            'partial_receipt' => 'nullable|boolean',
            'overbilling' => 'nullable|boolean',
        ]);
        $result = $matchingLifecycleService->evaluate($billId, $data);
        return response()->json(['success' => true, 'data' => $result], 201);
    }

    public function approveMatchOverride(Request $request, int $billId, MatchingLifecycleService $matchingLifecycleService)
    {
        $data = $request->validate(['actor_user_id' => 'required|string|max:60']);
        $matchingLifecycleService->override($billId, $data['actor_user_id']);
        return response()->json(['success' => true]);
    }

    public function assignException(Request $request, int $exceptionId, ExceptionQueueService $exceptionQueueService)
    {
        $data = $request->validate(['assigned_to_user_id' => 'required|string|max:60', 'actor_user_id' => 'nullable|string|max:60']);
        $exceptionQueueService->assign($exceptionId, $data['assigned_to_user_id'], $data['actor_user_id'] ?? null);
        return response()->json(['success' => true]);
    }

    public function commentException(Request $request, int $exceptionId, ExceptionQueueService $exceptionQueueService)
    {
        $data = $request->validate(['actor_user_id' => 'required|string|max:60', 'comment' => 'required|string|max:2000']);
        $exceptionQueueService->comment($exceptionId, $data['actor_user_id'], $data['comment']);
        return response()->json(['success' => true]);
    }

    public function escalateException(Request $request, int $exceptionId, ExceptionQueueService $exceptionQueueService)
    {
        $data = $request->validate(['actor_user_id' => 'nullable|string|max:60']);
        $exceptionQueueService->escalate($exceptionId, $data['actor_user_id'] ?? null);
        return response()->json(['success' => true]);
    }

    public function resolveException(Request $request, int $exceptionId, ExceptionQueueService $exceptionQueueService)
    {
        $data = $request->validate(['resolution_code' => 'required|string|max:40', 'actor_user_id' => 'nullable|string|max:60']);
        $exceptionQueueService->resolve($exceptionId, $data['resolution_code'], $data['actor_user_id'] ?? null);
        return response()->json(['success' => true]);
    }

    public function reopenException(Request $request, int $exceptionId, ExceptionQueueService $exceptionQueueService)
    {
        $data = $request->validate(['actor_user_id' => 'nullable|string|max:60']);
        $exceptionQueueService->reopen($exceptionId, $data['actor_user_id'] ?? null);
        return response()->json(['success' => true]);
    }

    public function reverseCreditAllocation(Request $request, int $allocationId, CreditNoteLifecycleService $creditNoteLifecycleService)
    {
        $data = $request->validate(['actor_user_id' => 'required|string|max:60']);
        $creditNoteLifecycleService->reverseAllocation($allocationId, $data['actor_user_id']);
        return response()->json(['success' => true]);
    }

    public function openCreditDispute(Request $request, int $creditNoteId, CreditNoteLifecycleService $creditNoteLifecycleService)
    {
        $data = $request->validate(['owner_user_id' => 'required|string|max:60', 'evidence_meta' => 'nullable|array']);
        $creditNoteLifecycleService->openDispute($creditNoteId, $data['owner_user_id'], $data['evidence_meta'] ?? null);
        return response()->json(['success' => true]);
    }

    public function resolveCreditDispute(int $creditNoteId, CreditNoteLifecycleService $creditNoteLifecycleService)
    {
        $creditNoteLifecycleService->resolveDispute($creditNoteId);
        return response()->json(['success' => true]);
    }



    public function forecasting(Request $request, ForecastingService $forecastingService)
    {
        $days = (int) $request->query('days', 30);
        return response()->json(['success' => true, 'data' => $forecastingService->cashRequirements(max(1, min(365, $days)))]);
    }

    public function overdueTrend(Request $request, ForecastingService $forecastingService)
    {
        $months = (int) $request->query('months', 6);
        return response()->json(['success' => true, 'data' => $forecastingService->overdueTrend(max(1, min(24, $months)))]);
    }

    public function generateSnapshot(Request $request, ForecastingService $forecastingService)
    {
        $data = $request->validate(['snapshot_date' => 'nullable|date']);
        $count = $forecastingService->snapshot($data['snapshot_date'] ?? now()->toDateString());
        return response()->json(['success' => true, 'data' => ['rows_created' => $count]]);
    }

}
