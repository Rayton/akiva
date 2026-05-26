<?php

use Carbon\Carbon;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->createFiscalTables();
        $this->createDimensionAndGrantTables();
        $this->createReportingAndAuditTables();
        $this->createTaxAndFxTables();
        $this->createAllocationAndDashboardTables();
        $this->seedDefaultDimensions();
        $this->seedFiscalPeriodsFromLegacyPeriods();
        $this->seedEnterpriseMenu();
    }

    public function down(): void
    {
        $this->deleteEnterpriseMenu();

        foreach ([
            'notification_queue',
            'notification_events',
            'notification_rules',
            'dashboard_assignments',
            'dashboard_widgets',
            'dashboard_templates',
            'allocation_batch_lines',
            'allocation_batches',
            'allocation_key_lines',
            'recurring_allocations',
            'allocation_keys',
            'fx_revaluation_lines',
            'fx_revaluation_runs',
            'currency_rates',
            'tax_return_lines',
            'tax_return_periods',
            'tax_exemptions',
            'tax_rate_versions',
            'audit_tracked_tables',
            'audit_policies',
            'scheduled_reports',
            'report_presets',
            'report_template_lines',
            'report_templates',
            'grant_reporting_periods',
            'grant_budgets',
            'grants',
            'donors',
            'gltrans_dimensions',
            'dimension_combinations',
            'dimension_values',
            'financial_dimensions',
            'period_status_history',
            'period_reopen_requests',
            'year_end_runs',
            'fiscal_periods',
            'fiscal_years',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }

    private function createFiscalTables(): void
    {
        if (!Schema::hasTable('fiscal_years')) {
            Schema::create('fiscal_years', function (Blueprint $table) {
                $table->id();
                $table->string('entity_code', 30)->default('MAIN')->index();
                $table->string('code', 30)->unique();
                $table->string('name', 120);
                $table->date('start_date');
                $table->date('end_date');
                $table->unsignedTinyInteger('year_end_month')->default(12);
                $table->string('status', 20)->default('draft')->index();
                $table->char('base_currency_code', 3)->nullable()->index();
                $table->string('retained_earnings_account', 20)->nullable()->index();
                $table->string('created_by', 120)->nullable();
                $table->string('approved_by', 120)->nullable();
                $table->timestamp('approved_at')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('fiscal_periods')) {
            Schema::create('fiscal_periods', function (Blueprint $table) {
                $table->id();
                $table->foreignId('fiscal_year_id')->nullable()->index();
                $table->integer('legacy_period_no')->nullable()->unique();
                $table->unsignedSmallInteger('period_no');
                $table->string('name', 120);
                $table->date('start_date');
                $table->date('end_date');
                $table->string('status', 20)->default('draft')->index();
                $table->boolean('is_adjustment')->default(false)->index();
                $table->timestamp('close_started_at')->nullable();
                $table->timestamp('closed_at')->nullable();
                $table->string('closed_by', 120)->nullable();
                $table->timestamp('reopened_until')->nullable();
                $table->string('reopened_by', 120)->nullable();
                $table->text('reopen_reason')->nullable();
                $table->timestamps();
                $table->softDeletes();
                $table->unique(['fiscal_year_id', 'period_no']);
                $table->index(['start_date', 'end_date']);
            });
        }

        $this->ensureSignedIntegerColumn('fiscal_periods', 'legacy_period_no');

        if (!Schema::hasTable('period_status_history')) {
            Schema::create('period_status_history', function (Blueprint $table) {
                $table->id();
                $table->foreignId('fiscal_period_id')->index();
                $table->string('from_status', 20)->nullable();
                $table->string('to_status', 20)->index();
                $table->string('changed_by', 120)->nullable();
                $table->text('reason')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('period_reopen_requests')) {
            Schema::create('period_reopen_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('fiscal_period_id')->index();
                $table->string('requested_by', 120)->nullable();
                $table->string('approved_by', 120)->nullable();
                $table->string('status', 20)->default('pending')->index();
                $table->text('reason');
                $table->timestamp('requested_until')->nullable();
                $table->timestamp('approved_at')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('year_end_runs')) {
            Schema::create('year_end_runs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('fiscal_year_id')->index();
                $table->string('status', 20)->default('draft')->index();
                $table->string('retained_earnings_account', 20)->nullable()->index();
                $table->string('initiated_by', 120)->nullable();
                $table->string('approved_by', 120)->nullable();
                $table->timestamp('approved_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->json('summary')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }
    }

    private function createDimensionAndGrantTables(): void
    {
        if (!Schema::hasTable('financial_dimensions')) {
            Schema::create('financial_dimensions', function (Blueprint $table) {
                $table->id();
                $table->string('code', 30)->unique();
                $table->string('name', 120);
                $table->text('description')->nullable();
                $table->boolean('is_required')->default(false);
                $table->boolean('is_active')->default(true)->index();
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('dimension_values')) {
            Schema::create('dimension_values', function (Blueprint $table) {
                $table->id();
                $table->foreignId('dimension_id')->index();
                $table->foreignId('parent_id')->nullable()->index();
                $table->string('code', 50);
                $table->string('name', 160);
                $table->string('status', 20)->default('active')->index();
                $table->date('starts_on')->nullable();
                $table->date('ends_on')->nullable();
                $table->string('owner_user_id', 120)->nullable()->index();
                $table->json('metadata')->nullable();
                $table->timestamps();
                $table->softDeletes();
                $table->unique(['dimension_id', 'code']);
            });
        }

        if (!Schema::hasTable('dimension_combinations')) {
            Schema::create('dimension_combinations', function (Blueprint $table) {
                $table->id();
                $table->string('combination_hash', 80)->unique();
                $table->string('status', 20)->default('active')->index();
                $table->json('values_json');
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('gltrans_dimensions')) {
            Schema::create('gltrans_dimensions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('gltrans_counterindex')->nullable()->index();
                $table->string('accountcode', 20)->nullable()->index();
                $table->integer('periodno')->nullable()->index();
                $table->foreignId('dimension_value_id')->nullable()->index();
                $table->string('dimension_code', 30)->index();
                $table->string('dimension_value_code', 50)->index();
                $table->decimal('amount', 16, 4)->default(0);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('donors')) {
            Schema::create('donors', function (Blueprint $table) {
                $table->id();
                $table->string('code', 50)->unique();
                $table->string('name', 160);
                $table->string('donor_type', 50)->default('donor')->index();
                $table->string('status', 20)->default('active')->index();
                $table->char('currency_code', 3)->nullable()->index();
                $table->string('contact_name', 120)->nullable();
                $table->string('contact_email', 160)->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('grants')) {
            Schema::create('grants', function (Blueprint $table) {
                $table->id();
                $table->foreignId('donor_id')->nullable()->index();
                $table->string('code', 50)->unique();
                $table->string('name', 180);
                $table->string('status', 20)->default('active')->index();
                $table->date('start_date')->nullable();
                $table->date('end_date')->nullable();
                $table->char('currency_code', 3)->nullable()->index();
                $table->decimal('budget_amount', 16, 2)->default(0);
                $table->text('restriction_notes')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('grant_budgets')) {
            Schema::create('grant_budgets', function (Blueprint $table) {
                $table->id();
                $table->foreignId('grant_id')->index();
                $table->string('budget_line_code', 50);
                $table->string('budget_line_name', 160);
                $table->string('accountcode', 20)->nullable()->index();
                $table->foreignId('dimension_value_id')->nullable()->index();
                $table->decimal('amount', 16, 2)->default(0);
                $table->timestamps();
                $table->softDeletes();
                $table->unique(['grant_id', 'budget_line_code']);
            });
        }

        if (!Schema::hasTable('grant_reporting_periods')) {
            Schema::create('grant_reporting_periods', function (Blueprint $table) {
                $table->id();
                $table->foreignId('grant_id')->index();
                $table->string('code', 50);
                $table->string('name', 160);
                $table->date('start_date');
                $table->date('end_date');
                $table->string('status', 20)->default('open')->index();
                $table->timestamps();
                $table->softDeletes();
                $table->unique(['grant_id', 'code']);
            });
        }
    }

    private function createReportingAndAuditTables(): void
    {
        if (!Schema::hasTable('report_templates')) {
            Schema::create('report_templates', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('name', 180);
                $table->string('report_type', 50)->index();
                $table->string('status', 20)->default('draft')->index();
                $table->text('description')->nullable();
                $table->json('layout_json')->nullable();
                $table->unsignedInteger('version')->default(1);
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('report_template_lines')) {
            Schema::create('report_template_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('report_template_id')->index();
                $table->unsignedInteger('line_no');
                $table->string('label', 180);
                $table->string('line_type', 40)->default('account_range')->index();
                $table->string('account_from', 20)->nullable();
                $table->string('account_to', 20)->nullable();
                $table->string('account_group', 80)->nullable();
                $table->json('filters_json')->nullable();
                $table->string('calculation', 255)->nullable();
                $table->timestamps();
                $table->softDeletes();
                $table->unique(['report_template_id', 'line_no']);
            });
        }

        if (!Schema::hasTable('report_presets')) {
            Schema::create('report_presets', function (Blueprint $table) {
                $table->id();
                $table->foreignId('report_template_id')->index();
                $table->string('code', 80)->unique();
                $table->string('name', 180);
                $table->json('parameters_json');
                $table->string('owner_user_id', 120)->nullable()->index();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('scheduled_reports')) {
            Schema::create('scheduled_reports', function (Blueprint $table) {
                $table->id();
                $table->foreignId('report_template_id')->index();
                $table->string('name', 180);
                $table->string('frequency', 30)->default('monthly')->index();
                $table->json('parameters_json')->nullable();
                $table->json('recipients_json')->nullable();
                $table->string('status', 20)->default('active')->index();
                $table->timestamp('last_run_at')->nullable();
                $table->timestamp('next_run_at')->nullable()->index();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('audit_policies')) {
            Schema::create('audit_policies', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('name', 180);
                $table->string('status', 20)->default('active')->index();
                $table->unsignedInteger('retention_months')->default(84);
                $table->text('description')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('audit_tracked_tables')) {
            Schema::create('audit_tracked_tables', function (Blueprint $table) {
                $table->id();
                $table->foreignId('audit_policy_id')->nullable()->index();
                $table->string('table_name', 80)->unique();
                $table->string('module_name', 80)->index();
                $table->boolean('track_inserts')->default(true);
                $table->boolean('track_updates')->default(true);
                $table->boolean('track_deletes')->default(true);
                $table->boolean('is_critical')->default(false)->index();
                $table->string('status', 20)->default('active')->index();
                $table->timestamps();
                $table->softDeletes();
            });
        }
    }

    private function createTaxAndFxTables(): void
    {
        if (!Schema::hasTable('tax_rate_versions')) {
            Schema::create('tax_rate_versions', function (Blueprint $table) {
                $table->id();
                $table->unsignedInteger('tax_authority_id')->index();
                $table->unsignedInteger('tax_category_id')->index();
                $table->unsignedInteger('tax_province_id')->index();
                $table->string('tax_type', 30)->default('standard')->index();
                $table->decimal('rate', 10, 6);
                $table->date('effective_from')->index();
                $table->date('effective_to')->nullable()->index();
                $table->string('status', 20)->default('draft')->index();
                $table->string('approved_by', 120)->nullable();
                $table->timestamp('approved_at')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();
                $table->softDeletes();
                $table->index(['tax_authority_id', 'tax_category_id', 'tax_province_id', 'effective_from'], 'tax_rate_versions_tax_lookup_idx');
            });
        }

        $this->ensureIndex(
            'tax_rate_versions',
            'tax_rate_versions_tax_lookup_idx',
            ['tax_authority_id', 'tax_category_id', 'tax_province_id', 'effective_from'],
        );

        if (!Schema::hasTable('tax_exemptions')) {
            Schema::create('tax_exemptions', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('name', 180);
                $table->string('party_type', 20)->default('customer')->index();
                $table->string('party_code', 50)->nullable()->index();
                $table->date('effective_from');
                $table->date('effective_to')->nullable();
                $table->string('status', 20)->default('active')->index();
                $table->text('reason')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('tax_return_periods')) {
            Schema::create('tax_return_periods', function (Blueprint $table) {
                $table->id();
                $table->unsignedInteger('tax_authority_id')->index();
                $table->string('code', 80)->unique();
                $table->date('start_date');
                $table->date('end_date');
                $table->string('status', 20)->default('open')->index();
                $table->decimal('input_tax', 16, 2)->default(0);
                $table->decimal('output_tax', 16, 2)->default(0);
                $table->decimal('net_tax', 16, 2)->default(0);
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('tax_return_lines')) {
            Schema::create('tax_return_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tax_return_period_id')->index();
                $table->string('line_code', 80);
                $table->string('description', 180);
                $table->decimal('taxable_amount', 16, 2)->default(0);
                $table->decimal('tax_amount', 16, 2)->default(0);
                $table->json('source_json')->nullable();
                $table->timestamps();
                $table->unique(['tax_return_period_id', 'line_code']);
            });
        }

        if (!Schema::hasTable('currency_rates')) {
            Schema::create('currency_rates', function (Blueprint $table) {
                $table->id();
                $table->char('currency_code', 3)->index();
                $table->date('rate_date')->index();
                $table->string('rate_type', 30)->default('spot')->index();
                $table->decimal('rate', 18, 8);
                $table->string('source', 80)->nullable();
                $table->string('status', 20)->default('approved')->index();
                $table->string('approved_by', 120)->nullable();
                $table->timestamp('approved_at')->nullable();
                $table->timestamps();
                $table->softDeletes();
                $table->unique(['currency_code', 'rate_date', 'rate_type']);
            });
        }

        if (!Schema::hasTable('fx_revaluation_runs')) {
            Schema::create('fx_revaluation_runs', function (Blueprint $table) {
                $table->id();
                $table->integer('period_no')->index();
                $table->date('rate_date');
                $table->string('status', 20)->default('draft')->index();
                $table->string('created_by', 120)->nullable();
                $table->string('approved_by', 120)->nullable();
                $table->timestamp('approved_at')->nullable();
                $table->timestamp('posted_at')->nullable();
                $table->json('summary')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('fx_revaluation_lines')) {
            Schema::create('fx_revaluation_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('fx_revaluation_run_id')->index();
                $table->string('source_module', 30)->index();
                $table->string('source_reference', 80)->index();
                $table->char('currency_code', 3)->index();
                $table->decimal('foreign_balance', 16, 4)->default(0);
                $table->decimal('book_rate', 18, 8)->default(0);
                $table->decimal('closing_rate', 18, 8)->default(0);
                $table->decimal('gain_loss_amount', 16, 4)->default(0);
                $table->string('gain_loss_account', 20)->nullable()->index();
                $table->timestamps();
            });
        }
    }

    private function createAllocationAndDashboardTables(): void
    {
        if (!Schema::hasTable('allocation_keys')) {
            Schema::create('allocation_keys', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('name', 180);
                $table->string('method', 30)->default('percentage')->index();
                $table->string('status', 20)->default('draft')->index();
                $table->date('effective_from')->nullable();
                $table->date('effective_to')->nullable();
                $table->string('source_account_code', 20)->nullable()->index();
                $table->text('notes')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('allocation_key_lines')) {
            Schema::create('allocation_key_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('allocation_key_id')->index();
                $table->unsignedInteger('sort_order')->default(0);
                $table->string('target_account_code', 20)->nullable()->index();
                $table->foreignId('dimension_value_id')->nullable()->index();
                $table->decimal('percentage', 9, 6)->nullable();
                $table->decimal('fixed_amount', 16, 2)->nullable();
                $table->text('narrative')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('recurring_allocations')) {
            Schema::create('recurring_allocations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('allocation_key_id')->index();
                $table->string('frequency', 30)->default('monthly')->index();
                $table->string('status', 20)->default('active')->index();
                $table->date('next_run_date')->nullable()->index();
                $table->date('last_run_date')->nullable();
                $table->json('parameters_json')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('allocation_batches')) {
            Schema::create('allocation_batches', function (Blueprint $table) {
                $table->id();
                $table->foreignId('allocation_key_id')->index();
                $table->integer('period_no')->index();
                $table->string('status', 20)->default('draft')->index();
                $table->decimal('source_amount', 16, 2)->default(0);
                $table->string('created_by', 120)->nullable();
                $table->string('approved_by', 120)->nullable();
                $table->timestamp('approved_at')->nullable();
                $table->timestamp('posted_at')->nullable();
                $table->string('reversal_batch_id', 40)->nullable()->index();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('allocation_batch_lines')) {
            Schema::create('allocation_batch_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('allocation_batch_id')->index();
                $table->string('accountcode', 20)->index();
                $table->foreignId('dimension_value_id')->nullable()->index();
                $table->decimal('amount', 16, 2);
                $table->text('narrative')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('dashboard_templates')) {
            Schema::create('dashboard_templates', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('name', 180);
                $table->integer('role_id')->nullable()->index();
                $table->string('status', 20)->default('active')->index();
                $table->text('description')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('dashboard_widgets')) {
            Schema::create('dashboard_widgets', function (Blueprint $table) {
                $table->id();
                $table->foreignId('dashboard_template_id')->nullable()->index();
                $table->string('code', 80)->index();
                $table->string('name', 180);
                $table->string('widget_type', 50)->index();
                $table->json('configuration_json')->nullable();
                $table->unsignedInteger('sort_order')->default(0);
                $table->string('status', 20)->default('active')->index();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('dashboard_assignments')) {
            Schema::create('dashboard_assignments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('dashboard_template_id')->index();
                $table->string('assignment_type', 20)->default('role')->index();
                $table->string('assignment_value', 120)->index();
                $table->boolean('is_default')->default(true);
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('notification_rules')) {
            Schema::create('notification_rules', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('name', 180);
                $table->string('event_name', 120)->index();
                $table->string('channel', 30)->default('email')->index();
                $table->string('status', 20)->default('active')->index();
                $table->string('recipient_type', 30)->default('role')->index();
                $table->string('recipient_value', 160)->nullable();
                $table->unsignedInteger('escalate_after_hours')->nullable();
                $table->json('conditions_json')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasTable('notification_events')) {
            Schema::create('notification_events', function (Blueprint $table) {
                $table->id();
                $table->string('event_name', 120)->index();
                $table->string('source_module', 80)->index();
                $table->string('source_reference', 120)->nullable()->index();
                $table->string('status', 20)->default('pending')->index();
                $table->json('payload_json')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('notification_queue')) {
            Schema::create('notification_queue', function (Blueprint $table) {
                $table->id();
                $table->foreignId('notification_rule_id')->nullable()->index();
                $table->foreignId('notification_event_id')->nullable()->index();
                $table->string('channel', 30)->default('email')->index();
                $table->string('recipient', 180)->index();
                $table->string('subject', 180)->nullable();
                $table->text('body')->nullable();
                $table->string('status', 20)->default('pending')->index();
                $table->timestamp('scheduled_at')->nullable()->index();
                $table->timestamp('sent_at')->nullable();
                $table->text('last_error')->nullable();
                $table->timestamps();
            });
        }
    }

    private function seedDefaultDimensions(): void
    {
        if (!Schema::hasTable('financial_dimensions')) {
            return;
        }

        $now = now();
        foreach ([
            ['code' => 'DEPARTMENT', 'name' => 'Department', 'sort_order' => 10],
            ['code' => 'COST_CENTER', 'name' => 'Cost Center', 'sort_order' => 20],
            ['code' => 'PROJECT', 'name' => 'Project', 'sort_order' => 30],
            ['code' => 'GRANT', 'name' => 'Grant', 'sort_order' => 40],
            ['code' => 'DONOR', 'name' => 'Donor', 'sort_order' => 50],
            ['code' => 'FUND', 'name' => 'Fund', 'sort_order' => 60],
            ['code' => 'ACTIVITY', 'name' => 'Activity', 'sort_order' => 70],
        ] as $dimension) {
            DB::table('financial_dimensions')->updateOrInsert(
                ['code' => $dimension['code']],
                [
                    'name' => $dimension['name'],
                    'description' => $dimension['name'] . ' reporting dimension',
                    'is_required' => false,
                    'is_active' => true,
                    'sort_order' => $dimension['sort_order'],
                    'updated_at' => $now,
                    'created_at' => $now,
                ]
            );
        }

        if (Schema::hasTable('audit_policies')) {
            DB::table('audit_policies')->updateOrInsert(
                ['code' => 'FINANCIAL_CORE'],
                [
                    'name' => 'Financial Core Audit Policy',
                    'status' => 'active',
                    'retention_months' => 84,
                    'description' => 'Default audit retention policy for financial master data and postings.',
                    'updated_at' => $now,
                    'created_at' => $now,
                ]
            );
        }
    }

    private function seedFiscalPeriodsFromLegacyPeriods(): void
    {
        if (!Schema::hasTable('periods') || !Schema::hasTable('fiscal_years') || !Schema::hasTable('fiscal_periods')) {
            return;
        }

        if (DB::table('fiscal_periods')->whereNotNull('legacy_period_no')->exists()) {
            return;
        }

        $periodRows = DB::table('periods')
            ->select('periodno', 'lastdate_in_period')
            ->orderBy('periodno')
            ->get();

        if ($periodRows->isEmpty()) {
            return;
        }

        $yearEndMonth = $this->configuredYearEndMonth();
        $lockDate = $this->configuredPostingLockDate();
        $baseCurrency = $this->baseCurrencyCode();
        $retainedEarnings = $this->retainedEarningsAccount();
        $periodsByYear = [];
        $previousEnd = null;

        foreach ($periodRows as $row) {
            try {
                $endDate = Carbon::parse((string) $row->lastdate_in_period)->startOfDay();
            } catch (Throwable) {
                continue;
            }

            $startDate = $previousEnd
                ? $previousEnd->copy()->addDay()
                : $endDate->copy()->startOfMonth();

            $fiscalYearEndYear = (int) $endDate->year;
            if ((int) $endDate->month > $yearEndMonth) {
                $fiscalYearEndYear++;
            }

            $periodsByYear[$fiscalYearEndYear][] = [
                'legacy_period_no' => (int) $row->periodno,
                'start_date' => $startDate,
                'end_date' => $endDate,
                'status' => $lockDate && $endDate->lessThanOrEqualTo($lockDate) ? 'closed' : 'open',
            ];

            $previousEnd = $endDate;
        }

        $now = now();
        foreach ($periodsByYear as $year => $periods) {
            $start = collect($periods)->min('start_date');
            $end = collect($periods)->max('end_date');
            $allClosed = collect($periods)->every(static fn ($period) => $period['status'] === 'closed');
            $yearCode = 'FY' . $year;

            DB::table('fiscal_years')->updateOrInsert(
                ['code' => $yearCode],
                [
                    'entity_code' => 'MAIN',
                    'name' => 'Migrated Fiscal Year ' . $year,
                    'start_date' => $start->toDateString(),
                    'end_date' => $end->toDateString(),
                    'year_end_month' => $yearEndMonth,
                    'status' => $allClosed ? 'closed' : 'open',
                    'base_currency_code' => $baseCurrency,
                    'retained_earnings_account' => $retainedEarnings,
                    'updated_at' => $now,
                    'created_at' => $now,
                ]
            );

            $fiscalYearId = (int) DB::table('fiscal_years')->where('code', $yearCode)->value('id');
            foreach (array_values($periods) as $index => $period) {
                DB::table('fiscal_periods')->updateOrInsert(
                    ['legacy_period_no' => $period['legacy_period_no']],
                    [
                        'fiscal_year_id' => $fiscalYearId,
                        'period_no' => $index + 1,
                        'name' => $yearCode . ' P' . str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT),
                        'start_date' => $period['start_date']->toDateString(),
                        'end_date' => $period['end_date']->toDateString(),
                        'status' => $period['status'],
                        'is_adjustment' => false,
                        'closed_at' => $period['status'] === 'closed' ? $now : null,
                        'updated_at' => $now,
                        'created_at' => $now,
                    ]
                );
            }
        }
    }

    private function seedEnterpriseMenu(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        $configurationId = DB::table('menu')->where('parent', -1)->where('caption', 'Configuration')->value('id');
        if ($configurationId === null) {
            $configurationId = $this->insertMenuIfMissing(-1, 'Configuration', '#');
        }

        $enterpriseId = $this->insertMenuIfMissing((int) $configurationId, 'Enterprise Controls', '#');

        foreach ([
            ['Enterprise Configuration', 'enterprise-configuration'],
            ['Fiscal Years', 'fiscal-years'],
            ['Fiscal Periods', 'fiscal-periods'],
            ['Financial Dimensions', 'financial-dimensions'],
            ['Dimension Values', 'dimension-values'],
            ['Grants and Donors', 'grants-and-donors'],
            ['Donors', 'donors'],
            ['Grants', 'grants'],
            ['Tax Rate Versions', 'tax-rate-versions'],
            ['Currency Rates', 'currency-rates'],
            ['Allocation Keys', 'allocation-keys'],
            ['Report Templates', 'report-templates'],
            ['Audit Policies', 'audit-policies'],
            ['Dashboard Templates', 'dashboard-templates'],
            ['Notification Rules', 'notification-rules'],
        ] as [$caption, $href]) {
            $this->insertMenuIfMissing($enterpriseId, $caption, $href);
        }
    }

    private function deleteEnterpriseMenu(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        $enterpriseId = DB::table('menu')->where('caption', 'Enterprise Controls')->value('id');
        if ($enterpriseId === null) {
            return;
        }

        $ids = DB::table('menu')
            ->where('parent', (int) $enterpriseId)
            ->pluck('id')
            ->all();

        foreach ($ids as $id) {
            DB::table('menu')->where('id', (int) $id)->delete();
        }

        DB::table('menu')->where('id', (int) $enterpriseId)->delete();
    }

    private function insertMenuIfMissing(int $parentId, string $caption, string $href): int
    {
        $query = DB::table('menu')->where('parent', $parentId);
        if ($href === '#') {
            $query->where('caption', $caption);
        } else {
            $query->where('href', $href);
        }

        $existingId = $query->value('id');
        if ($existingId !== null) {
            DB::table('menu')->where('id', (int) $existingId)->update(['caption' => $caption]);
            return (int) $existingId;
        }

        $id = ((int) DB::table('menu')->max('id')) + 1;
        DB::table('menu')->insert([
            'id' => $id,
            'parent' => $parentId,
            'caption' => $caption,
            'href' => $href,
        ]);

        return $id;
    }

    private function ensureIndex(string $table, string $indexName, array $columns): void
    {
        if (!Schema::hasTable($table) || $this->indexExists($table, $indexName)) {
            return;
        }

        Schema::table($table, function (Blueprint $schema) use ($columns, $indexName) {
            $schema->index($columns, $indexName);
        });
    }

    private function indexExists(string $table, string $indexName): bool
    {
        $table = str_replace('`', '``', $table);

        return DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$indexName]) !== [];
    }

    private function ensureSignedIntegerColumn(string $table, string $column): void
    {
        if (!Schema::hasTable($table) || !Schema::hasColumn($table, $column)) {
            return;
        }

        $metadata = DB::selectOne(
            'select column_type as type_name from information_schema.columns where table_schema = database() and table_name = ? and column_name = ?',
            [$table, $column],
        );

        if (!$metadata || !str_contains(strtolower((string) $metadata->type_name), 'unsigned')) {
            return;
        }

        $table = str_replace('`', '``', $table);
        $column = str_replace('`', '``', $column);

        DB::statement("ALTER TABLE `{$table}` MODIFY `{$column}` INT NULL");
    }

    private function configuredYearEndMonth(): int
    {
        if (!Schema::hasTable('config')) {
            return 12;
        }

        $value = DB::table('config')->where('confname', 'YearEnd')->value('confvalue');
        $month = is_numeric($value) ? (int) $value : 12;

        return min(12, max(1, $month));
    }

    private function configuredPostingLockDate(): ?Carbon
    {
        if (!Schema::hasTable('config')) {
            return null;
        }

        $value = trim((string) DB::table('config')->where('confname', 'ProhibitPostingsBefore')->value('confvalue'));
        if ($value === '' || $value === '1900-01-01') {
            return null;
        }

        try {
            return Carbon::parse($value)->startOfDay();
        } catch (Throwable) {
            return null;
        }
    }

    private function baseCurrencyCode(): ?string
    {
        if (!Schema::hasTable('companies')) {
            return null;
        }

        $currency = DB::table('companies')->value('currencydefault');
        return $currency ? strtoupper(trim((string) $currency)) : null;
    }

    private function retainedEarningsAccount(): ?string
    {
        if (!Schema::hasTable('companies')) {
            return null;
        }

        $account = DB::table('companies')->value('retainedearnings');
        return $account ? strtoupper(trim((string) $account)) : null;
    }
};
