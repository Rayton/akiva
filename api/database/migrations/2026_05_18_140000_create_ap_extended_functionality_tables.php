<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('ap_tolerance_policies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->decimal('qty_tolerance_percent', 8, 4)->default(0);
            $table->decimal('price_tolerance_percent', 8, 4)->default(0);
            $table->decimal('tax_tolerance_percent', 8, 4)->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('ap_bill_matches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bill_id')->constrained('ap_bills');
            $table->unsignedBigInteger('purchase_order_no')->nullable();
            $table->unsignedBigInteger('grn_batch_id')->nullable();
            $table->string('match_type', 20)->default('two_way');
            $table->string('status', 20)->default('pending');
            $table->decimal('variance_qty', 18, 4)->default(0);
            $table->decimal('variance_amount', 18, 2)->default(0);
            $table->text('exception_note')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['bill_id', 'status']);
        });

        Schema::create('ap_aging_snapshots', function (Blueprint $table) {
            $table->id();
            $table->date('snapshot_date');
            $table->foreignId('supplier_id')->nullable()->constrained('ap_suppliers');
            $table->string('currency_code', 10)->default('USD');
            $table->decimal('current_bucket', 18, 2)->default(0);
            $table->decimal('days_1_30', 18, 2)->default(0);
            $table->decimal('days_31_60', 18, 2)->default(0);
            $table->decimal('days_61_90', 18, 2)->default(0);
            $table->decimal('days_91_plus', 18, 2)->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['snapshot_date', 'supplier_id']);
        });

        Schema::create('ap_recurring_bill_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('ap_suppliers');
            $table->string('template_name');
            $table->string('frequency', 20)->default('monthly');
            $table->unsignedSmallInteger('interval_value')->default(1);
            $table->date('start_date');
            $table->date('next_run_date');
            $table->date('end_date')->nullable();
            $table->decimal('default_amount', 18, 2)->default(0);
            $table->boolean('requires_approval')->default(true);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['active', 'next_run_date']);
        });

        Schema::create('ap_recurring_bill_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('template_id')->constrained('ap_recurring_bill_templates');
            $table->foreignId('bill_id')->nullable()->constrained('ap_bills');
            $table->date('run_date');
            $table->string('status', 20)->default('generated');
            $table->text('message')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['template_id', 'run_date']);
        });

        Schema::create('ap_credit_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('ap_suppliers');
            $table->string('credit_number', 50);
            $table->date('credit_date');
            $table->decimal('amount_total', 18, 2);
            $table->decimal('amount_available', 18, 2);
            $table->string('status', 20)->default('open');
            $table->text('reason')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['supplier_id', 'credit_number']);
        });

        Schema::create('ap_credit_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('credit_note_id')->constrained('ap_credit_notes');
            $table->foreignId('bill_id')->constrained('ap_bills');
            $table->decimal('amount', 18, 2);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('ap_supplier_statements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('ap_suppliers');
            $table->date('statement_date');
            $table->decimal('closing_balance', 18, 2);
            $table->string('status', 20)->default('imported');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('ap_statement_reconciliation_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('statement_id')->constrained('ap_supplier_statements');
            $table->foreignId('bill_id')->nullable()->constrained('ap_bills');
            $table->string('state', 20)->default('unmatched');
            $table->decimal('statement_amount', 18, 2)->default(0);
            $table->decimal('system_amount', 18, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['statement_id', 'state']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ap_statement_reconciliation_lines');
        Schema::dropIfExists('ap_supplier_statements');
        Schema::dropIfExists('ap_credit_allocations');
        Schema::dropIfExists('ap_credit_notes');
        Schema::dropIfExists('ap_recurring_bill_runs');
        Schema::dropIfExists('ap_recurring_bill_templates');
        Schema::dropIfExists('ap_aging_snapshots');
        Schema::dropIfExists('ap_bill_matches');
        Schema::dropIfExists('ap_tolerance_policies');
    }
};
