<?php

namespace App\Services\AccountsPayable;

use App\Models\ApBill;
use App\Models\ApPayment;
use Illuminate\Support\Facades\DB;

class PaymentBatchService
{
    public function create(array $billIds, ?string $scheduledDate): array
    {
        return DB::transaction(function () use ($billIds, $scheduledDate) {
            $batchNumber = 'PB-'.now()->format('YmdHis');
            $batchId = DB::table('ap_payment_batches')->insertGetId([
                'batch_number' => $batchNumber,
                'status' => 'draft',
                'scheduled_date' => $scheduledDate,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            if ((int) $batchId <= 0) {
                $batchId = (int) DB::table('ap_payment_batches')->where('batch_number', $batchNumber)->value('id');
            }

            $total = 0;
            foreach (ApBill::whereIn('id', $billIds)->lockForUpdate()->get() as $bill) {
                if (!in_array($bill->status, ['approved', 'part_paid'], true)) {
                    continue;
                }
                DB::table('ap_payment_batch_lines')->insert([
                    'batch_id' => $batchId,
                    'bill_id' => $bill->id,
                    'amount' => $bill->amount_due,
                    'status' => 'selected',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $total += (float) $bill->amount_due;
            }

            DB::table('ap_payment_batches')->where('id', $batchId)->update(['total_amount' => $total, 'updated_at' => now()]);
            return ['batch_id' => $batchId, 'batch_number' => $batchNumber, 'total_amount' => $total];
        });
    }

    public function approve(int $batchId, string $userId): void
    {
        DB::table('ap_payment_batches')->where('id', $batchId)->update([
            'status' => 'approved',
            'approved_by_user_id' => $userId,
            'approved_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function execute(int $batchId): array
    {
        return DB::transaction(function () use ($batchId) {
            $batch = DB::table('ap_payment_batches')->where('id', $batchId)->lockForUpdate()->first();
            if ($batch === null || !in_array($batch->status, ['approved', 'scheduled'], true)) {
                return ['executed' => 0, 'failed' => 0];
            }

            $lines = DB::table('ap_payment_batch_lines')->where('batch_id', $batchId)->where('status', 'selected')->get();
            $executed = 0;
            $failed = 0;

            foreach ($lines as $line) {
                $bill = ApBill::lockForUpdate()->find($line->bill_id);
                if ($bill === null || $bill->amount_due <= 0) {
                    $failed++;
                    DB::table('ap_payment_batch_lines')->where('id', $line->id)->update(['status' => 'failed', 'failure_reason' => 'Invalid payable state', 'updated_at' => now()]);
                    continue;
                }

                $payment = ApPayment::create([
                    'supplier_id' => $bill->supplier_id,
                    'payment_date' => now()->toDateString(),
                    'payment_method' => 'batch_transfer',
                    'reference' => $batch->batch_number,
                    'amount' => $line->amount,
                ]);
                $payment = ApPayment::query()
                    ->where('supplier_id', $bill->supplier_id)
                    ->whereDate('payment_date', now()->toDateString())
                    ->where('payment_method', 'batch_transfer')
                    ->where('reference', $batch->batch_number)
                    ->where('amount', $line->amount)
                    ->orderByDesc('id')
                    ->first() ?? $payment;

                DB::table('ap_payment_allocations')->insert([
                    'payment_id' => $payment->id,
                    'bill_id' => $bill->id,
                    'amount' => $line->amount,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $bill->amount_paid = round((float) $bill->amount_paid + (float) $line->amount, 2);
                $bill->amount_due = round(max(0, (float) $bill->total - (float) $bill->amount_paid), 2);
                $bill->status = $bill->amount_due > 0 ? 'part_paid' : 'paid';
                $bill->save();

                DB::table('ap_payment_batch_lines')->where('id', $line->id)->update(['status' => 'executed', 'updated_at' => now()]);
                $executed++;
            }

            DB::table('ap_payment_batches')->where('id', $batchId)->update([
                'status' => 'executed',
                'executed_at' => now(),
                'updated_at' => now(),
            ]);

            return ['executed' => $executed, 'failed' => $failed];
        });
    }
}
