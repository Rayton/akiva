<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class EnterpriseConfigurationController extends Controller
{
    public function index()
    {
        try {
            $definitions = $this->definitions();
            $entities = [];
            $stats = [];

            foreach ($definitions as $entity => $definition) {
                $rows = $this->rows($entity, $definition);
                $entities[$entity] = $rows;
                $stats[$entity] = count($rows);
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'definitions' => $this->publicDefinitions($definitions),
                    'entities' => $entities,
                    'lookups' => $this->lookups(),
                    'stats' => $stats,
                    'controls' => [
                        'fiscalPeriodEnforcement' => Schema::hasTable('fiscal_periods'),
                        'dimensionCaptureReady' => Schema::hasTable('gltrans_dimensions'),
                        'taxRateVersioningReady' => Schema::hasTable('tax_rate_versions'),
                        'fxRateHistoryReady' => Schema::hasTable('currency_rates'),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Enterprise configuration could not be loaded.',
            ], 500);
        }
    }

    public function store(Request $request, string $entity)
    {
        $entity = $this->normalizeEntity($entity);
        $definition = $this->definition($entity);

        $validator = $this->validator($request, $entity, $definition);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        try {
            $id = DB::transaction(function () use ($definition, $validator) {
                $row = $this->rowForStorage($definition, $validator->validated(), true);
                return DB::table($definition['table'])->insertGetId($row);
            }, 5);

            return response()->json([
                'success' => true,
                'message' => $definition['singular'] . ' created.',
                'data' => array_merge($this->payload(), ['selectedEntity' => $entity, 'selectedId' => $id]),
            ], 201);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function update(Request $request, string $entity, int $id)
    {
        $entity = $this->normalizeEntity($entity);
        $definition = $this->definition($entity);

        if (!$this->exists($definition, $id)) {
            return response()->json([
                'success' => false,
                'message' => $definition['singular'] . ' was not found.',
            ], 404);
        }

        $validator = $this->validator($request, $entity, $definition, $id);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        try {
            DB::transaction(function () use ($entity, $definition, $id, $validator) {
                $before = DB::table($definition['table'])->where('id', $id)->first();
                $row = $this->rowForStorage($definition, $validator->validated(), false);

                DB::table($definition['table'])->where('id', $id)->update($row);

                if ($entity === 'fiscal-periods' && $before && isset($row['status']) && (string) $before->status !== (string) $row['status']) {
                    DB::table('period_status_history')->insert([
                        'fiscal_period_id' => $id,
                        'from_status' => (string) $before->status,
                        'to_status' => (string) $row['status'],
                        'changed_by' => $this->userId(),
                        'reason' => $row['reopen_reason'] ?? null,
                        'metadata' => json_encode(['source' => 'enterprise_configuration']),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    if (in_array((string) $row['status'], ['closed', 'locked'], true)) {
                        DB::table('fiscal_periods')
                            ->where('id', $id)
                            ->update([
                                'closed_at' => now(),
                                'closed_by' => $this->userId(),
                                'updated_at' => now(),
                            ]);
                    }
                }
            }, 5);

            return response()->json([
                'success' => true,
                'message' => $definition['singular'] . ' updated.',
                'data' => array_merge($this->payload(), ['selectedEntity' => $entity, 'selectedId' => $id]),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function destroy(string $entity, int $id)
    {
        $entity = $this->normalizeEntity($entity);
        $definition = $this->definition($entity);

        if (!$this->exists($definition, $id)) {
            return response()->json([
                'success' => false,
                'message' => $definition['singular'] . ' was not found.',
            ], 404);
        }

        $blockers = $this->deleteBlockers($entity, $id);
        if (count($blockers) > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot delete because related records exist.',
                'dependencies' => $blockers,
            ], 409);
        }

        try {
            DB::table($definition['table'])->where('id', $id)->delete();

            return response()->json([
                'success' => true,
                'message' => $definition['singular'] . ' deleted.',
                'data' => $this->payload(),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function periodAction(Request $request, int $id, string $action)
    {
        $action = strtolower(trim($action));
        $status = match ($action) {
            'open' => 'open',
            'close' => 'closed',
            'lock' => 'locked',
            'adjustment' => 'adjustment',
            default => null,
        };

        if ($status === null) {
            return response()->json([
                'success' => false,
                'message' => 'Unknown fiscal period action.',
            ], 404);
        }

        $period = DB::table('fiscal_periods')->where('id', $id)->first();
        if (!$period) {
            return response()->json([
                'success' => false,
                'message' => 'Fiscal period was not found.',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'reason' => [$status === 'open' || $status === 'adjustment' ? 'required' : 'nullable', 'string', 'max:1000'],
            'reopenedUntil' => ['nullable', 'date'],
        ]);

        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $validated = $validator->validated();
        DB::transaction(function () use ($period, $id, $status, $validated) {
            DB::table('period_status_history')->insert([
                'fiscal_period_id' => $id,
                'from_status' => (string) $period->status,
                'to_status' => $status,
                'changed_by' => $this->userId(),
                'reason' => $validated['reason'] ?? null,
                'metadata' => json_encode(['source' => 'period_action']),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('fiscal_periods')->where('id', $id)->update([
                'status' => $status,
                'closed_at' => in_array($status, ['closed', 'locked'], true) ? now() : $period->closed_at,
                'closed_by' => in_array($status, ['closed', 'locked'], true) ? $this->userId() : $period->closed_by,
                'reopened_until' => $validated['reopenedUntil'] ?? null,
                'reopened_by' => in_array($status, ['open', 'adjustment'], true) ? $this->userId() : null,
                'reopen_reason' => $validated['reason'] ?? null,
                'updated_at' => now(),
            ]);
        }, 5);

        return response()->json([
            'success' => true,
            'message' => 'Fiscal period status updated.',
            'data' => $this->payload(),
        ]);
    }

    private function payload(): array
    {
        $definitions = $this->definitions();
        $entities = [];
        $stats = [];

        foreach ($definitions as $entity => $definition) {
            $rows = $this->rows($entity, $definition);
            $entities[$entity] = $rows;
            $stats[$entity] = count($rows);
        }

        return [
            'definitions' => $this->publicDefinitions($definitions),
            'entities' => $entities,
            'lookups' => $this->lookups(),
            'stats' => $stats,
        ];
    }

    private function normalizeEntity(string $entity): string
    {
        $key = strtolower(str_replace('_', '-', trim($entity)));
        abort_unless(isset($this->definitions()[$key]), 404, 'Unknown enterprise configuration area.');
        return $key;
    }

    private function definition(string $entity): array
    {
        return $this->definitions()[$entity];
    }

    private function definitions(): array
    {
        return [
            'fiscal-years' => [
                'table' => 'fiscal_years',
                'label' => 'Fiscal Years',
                'singular' => 'Fiscal year',
                'sort' => ['end_date', 'desc'],
                'fields' => [
                    $this->field('code', 'code', 'Code', 'text', ['required' => true, 'max' => 30, 'unique' => true]),
                    $this->field('name', 'name', 'Name', 'text', ['required' => true, 'max' => 120]),
                    $this->field('startDate', 'start_date', 'Start date', 'date', ['required' => true]),
                    $this->field('endDate', 'end_date', 'End date', 'date', ['required' => true]),
                    $this->field('yearEndMonth', 'year_end_month', 'Year end month', 'number', ['required' => true, 'min' => 1, 'maxValue' => 12]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['draft', 'open', 'closed', 'archived']]),
                    $this->field('baseCurrencyCode', 'base_currency_code', 'Base currency', 'currency', ['nullable' => true]),
                    $this->field('retainedEarningsAccount', 'retained_earnings_account', 'Retained earnings account', 'account', ['nullable' => true]),
                    $this->field('notes', 'notes', 'Notes', 'textarea', ['nullable' => true, 'max' => 2000]),
                ],
            ],
            'fiscal-periods' => [
                'table' => 'fiscal_periods',
                'label' => 'Fiscal Periods',
                'singular' => 'Fiscal period',
                'sort' => ['end_date', 'desc'],
                'fields' => [
                    $this->field('fiscalYearId', 'fiscal_year_id', 'Fiscal year', 'fiscal-year', ['required' => true, 'exists' => ['fiscal_years', 'id']]),
                    $this->field('legacyPeriodNo', 'legacy_period_no', 'Legacy period', 'number', ['nullable' => true, 'unique' => true]),
                    $this->field('periodNo', 'period_no', 'Period no.', 'number', ['required' => true, 'min' => 1, 'maxValue' => 999]),
                    $this->field('name', 'name', 'Name', 'text', ['required' => true, 'max' => 120]),
                    $this->field('startDate', 'start_date', 'Start date', 'date', ['required' => true]),
                    $this->field('endDate', 'end_date', 'End date', 'date', ['required' => true]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['draft', 'open', 'closed', 'locked', 'adjustment']]),
                    $this->field('isAdjustment', 'is_adjustment', 'Adjustment period', 'boolean', ['nullable' => true]),
                    $this->field('reopenedUntil', 'reopened_until', 'Reopened until', 'datetime', ['nullable' => true]),
                    $this->field('reopenReason', 'reopen_reason', 'Reopen reason', 'textarea', ['nullable' => true, 'max' => 1000]),
                ],
            ],
            'financial-dimensions' => [
                'table' => 'financial_dimensions',
                'label' => 'Financial Dimensions',
                'singular' => 'Financial dimension',
                'sort' => ['sort_order', 'asc'],
                'fields' => [
                    $this->field('code', 'code', 'Code', 'text', ['required' => true, 'max' => 30, 'unique' => true]),
                    $this->field('name', 'name', 'Name', 'text', ['required' => true, 'max' => 120]),
                    $this->field('description', 'description', 'Description', 'textarea', ['nullable' => true, 'max' => 1000]),
                    $this->field('isRequired', 'is_required', 'Required on postings', 'boolean', ['nullable' => true]),
                    $this->field('isActive', 'is_active', 'Active', 'boolean', ['nullable' => true]),
                    $this->field('sortOrder', 'sort_order', 'Sort order', 'number', ['nullable' => true, 'min' => 0, 'maxValue' => 9999]),
                ],
            ],
            'dimension-values' => [
                'table' => 'dimension_values',
                'label' => 'Dimension Values',
                'singular' => 'Dimension value',
                'sort' => ['code', 'asc'],
                'fields' => [
                    $this->field('dimensionId', 'dimension_id', 'Dimension', 'dimension', ['required' => true, 'exists' => ['financial_dimensions', 'id']]),
                    $this->field('parentId', 'parent_id', 'Parent value', 'dimension-value', ['nullable' => true, 'exists' => ['dimension_values', 'id']]),
                    $this->field('code', 'code', 'Code', 'text', ['required' => true, 'max' => 50]),
                    $this->field('name', 'name', 'Name', 'text', ['required' => true, 'max' => 160]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['active', 'inactive', 'closed']]),
                    $this->field('startsOn', 'starts_on', 'Starts on', 'date', ['nullable' => true]),
                    $this->field('endsOn', 'ends_on', 'Ends on', 'date', ['nullable' => true]),
                    $this->field('ownerUserId', 'owner_user_id', 'Owner user', 'text', ['nullable' => true, 'max' => 120]),
                ],
            ],
            'donors' => [
                'table' => 'donors',
                'label' => 'Donors',
                'singular' => 'Donor',
                'sort' => ['code', 'asc'],
                'fields' => [
                    $this->field('code', 'code', 'Code', 'text', ['required' => true, 'max' => 50, 'unique' => true]),
                    $this->field('name', 'name', 'Name', 'text', ['required' => true, 'max' => 160]),
                    $this->field('donorType', 'donor_type', 'Type', 'select', ['required' => true, 'options' => ['donor', 'funder', 'partner', 'internal']]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['active', 'inactive', 'closed']]),
                    $this->field('currencyCode', 'currency_code', 'Currency', 'currency', ['nullable' => true]),
                    $this->field('contactName', 'contact_name', 'Contact name', 'text', ['nullable' => true, 'max' => 120]),
                    $this->field('contactEmail', 'contact_email', 'Contact email', 'text', ['nullable' => true, 'max' => 160]),
                ],
            ],
            'grants' => [
                'table' => 'grants',
                'label' => 'Grants',
                'singular' => 'Grant',
                'sort' => ['code', 'asc'],
                'fields' => [
                    $this->field('donorId', 'donor_id', 'Donor', 'donor', ['nullable' => true, 'exists' => ['donors', 'id']]),
                    $this->field('code', 'code', 'Code', 'text', ['required' => true, 'max' => 50, 'unique' => true]),
                    $this->field('name', 'name', 'Name', 'text', ['required' => true, 'max' => 180]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['active', 'inactive', 'closed']]),
                    $this->field('startDate', 'start_date', 'Start date', 'date', ['nullable' => true]),
                    $this->field('endDate', 'end_date', 'End date', 'date', ['nullable' => true]),
                    $this->field('currencyCode', 'currency_code', 'Currency', 'currency', ['nullable' => true]),
                    $this->field('budgetAmount', 'budget_amount', 'Budget amount', 'money', ['nullable' => true, 'min' => 0]),
                    $this->field('restrictionNotes', 'restriction_notes', 'Restriction notes', 'textarea', ['nullable' => true, 'max' => 2000]),
                ],
            ],
            'currency-rates' => [
                'table' => 'currency_rates',
                'label' => 'Currency Rates',
                'singular' => 'Currency rate',
                'sort' => ['rate_date', 'desc'],
                'fields' => [
                    $this->field('currencyCode', 'currency_code', 'Currency', 'currency', ['required' => true]),
                    $this->field('rateDate', 'rate_date', 'Rate date', 'date', ['required' => true]),
                    $this->field('rateType', 'rate_type', 'Rate type', 'select', ['required' => true, 'options' => ['spot', 'month_end', 'budget', 'average']]),
                    $this->field('rate', 'rate', 'Rate', 'rate', ['required' => true, 'min' => 0.00000001]),
                    $this->field('source', 'source', 'Source', 'text', ['nullable' => true, 'max' => 80]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['draft', 'approved', 'inactive']]),
                ],
            ],
            'tax-rate-versions' => [
                'table' => 'tax_rate_versions',
                'label' => 'Tax Rate Versions',
                'singular' => 'Tax rate version',
                'sort' => ['effective_from', 'desc'],
                'fields' => [
                    $this->field('taxAuthorityId', 'tax_authority_id', 'Tax authority', 'tax-authority', ['required' => true, 'exists' => ['taxauthorities', 'taxid']]),
                    $this->field('taxCategoryId', 'tax_category_id', 'Tax category', 'tax-category', ['required' => true, 'exists' => ['taxcategories', 'taxcatid']]),
                    $this->field('taxProvinceId', 'tax_province_id', 'Tax province', 'tax-province', ['required' => true, 'exists' => ['taxprovinces', 'taxprovinceid']]),
                    $this->field('taxType', 'tax_type', 'Tax type', 'select', ['required' => true, 'options' => ['standard', 'input', 'output', 'exempt', 'reverse_charge']]),
                    $this->field('rate', 'rate', 'Rate', 'rate', ['required' => true, 'min' => 0]),
                    $this->field('effectiveFrom', 'effective_from', 'Effective from', 'date', ['required' => true]),
                    $this->field('effectiveTo', 'effective_to', 'Effective to', 'date', ['nullable' => true]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['draft', 'approved', 'inactive']]),
                    $this->field('notes', 'notes', 'Notes', 'textarea', ['nullable' => true, 'max' => 1000]),
                ],
            ],
            'allocation-keys' => [
                'table' => 'allocation_keys',
                'label' => 'Allocation Keys',
                'singular' => 'Allocation key',
                'sort' => ['code', 'asc'],
                'fields' => [
                    $this->field('code', 'code', 'Code', 'text', ['required' => true, 'max' => 80, 'unique' => true]),
                    $this->field('name', 'name', 'Name', 'text', ['required' => true, 'max' => 180]),
                    $this->field('method', 'method', 'Method', 'select', ['required' => true, 'options' => ['percentage', 'fixed', 'statistical']]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['draft', 'approved', 'inactive']]),
                    $this->field('effectiveFrom', 'effective_from', 'Effective from', 'date', ['nullable' => true]),
                    $this->field('effectiveTo', 'effective_to', 'Effective to', 'date', ['nullable' => true]),
                    $this->field('sourceAccountCode', 'source_account_code', 'Source account', 'account', ['nullable' => true]),
                    $this->field('notes', 'notes', 'Notes', 'textarea', ['nullable' => true, 'max' => 2000]),
                ],
            ],
            'allocation-key-lines' => [
                'table' => 'allocation_key_lines',
                'label' => 'Allocation Key Lines',
                'singular' => 'Allocation key line',
                'sort' => ['sort_order', 'asc'],
                'fields' => [
                    $this->field('allocationKeyId', 'allocation_key_id', 'Allocation key', 'allocation-key', ['required' => true, 'exists' => ['allocation_keys', 'id']]),
                    $this->field('sortOrder', 'sort_order', 'Sort order', 'number', ['nullable' => true, 'min' => 0]),
                    $this->field('targetAccountCode', 'target_account_code', 'Target account', 'account', ['nullable' => true]),
                    $this->field('dimensionValueId', 'dimension_value_id', 'Dimension value', 'dimension-value', ['nullable' => true, 'exists' => ['dimension_values', 'id']]),
                    $this->field('percentage', 'percentage', 'Percentage', 'rate', ['nullable' => true, 'min' => 0, 'maxValue' => 100]),
                    $this->field('fixedAmount', 'fixed_amount', 'Fixed amount', 'money', ['nullable' => true, 'min' => 0]),
                    $this->field('narrative', 'narrative', 'Narrative', 'textarea', ['nullable' => true, 'max' => 1000]),
                ],
            ],
            'report-templates' => [
                'table' => 'report_templates',
                'label' => 'Report Templates',
                'singular' => 'Report template',
                'sort' => ['code', 'asc'],
                'fields' => [
                    $this->field('code', 'code', 'Code', 'text', ['required' => true, 'max' => 80, 'unique' => true]),
                    $this->field('name', 'name', 'Name', 'text', ['required' => true, 'max' => 180]),
                    $this->field('reportType', 'report_type', 'Report type', 'select', ['required' => true, 'options' => ['trial_balance', 'balance_sheet', 'income_statement', 'cash_flow', 'budget_vs_actual', 'grant_report', 'tax_report']]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['draft', 'approved', 'inactive']]),
                    $this->field('description', 'description', 'Description', 'textarea', ['nullable' => true, 'max' => 1000]),
                ],
            ],
            'audit-policies' => [
                'table' => 'audit_policies',
                'label' => 'Audit Policies',
                'singular' => 'Audit policy',
                'sort' => ['code', 'asc'],
                'fields' => [
                    $this->field('code', 'code', 'Code', 'text', ['required' => true, 'max' => 80, 'unique' => true]),
                    $this->field('name', 'name', 'Name', 'text', ['required' => true, 'max' => 180]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['active', 'inactive']]),
                    $this->field('retentionMonths', 'retention_months', 'Retention months', 'number', ['required' => true, 'min' => 12, 'maxValue' => 240]),
                    $this->field('description', 'description', 'Description', 'textarea', ['nullable' => true, 'max' => 1000]),
                ],
            ],
            'dashboard-templates' => [
                'table' => 'dashboard_templates',
                'label' => 'Dashboard Templates',
                'singular' => 'Dashboard template',
                'sort' => ['code', 'asc'],
                'fields' => [
                    $this->field('code', 'code', 'Code', 'text', ['required' => true, 'max' => 80, 'unique' => true]),
                    $this->field('name', 'name', 'Name', 'text', ['required' => true, 'max' => 180]),
                    $this->field('roleId', 'role_id', 'Role ID', 'number', ['nullable' => true, 'min' => 0]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['active', 'inactive']]),
                    $this->field('description', 'description', 'Description', 'textarea', ['nullable' => true, 'max' => 1000]),
                ],
            ],
            'notification-rules' => [
                'table' => 'notification_rules',
                'label' => 'Notification Rules',
                'singular' => 'Notification rule',
                'sort' => ['event_name', 'asc'],
                'fields' => [
                    $this->field('code', 'code', 'Code', 'text', ['required' => true, 'max' => 80, 'unique' => true]),
                    $this->field('name', 'name', 'Name', 'text', ['required' => true, 'max' => 180]),
                    $this->field('eventName', 'event_name', 'Event', 'text', ['required' => true, 'max' => 120]),
                    $this->field('channel', 'channel', 'Channel', 'select', ['required' => true, 'options' => ['email', 'sms', 'in_app']]),
                    $this->field('status', 'status', 'Status', 'select', ['required' => true, 'options' => ['active', 'inactive']]),
                    $this->field('recipientType', 'recipient_type', 'Recipient type', 'select', ['required' => true, 'options' => ['role', 'user', 'email', 'mail_group']]),
                    $this->field('recipientValue', 'recipient_value', 'Recipient', 'text', ['nullable' => true, 'max' => 160]),
                    $this->field('escalateAfterHours', 'escalate_after_hours', 'Escalate after hours', 'number', ['nullable' => true, 'min' => 0, 'maxValue' => 8760]),
                ],
            ],
        ];
    }

    private function field(string $name, string $column, string $label, string $type, array $options = []): array
    {
        return array_merge([
            'name' => $name,
            'column' => $column,
            'label' => $label,
            'type' => $type,
        ], $options);
    }

    private function publicDefinitions(array $definitions): array
    {
        $public = [];
        foreach ($definitions as $entity => $definition) {
            $public[$entity] = [
                'label' => $definition['label'],
                'singular' => $definition['singular'],
                'fields' => array_map(static function ($field) {
                    return [
                        'name' => $field['name'],
                        'label' => $field['label'],
                        'type' => $field['type'],
                        'required' => !empty($field['required']),
                        'options' => $field['options'] ?? null,
                    ];
                }, $definition['fields']),
            ];
        }

        return $public;
    }

    private function rows(string $entity, array $definition): array
    {
        if (!Schema::hasTable($definition['table'])) {
            return [];
        }

        $query = DB::table($definition['table'])->select('*');
        if (Schema::hasColumn($definition['table'], 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        [$sortColumn, $direction] = $definition['sort'];
        $query->orderBy($sortColumn, $direction)->limit(1000);

        return $query->get()
            ->map(fn ($row) => $this->rowForResponse($row, $definition))
            ->values()
            ->all();
    }

    private function rowForResponse(object $row, array $definition): array
    {
        $payload = ['id' => (int) $row->id];

        foreach ($definition['fields'] as $field) {
            $value = $row->{$field['column']} ?? null;
            if ($field['type'] === 'boolean') {
                $value = (bool) $value;
            } elseif (in_array($field['type'], ['number', 'money', 'rate'], true) && $value !== null) {
                $value = (float) $value;
            }

            $payload[$field['name']] = $value;
        }

        return $payload;
    }

    private function validator(Request $request, string $entity, array $definition, ?int $id = null)
    {
        $rules = [];

        foreach ($definition['fields'] as $field) {
            $fieldRules = [];
            $fieldRules[] = !empty($field['required']) ? 'required' : 'nullable';

            if ($field['type'] === 'boolean') {
                $fieldRules[] = 'boolean';
            } elseif (in_array($field['type'], ['number', 'money', 'rate'], true)) {
                $fieldRules[] = 'numeric';
                if (isset($field['min'])) {
                    $fieldRules[] = 'min:' . $field['min'];
                }
                if (isset($field['maxValue'])) {
                    $fieldRules[] = 'max:' . $field['maxValue'];
                }
            } elseif (in_array($field['type'], ['date', 'datetime'], true)) {
                $fieldRules[] = 'date';
            } else {
                $fieldRules[] = 'string';
                if (isset($field['max'])) {
                    $fieldRules[] = 'max:' . $field['max'];
                }
            }

            if (!empty($field['options'])) {
                $fieldRules[] = Rule::in($field['options']);
            }

            if (!empty($field['exists'])) {
                $fieldRules[] = Rule::exists($field['exists'][0], $field['exists'][1]);
            }

            if (!empty($field['unique'])) {
                $rule = Rule::unique($definition['table'], $field['column']);
                if ($id !== null) {
                    $rule->ignore($id);
                }
                $fieldRules[] = $rule;
            }

            if ($field['type'] === 'account') {
                $fieldRules[] = Rule::exists('chartmaster', 'accountcode');
            }

            if ($field['type'] === 'currency') {
                $fieldRules[] = Rule::exists('currencies', 'currabrev');
            }

            $rules[$field['name']] = $fieldRules;
        }

        $validator = Validator::make($request->all(), $rules);
        $validator->after(function ($validator) use ($request, $entity) {
            $start = $request->input('startDate') ?? $request->input('effectiveFrom') ?? $request->input('startsOn');
            $end = $request->input('endDate') ?? $request->input('effectiveTo') ?? $request->input('endsOn');
            if ($start && $end && strtotime((string) $end) < strtotime((string) $start)) {
                $validator->errors()->add('endDate', 'The end date must be on or after the start date.');
            }

            if ($entity === 'allocation-key-lines') {
                $percentage = $request->input('percentage');
                $fixedAmount = $request->input('fixedAmount');
                if (($percentage === null || $percentage === '') && ($fixedAmount === null || $fixedAmount === '')) {
                    $validator->errors()->add('percentage', 'Allocation lines require either a percentage or a fixed amount.');
                }
            }
        });

        return $validator;
    }

    private function rowForStorage(array $definition, array $validated, bool $creating): array
    {
        $row = [];

        foreach ($definition['fields'] as $field) {
            if (!array_key_exists($field['name'], $validated)) {
                continue;
            }

            $value = $validated[$field['name']];
            if ($value === '') {
                $value = null;
            }

            if ($field['type'] === 'boolean') {
                $value = !empty($value) ? 1 : 0;
            } elseif (in_array($field['type'], ['text', 'textarea', 'select', 'account', 'currency'], true) && is_string($value)) {
                $value = trim($value);
                if (in_array($field['column'], ['code', 'currency_code', 'base_currency_code', 'accountcode', 'source_account_code', 'target_account_code'], true)) {
                    $value = strtoupper($value);
                }
            }

            $row[$field['column']] = $value;
        }

        $row['updated_at'] = now();
        if ($creating) {
            $row['created_at'] = now();
        }

        return $row;
    }

    private function exists(array $definition, int $id): bool
    {
        return Schema::hasTable($definition['table']) && DB::table($definition['table'])->where('id', $id)->exists();
    }

    private function deleteBlockers(string $entity, int $id): array
    {
        return match ($entity) {
            'fiscal-years' => $this->blockers([
                ['Fiscal periods', 'fiscal_periods', 'fiscal_year_id'],
                ['Year-end runs', 'year_end_runs', 'fiscal_year_id'],
            ], $id),
            'fiscal-periods' => $this->blockers([
                ['Period status history', 'period_status_history', 'fiscal_period_id'],
            ], $id, $this->legacyPeriodBlocker($id)),
            'financial-dimensions' => $this->blockers([
                ['Dimension values', 'dimension_values', 'dimension_id'],
            ], $id),
            'dimension-values' => $this->blockers([
                ['Posting dimensions', 'gltrans_dimensions', 'dimension_value_id'],
                ['Allocation lines', 'allocation_key_lines', 'dimension_value_id'],
                ['Grant budgets', 'grant_budgets', 'dimension_value_id'],
            ], $id),
            'donors' => $this->blockers([
                ['Grants', 'grants', 'donor_id'],
            ], $id),
            'grants' => $this->blockers([
                ['Grant budgets', 'grant_budgets', 'grant_id'],
                ['Grant reporting periods', 'grant_reporting_periods', 'grant_id'],
            ], $id),
            'report-templates' => $this->blockers([
                ['Report lines', 'report_template_lines', 'report_template_id'],
                ['Report presets', 'report_presets', 'report_template_id'],
                ['Scheduled reports', 'scheduled_reports', 'report_template_id'],
            ], $id),
            'audit-policies' => $this->blockers([
                ['Tracked tables', 'audit_tracked_tables', 'audit_policy_id'],
            ], $id),
            'allocation-keys' => $this->blockers([
                ['Allocation lines', 'allocation_key_lines', 'allocation_key_id'],
                ['Recurring allocations', 'recurring_allocations', 'allocation_key_id'],
                ['Allocation batches', 'allocation_batches', 'allocation_key_id'],
            ], $id),
            'dashboard-templates' => $this->blockers([
                ['Dashboard widgets', 'dashboard_widgets', 'dashboard_template_id'],
                ['Dashboard assignments', 'dashboard_assignments', 'dashboard_template_id'],
            ], $id),
            'notification-rules' => $this->blockers([
                ['Notification queue', 'notification_queue', 'notification_rule_id'],
            ], $id),
            default => [],
        };
    }

    private function blockers(array $definitions, int $id, array $extra = []): array
    {
        $blockers = $extra;

        foreach ($definitions as [$name, $table, $column]) {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, $column)) {
                continue;
            }

            $count = (int) DB::table($table)->where($column, $id)->count();
            if ($count > 0) {
                $blockers[] = ['name' => $name, 'count' => $count];
            }
        }

        return $blockers;
    }

    private function legacyPeriodBlocker(int $id): array
    {
        if (!Schema::hasTable('fiscal_periods') || !Schema::hasTable('gltrans')) {
            return [];
        }

        $legacyPeriod = DB::table('fiscal_periods')->where('id', $id)->value('legacy_period_no');
        if ($legacyPeriod === null) {
            return [];
        }

        $count = (int) DB::table('gltrans')->where('periodno', (int) $legacyPeriod)->count();
        return $count > 0 ? [['name' => 'GL transactions', 'count' => $count]] : [];
    }

    private function validationResponse($validator)
    {
        return response()->json([
            'success' => false,
            'message' => 'Validation failed.',
            'errors' => $validator->errors(),
        ], 422);
    }

    private function lookups(): array
    {
        return [
            'accounts' => $this->lookup('chartmaster', 'accountcode', 'accountname', 'accountcode'),
            'currencies' => $this->lookup('currencies', 'currabrev', 'currency', 'currabrev'),
            'fiscalYears' => $this->lookup('fiscal_years', 'id', 'name', 'end_date', ['code']),
            'fiscalPeriods' => $this->lookup('fiscal_periods', 'id', 'name', 'end_date', ['legacy_period_no', 'status']),
            'dimensions' => $this->lookup('financial_dimensions', 'id', 'name', 'sort_order', ['code']),
            'dimensionValues' => $this->lookup('dimension_values', 'id', 'name', 'code', ['code', 'dimension_id']),
            'donors' => $this->lookup('donors', 'id', 'name', 'code', ['code']),
            'allocationKeys' => $this->lookup('allocation_keys', 'id', 'name', 'code', ['code']),
            'taxAuthorities' => $this->lookup('taxauthorities', 'taxid', 'description', 'taxid'),
            'taxCategories' => $this->lookup('taxcategories', 'taxcatid', 'taxcatname', 'taxcatid'),
            'taxProvinces' => $this->lookup('taxprovinces', 'taxprovinceid', 'taxprovincename', 'taxprovinceid'),
        ];
    }

    private function lookup(string $table, string $valueColumn, string $labelColumn, string $sortColumn, array $extraColumns = []): array
    {
        if (!Schema::hasTable($table)) {
            return [];
        }

        $columns = array_values(array_unique(array_merge([$valueColumn, $labelColumn], $extraColumns)));
        $query = DB::table($table)->select($columns);

        if (Schema::hasColumn($table, 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        return $query->orderBy($sortColumn)->limit(1000)->get()
            ->map(static function ($row) use ($valueColumn, $labelColumn, $extraColumns) {
                $item = [
                    'value' => $row->{$valueColumn},
                    'label' => (string) $row->{$labelColumn},
                ];

                foreach ($extraColumns as $column) {
                    $item[$column] = $row->{$column} ?? null;
                }

                return $item;
            })
            ->values()
            ->all();
    }

    private function userId(): string
    {
        $user = request()->user();
        if ($user && isset($user->userid)) {
            return (string) $user->userid;
        }
        if ($user && isset($user->name)) {
            return (string) $user->name;
        }

        return 'system';
    }
}
