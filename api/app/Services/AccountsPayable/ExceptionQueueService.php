<?php

namespace App\Services\AccountsPayable;

use Illuminate\Support\Facades\DB;

class ExceptionQueueService
{
    public function assign(int $exceptionId, string $assignee, ?string $actor = null): void
    {
        DB::transaction(function () use ($exceptionId, $assignee, $actor) {
            DB::table('ap_exceptions')->where('id', $exceptionId)->update(['assigned_to_user_id' => $assignee, 'status' => 'in_review', 'updated_at' => now()]);
            $this->audit($exceptionId, 'assign', $actor, ['assigned_to' => $assignee]);
        });
    }

    public function comment(int $exceptionId, string $actor, string $comment): void
    {
        DB::transaction(function () use ($exceptionId, $actor, $comment) {
            DB::table('ap_exception_comments')->insert(['exception_id' => $exceptionId, 'actor_user_id' => $actor, 'comment' => $comment, 'created_at' => now(), 'updated_at' => now()]);
            $this->audit($exceptionId, 'comment', $actor, ['comment' => $comment]);
        });
    }

    public function escalate(int $exceptionId, ?string $actor = null): void
    {
        DB::table('ap_exceptions')->where('id', $exceptionId)->update(['status' => 'escalated', 'escalated_at' => now(), 'updated_at' => now()]);
        $this->audit($exceptionId, 'escalate', $actor, null);
    }

    public function resolve(int $exceptionId, string $code, ?string $actor = null): void
    {
        DB::table('ap_exceptions')->where('id', $exceptionId)->update(['status' => 'resolved', 'resolution_code' => $code, 'resolved_at' => now(), 'updated_at' => now()]);
        $this->audit($exceptionId, 'resolve', $actor, ['resolution_code' => $code]);
    }

    public function reopen(int $exceptionId, ?string $actor = null): void
    {
        DB::table('ap_exceptions')->where('id', $exceptionId)->update(['status' => 'open', 'resolved_at' => null, 'updated_at' => now()]);
        $this->audit($exceptionId, 'reopen', $actor, null);
    }

    private function audit(int $exceptionId, string $action, ?string $actor, ?array $context): void
    {
        DB::table('ap_exception_audits')->insert([
            'exception_id' => $exceptionId,
            'action' => $action,
            'actor_user_id' => $actor,
            'context' => $context ? json_encode($context) : null,
            'action_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
