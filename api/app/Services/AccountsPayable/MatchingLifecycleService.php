<?php

namespace App\Services\AccountsPayable;

use App\Models\ApBill;
use Illuminate\Support\Facades\DB;

class MatchingLifecycleService
{
    public function evaluate(int $billId, array $payload): array
    {
        return DB::transaction(function () use ($billId, $payload) {
            $bill = ApBill::lockForUpdate()->findOrFail($billId);
            $qtyVar = (float) ($payload['variance_qty'] ?? 0);
            $amountVar = (float) ($payload['variance_amount'] ?? 0);
            $taxVar = (float) ($payload['variance_tax'] ?? 0);
            $freightVar = (float) ($payload['variance_freight'] ?? 0);

            $status = 'matched';
            $blocked = false;
            if (($payload['overbilling'] ?? false) || $qtyVar > 0 || $amountVar > 0 || $taxVar > 0 || $freightVar > 0) {
                $status = 'variance_exception';
                $blocked = true;
            }
            if (($payload['partial_receipt'] ?? false)) {
                $status = 'pending';
                $blocked = true;
            }

            $snapshotId = DB::table('ap_matching_snapshots')->insertGetId([
                'bill_id' => $bill->id,
                'match_mode' => $payload['match_mode'],
                'snapshot_payload' => json_encode($payload),
                'status' => $status,
                'blocked' => $blocked,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach (['qty' => $qtyVar, 'amount' => $amountVar, 'tax' => $taxVar, 'freight' => $freightVar] as $type => $variance) {
                if ($variance > 0) {
                    DB::table('ap_matching_discrepancies')->insert([
                        'snapshot_id' => $snapshotId,
                        'type' => $type,
                        'expected_value' => 0,
                        'actual_value' => $variance,
                        'variance_value' => $variance,
                        'status' => 'open',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }

            $bill->matching_status = $status;
            $bill->matching_blocked = $blocked;
            $bill->save();

            return ['snapshot_id' => $snapshotId, 'status' => $status, 'blocked' => $blocked];
        });
    }

    public function override(int $billId, string $userId): void
    {
        DB::table('ap_bills')->where('id', $billId)->update([
            'matching_status' => 'override_approved',
            'matching_blocked' => 0,
            'match_override_status' => 'approved',
            'match_override_by_user_id' => $userId,
            'match_override_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
