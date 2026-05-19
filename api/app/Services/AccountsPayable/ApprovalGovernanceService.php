<?php

namespace App\Services\AccountsPayable;

use App\Models\ApBill;
use Illuminate\Support\Facades\DB;

class ApprovalGovernanceService
{
    public function canApprove(int $instanceId, string $actorUserId): array
    {
        $instance = DB::table('ap_bill_approval_instances')->where('id', $instanceId)->first();
        if ($instance === null || $instance->status !== 'pending') {
            return ['allowed' => false, 'message' => 'Approval instance not pending.'];
        }

        $bill = ApBill::findOrFail($instance->bill_id);
        $step = DB::table('ap_approval_steps')->where('policy_id', $instance->policy_id)->where('step_order', $instance->current_step)->first();
        if ($step === null) {
            return ['allowed' => false, 'message' => 'Approval step not configured.'];
        }

        $authorizedUser = $step->role_code;
        if ($authorizedUser !== $actorUserId) {
            $today = now()->toDateString();
            $delegation = DB::table('ap_approver_delegations')
                ->where('approver_user_id', $authorizedUser)
                ->where('delegate_user_id', $actorUserId)
                ->where('active', 1)
                ->whereDate('effective_from', '<=', $today)
                ->whereDate('effective_to', '>=', $today)
                ->first();
            if ($delegation === null) {
                return ['allowed' => false, 'message' => 'User not authorized for this approval step.'];
            }
        }

        $limit = DB::table('ap_approval_limits')
            ->where('user_id', $actorUserId)
            ->where('currency_code', 'USD')
            ->orderByDesc('amount_limit')
            ->first();
        if ($limit !== null && (float) $bill->total > (float) $limit->amount_limit) {
            return ['allowed' => false, 'message' => 'Approval amount exceeds approver limit.'];
        }

        return ['allowed' => true, 'bill' => $bill, 'instance' => $instance];
    }

    public function escalatePendingApprovals(): int
    {
        $rows = DB::table('ap_bill_approval_instances as i')
            ->join('ap_approval_policies as p', 'p.id', '=', 'i.policy_id')
            ->where('i.status', 'pending')
            ->whereNull('i.escalated_at')
            ->whereRaw('TIMESTAMPDIFF(HOUR, i.submitted_at, NOW()) >= p.escalation_hours')
            ->select('i.id')
            ->get();

        foreach ($rows as $row) {
            DB::table('ap_bill_approval_instances')->where('id', $row->id)->update([
                'escalated_at' => now(),
                'escalated_to_user_id' => 'finance_controller',
                'updated_at' => now(),
            ]);
            DB::table('ap_bill_approval_actions')->insert([
                'approval_instance_id' => $row->id,
                'step_order' => 0,
                'action' => 'escalate',
                'actor_user_id' => 'system',
                'comment' => 'Escalated due to SLA breach',
                'action_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return $rows->count();
    }
}
