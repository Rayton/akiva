<?php

namespace App\Services\AccountsPayable;

use App\Models\ApBill;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class RecurringBillService
{
    public function run(string $runDate): array
    {
        $templates = DB::table('ap_recurring_bill_templates')
            ->where('active', 1)
            ->whereDate('next_run_date', '<=', $runDate)
            ->get();

        $generated = [];
        $failures = [];

        DB::transaction(function () use ($templates, $runDate, &$generated, &$failures) {
            foreach ($templates as $template) {
                try {
                    $exists = DB::table('ap_recurring_bill_runs')
                        ->where('template_id', $template->id)
                        ->whereDate('run_date', $runDate)
                        ->exists();

                    if ($exists) {
                        continue;
                    }

                    $bill = ApBill::create([
                        'supplier_id' => $template->supplier_id,
                        'bill_number' => 'REC-'.$template->id.'-'.str_replace('-', '', $runDate),
                        'bill_date' => $runDate,
                        'due_date' => $runDate,
                        'status' => $template->requires_approval ? 'draft' : 'approved',
                        'subtotal' => $template->default_amount,
                        'tax_total' => 0,
                        'total' => $template->default_amount,
                        'amount_paid' => 0,
                        'amount_due' => $template->default_amount,
                        'memo' => 'Generated from recurring template '.$template->template_name,
                    ]);

                    DB::table('ap_recurring_bill_runs')->insert([
                        'template_id' => $template->id,
                        'bill_id' => $bill->id,
                        'run_date' => $runDate,
                        'status' => 'generated',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    $nextDate = match ($template->frequency) {
                        'weekly' => Carbon::parse($template->next_run_date)->addWeeks($template->interval_value),
                        'quarterly' => Carbon::parse($template->next_run_date)->addMonths(3 * $template->interval_value),
                        'yearly' => Carbon::parse($template->next_run_date)->addYears($template->interval_value),
                        default => Carbon::parse($template->next_run_date)->addMonths($template->interval_value),
                    };

                    DB::table('ap_recurring_bill_templates')->where('id', $template->id)->update([
                        'next_run_date' => $nextDate->toDateString(),
                        'updated_at' => now(),
                    ]);

                    $generated[] = $bill->id;
                } catch (\Throwable $e) {
                    DB::table('ap_recurring_bill_runs')->insert([
                        'template_id' => $template->id,
                        'bill_id' => null,
                        'run_date' => $runDate,
                        'status' => 'failed',
                        'message' => $e->getMessage(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $failures[] = ['template_id' => $template->id, 'message' => $e->getMessage()];
                }
            }
        });

        return ['generated_bill_ids' => $generated, 'failures' => $failures];
    }
}
