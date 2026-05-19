<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('ap_matching_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bill_id')->constrained('ap_bills');
            $table->string('match_mode', 20);
            $table->json('snapshot_payload');
            $table->string('status', 30)->default('pending');
            $table->boolean('blocked')->default(false);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['bill_id', 'status']);
        });

        Schema::create('ap_matching_discrepancies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('snapshot_id')->constrained('ap_matching_snapshots');
            $table->string('type', 40);
            $table->decimal('expected_value', 18, 4)->default(0);
            $table->decimal('actual_value', 18, 4)->default(0);
            $table->decimal('variance_value', 18, 4)->default(0);
            $table->string('status', 30)->default('open');
            $table->timestamps();
            $table->softDeletes();
            $table->index(['snapshot_id', 'type']);
        });

        Schema::table('ap_bills', function (Blueprint $table) {
            $table->string('matching_status', 30)->default('pending');
            $table->boolean('matching_blocked')->default(false);
            $table->string('match_override_status', 30)->nullable();
            $table->string('match_override_by_user_id', 60)->nullable();
            $table->timestamp('match_override_at')->nullable();
        });

        Schema::table('ap_exceptions', function (Blueprint $table) {
            $table->string('assigned_to_user_id', 60)->nullable();
            $table->timestamp('due_at')->nullable();
            $table->string('resolution_code', 40)->nullable();
            $table->decimal('fuzzy_score', 8, 4)->nullable();
            $table->timestamp('escalated_at')->nullable();
        });

        Schema::create('ap_exception_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exception_id')->constrained('ap_exceptions');
            $table->string('actor_user_id', 60);
            $table->text('comment');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('ap_exception_audits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exception_id')->constrained('ap_exceptions');
            $table->string('action', 40);
            $table->string('actor_user_id', 60)->nullable();
            $table->json('context')->nullable();
            $table->timestamp('action_at');
            $table->timestamps();
            $table->index(['exception_id', 'action']);
        });

        Schema::table('ap_credit_notes', function (Blueprint $table) {
            $table->string('dispute_status', 30)->default('none');
            $table->string('dispute_owner_user_id', 60)->nullable();
            $table->json('dispute_evidence_meta')->nullable();
        });

        Schema::table('ap_credit_allocations', function (Blueprint $table) {
            $table->string('status', 20)->default('allocated');
            $table->timestamp('reversed_at')->nullable();
            $table->string('reversed_by_user_id', 60)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('ap_credit_allocations', function (Blueprint $table) {
            $table->dropColumn(['status', 'reversed_at', 'reversed_by_user_id']);
        });
        Schema::table('ap_credit_notes', function (Blueprint $table) {
            $table->dropColumn(['dispute_status', 'dispute_owner_user_id', 'dispute_evidence_meta']);
        });
        Schema::dropIfExists('ap_exception_audits');
        Schema::dropIfExists('ap_exception_comments');
        Schema::table('ap_exceptions', function (Blueprint $table) {
            $table->dropColumn(['assigned_to_user_id', 'due_at', 'resolution_code', 'fuzzy_score', 'escalated_at']);
        });
        Schema::table('ap_bills', function (Blueprint $table) {
            $table->dropColumn(['matching_status', 'matching_blocked', 'match_override_status', 'match_override_by_user_id', 'match_override_at']);
        });
        Schema::dropIfExists('ap_matching_discrepancies');
        Schema::dropIfExists('ap_matching_snapshots');
    }
};
