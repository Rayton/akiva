<?php

namespace App\Services\AccountsPayable;

use App\Models\ApBill;
use Illuminate\Support\Facades\DB;

class ApprovalWorkflowService
{
    public function submit(int $billId): array
    {
        $bill = ApBill::findOrFail($billId);

        $policy = DB::table('ap_approval_policies')
            ->where('active', 1)
            ->where('min_amount', '<=', $bill->total)
            ->where(function ($query) use ($bill) {
                $query->whereNull('max_amount')->orWhere('max_amount', '>=', $bill->total);
            })->orderBy('priority')->first();

        if ($policy === null) {
            return ['success' => false, 'status' => 422, 'message' => 'No approval policy configured for this bill total.'];
        }

        $instanceId = DB::table('ap_bill_approval_instances')->insertGetId([
            'bill_id' => $bill->id,
            'policy_id' => $policy->id,
            'current_step' => 1,
            'status' => 'pending',
            'submitted_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $bill->status = 'pending_approval';
        $bill->save();

        return ['success' => true, 'status' => 200, 'data' => ['approval_instance_id' => $instanceId]];
    }
}
