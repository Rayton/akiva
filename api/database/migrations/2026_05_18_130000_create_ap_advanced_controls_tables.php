<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('ap_approval_policies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('scope', 40)->default('global');
            $table->string('currency_code', 10)->default('USD');
            $table->decimal('min_amount', 18, 2)->default(0);
            $table->decimal('max_amount', 18, 2)->nullable();
            $table->unsignedTinyInteger('priority')->default(1);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['active', 'priority']);
        });

        Schema::create('ap_approval_steps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('policy_id')->constrained('ap_approval_policies');
            $table->unsignedSmallInteger('step_order');
            $table->string('role_code', 60);
            $table->decimal('approval_limit', 18, 2)->nullable();
            $table->unsignedInteger('escalate_after_hours')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['policy_id', 'step_order']);
        });

        Schema::create('ap_bill_approval_instances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bill_id')->constrained('ap_bills');
            $table->foreignId('policy_id')->constrained('ap_approval_policies');
            $table->unsignedSmallInteger('current_step')->default(1);
            $table->string('status', 30)->default('pending');
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['bill_id', 'status']);
        });

        Schema::create('ap_bill_approval_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_instance_id')->constrained('ap_bill_approval_instances');
            $table->unsignedSmallInteger('step_order');
            $table->string('action', 20);
            $table->string('actor_user_id', 60)->nullable();
            $table->text('comment')->nullable();
            $table->timestamp('action_at');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['approval_instance_id', 'step_order']);
        });

        Schema::create('ap_duplicate_checks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bill_id')->constrained('ap_bills');
            $table->foreignId('possible_duplicate_bill_id')->nullable()->constrained('ap_bills');
            $table->string('rule_code', 60);
            $table->decimal('confidence_score', 5, 2)->default(0);
            $table->string('result', 20)->default('clear');
            $table->json('evidence')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['bill_id', 'result']);
        });

        Schema::create('ap_exceptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bill_id')->constrained('ap_bills');
            $table->string('type', 40);
            $table->string('status', 30)->default('open');
            $table->string('severity', 20)->default('medium');
            $table->text('message');
            $table->string('assigned_to', 60)->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->text('resolution_note')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['type', 'status', 'severity']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ap_exceptions');
        Schema::dropIfExists('ap_duplicate_checks');
        Schema::dropIfExists('ap_bill_approval_actions');
        Schema::dropIfExists('ap_bill_approval_instances');
        Schema::dropIfExists('ap_approval_steps');
        Schema::dropIfExists('ap_approval_policies');
    }
};
