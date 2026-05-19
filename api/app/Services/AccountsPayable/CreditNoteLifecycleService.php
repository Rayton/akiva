<?php

namespace App\Services\AccountsPayable;

use App\Models\ApBill;
use Illuminate\Support\Facades\DB;

class CreditNoteLifecycleService
{
    public function reverseAllocation(int $allocationId, string $actor): void
    {
        DB::transaction(function () use ($allocationId, $actor) {
            $alloc = DB::table('ap_credit_allocations')->where('id', $allocationId)->lockForUpdate()->first();
            if ($alloc === null || $alloc->status === 'reversed') return;

            DB::table('ap_credit_allocations')->where('id', $allocationId)->update(['status' => 'reversed', 'reversed_at' => now(), 'reversed_by_user_id' => $actor, 'updated_at' => now()]);
            DB::table('ap_credit_notes')->where('id', $alloc->credit_note_id)->update(['amount_available' => DB::raw('amount_available + '.(float) $alloc->amount), 'updated_at' => now()]);

            $bill = ApBill::lockForUpdate()->findOrFail($alloc->bill_id);
            $bill->amount_due = round((float) $bill->amount_due + (float) $alloc->amount, 2);
            if ($bill->status === 'paid') $bill->status = 'part_paid';
            $bill->save();
        });
    }

    public function openDispute(int $creditNoteId, string $owner, ?array $evidence): void
    {
        DB::table('ap_credit_notes')->where('id', $creditNoteId)->update([
            'dispute_status' => 'open',
            'dispute_owner_user_id' => $owner,
            'dispute_evidence_meta' => $evidence ? json_encode($evidence) : null,
            'updated_at' => now(),
        ]);
    }

    public function resolveDispute(int $creditNoteId): void
    {
        DB::table('ap_credit_notes')->where('id', $creditNoteId)->update(['dispute_status' => 'resolved', 'updated_at' => now()]);
    }
}
