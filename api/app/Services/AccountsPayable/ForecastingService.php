<?php

namespace App\Services\AccountsPayable;

use Illuminate\Support\Facades\DB;

class ForecastingService
{
    public function cashRequirements(int $days = 30): array
    {
        $toDate = now()->addDays($days)->toDateString();
        $rows = DB::table('ap_bills as b')
            ->join('ap_suppliers as s', 's.id', '=', 'b.supplier_id')
            ->where('b.amount_due', '>', 0)
            ->whereDate('b.due_date', '<=', $toDate)
            ->select('s.id as supplier_id', 's.name', DB::raw('SUM(b.amount_due) as amount_due'), DB::raw('MIN(b.due_date) as nearest_due'))
            ->groupBy('s.id', 's.name')
            ->get();

        $total = (float) $rows->sum('amount_due');
        $prioritized = $rows->map(function ($r) {
            $daysToDue = now()->diffInDays($r->nearest_due, false);
            $risk = max(1, 100 - ($daysToDue * 3));
            return [
                'supplier_id' => (int) $r->supplier_id,
                'supplier_name' => $r->name,
                'amount_due' => (float) $r->amount_due,
                'nearest_due' => $r->nearest_due,
                'priority_score' => min(100, $risk + ((float) $r->amount_due > 10000 ? 20 : 0)),
            ];
        })->sortByDesc('priority_score')->values()->all();

        return ['horizon_days' => $days, 'projected_outflow' => $total, 'suppliers' => $prioritized];
    }

    public function overdueTrend(int $months = 6): array
    {
        $data = [];
        for ($i = $months - 1; $i >= 0; $i--) {
            $start = now()->subMonths($i)->startOfMonth()->toDateString();
            $end = now()->subMonths($i)->endOfMonth()->toDateString();
            $overdue = (float) DB::table('ap_bills')->where('amount_due', '>', 0)->whereBetween('due_date', [$start, $end])->sum('amount_due');
            $data[] = ['month' => substr($start, 0, 7), 'overdue_amount' => $overdue];
        }
        return $data;
    }

    public function snapshot(string $snapshotDate): int
    {
        $suppliers = DB::table('ap_suppliers')->pluck('id');
        $created = 0;
        foreach ($suppliers as $supplierId) {
            $bills = DB::table('ap_bills')->where('supplier_id', $supplierId)->where('amount_due', '>', 0)->get();
            $b = ['current_bucket'=>0.0,'days_1_30'=>0.0,'days_31_60'=>0.0,'days_61_90'=>0.0,'days_91_plus'=>0.0];
            foreach ($bills as $bill) {
                $pastDue = max(0, now()->diffInDays($bill->due_date, false) * -1);
                $amt=(float)$bill->amount_due;
                if ($pastDue===0) $b['current_bucket']+=$amt;
                elseif ($pastDue<=30) $b['days_1_30']+=$amt;
                elseif ($pastDue<=60) $b['days_31_60']+=$amt;
                elseif ($pastDue<=90) $b['days_61_90']+=$amt;
                else $b['days_91_plus']+=$amt;
            }
            DB::table('ap_aging_snapshots')->insert([
                'snapshot_date'=>$snapshotDate,'supplier_id'=>$supplierId,'currency_code'=>'USD',
                'current_bucket'=>$b['current_bucket'],'days_1_30'=>$b['days_1_30'],'days_31_60'=>$b['days_31_60'],'days_61_90'=>$b['days_61_90'],'days_91_plus'=>$b['days_91_plus'],
                'created_at'=>now(),'updated_at'=>now(),
            ]);
            $created++;
        }
        return $created;
    }
}

