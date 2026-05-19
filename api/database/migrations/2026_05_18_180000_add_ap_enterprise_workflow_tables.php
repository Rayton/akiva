<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('ap_approver_delegations', function (Blueprint $table) {
            $table->id();
            $table->string('approver_user_id', 60);
            $table->string('delegate_user_id', 60);
            $table->date('effective_from');
            $table->date('effective_to');
            $table->string('fallback_user_id', 60)->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['approver_user_id', 'effective_from', 'effective_to']);
        });

        Schema::create('ap_approval_limits', function (Blueprint $table) {
            $table->id();
            $table->string('user_id', 60);
            $table->string('department_code', 50)->nullable();
            $table->string('entity_code', 50)->nullable();
            $table->string('currency_code', 10)->default('USD');
            $table->decimal('amount_limit', 18, 2);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::table('ap_approval_policies', function (Blueprint $table) {
            $table->unsignedInteger('escalation_hours')->default(24);
        });

        Schema::table('ap_bill_approval_instances', function (Blueprint $table) {
            $table->timestamp('escalated_at')->nullable();
            $table->string('escalated_to_user_id', 60)->nullable();
        });

        Schema::table('ap_bill_matches', function (Blueprint $table) {
            $table->decimal('variance_tax', 18, 2)->default(0);
            $table->decimal('variance_freight', 18, 2)->default(0);
            $table->string('override_status', 20)->nullable();
            $table->string('override_user_id', 60)->nullable();
            $table->timestamp('override_at')->nullable();
        });

        Schema::create('ap_payment_batches', function (Blueprint $table) {
            $table->id();
            $table->string('batch_number', 40)->unique();
            $table->string('status', 20)->default('draft');
            $table->date('scheduled_date')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->string('approved_by_user_id', 60)->nullable();
            $table->timestamp('executed_at')->nullable();
            $table->decimal('total_amount', 18, 2)->default(0);
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('ap_payment_batch_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('batch_id')->constrained('ap_payment_batches');
            $table->foreignId('bill_id')->constrained('ap_bills');
            $table->decimal('amount', 18, 2);
            $table->string('status', 20)->default('selected');
            $table->text('failure_reason')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['batch_id', 'bill_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ap_payment_batch_lines');
        Schema::dropIfExists('ap_payment_batches');
        Schema::table('ap_bill_matches', function (Blueprint $table) {
            $table->dropColumn(['variance_tax', 'variance_freight', 'override_status', 'override_user_id', 'override_at']);
        });
        Schema::table('ap_bill_approval_instances', function (Blueprint $table) {
            $table->dropColumn(['escalated_at', 'escalated_to_user_id']);
        });
        Schema::table('ap_approval_policies', function (Blueprint $table) {
            $table->dropColumn('escalation_hours');
        });
        Schema::dropIfExists('ap_approval_limits');
        Schema::dropIfExists('ap_approver_delegations');
    }
};
