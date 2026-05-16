<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockSerialItemResearchController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => [],
                    'items' => [],
                    'currentSerials' => [],
                    'movements' => [],
                    'summary' => $this->emptySummary(),
                ],
            ]);
        }

        try {
            $serial = trim((string) $request->query('serial', ''));
            $item = strtoupper(trim((string) $request->query('item', '')));
            $location = strtoupper(trim((string) $request->query('location', '')));
            $from = $this->queryDate($request->query('from'));
            $to = $this->queryDate($request->query('to'));

            if ($from !== null && $to !== null && $from > $to) {
                [$from, $to] = [$to, $from];
            }

            $currentSerials = $this->currentSerials($serial, $item, $location);
            $movements = $this->movements($serial, $item, $location, $from, $to);

            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => $this->locations(),
                    'items' => $this->items(),
                    'currentSerials' => $currentSerials,
                    'movements' => $movements,
                    'summary' => $this->summary($currentSerials, $movements),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Serial item research could not be loaded.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('stockserialitems')
            && Schema::hasTable('stockserialmoves')
            && Schema::hasTable('stockmoves')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locations');
    }

    private function currentSerials(string $serial, string $item, string $location)
    {
        $query = DB::table('stockserialitems as ssi')
            ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'ssi.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'ssi.loccode')
            ->select(
                'ssi.stockid',
                'ssi.loccode',
                'ssi.serialno',
                'ssi.quantity',
                'ssi.expirationdate',
                'ssi.qualitytext',
                'ssi.createdate',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.decimalplaces',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), ssi.loccode) as location_name')
            );

        $this->applyCommonFilters($query, 'ssi.serialno', 'ssi.stockid', 'ssi.loccode', $serial, $item, $location);

        return $query
            ->orderByDesc('ssi.quantity')
            ->orderBy('ssi.serialno')
            ->limit(120)
            ->get()
            ->map(function ($row) {
                $expiration = $this->nullableDate((string) $row->expirationdate);
                $quantity = (float) $row->quantity;
                return [
                    'serialNo' => (string) $row->serialno,
                    'stockId' => (string) $row->stockid,
                    'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
                    'location' => (string) $row->loccode,
                    'locationName' => html_entity_decode((string) $row->location_name),
                    'quantity' => $quantity,
                    'expirationDate' => $expiration,
                    'qualityText' => html_entity_decode((string) ($row->qualitytext ?? '')),
                    'createdAt' => $this->nullableDate((string) $row->createdate),
                    'units' => (string) ($row->units ?: ''),
                    'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
                    'status' => $this->serialStatus($quantity, $expiration),
                ];
            })
            ->values();
    }

    private function movements(string $serial, string $item, string $location, ?string $from, ?string $to)
    {
        $query = DB::table('stockserialmoves as ssm')
            ->join('stockmoves as smv', 'smv.stkmoveno', '=', 'ssm.stockmoveno')
            ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'ssm.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'smv.loccode')
            ->leftJoin('systypes as st', 'st.typeid', '=', 'smv.type')
            ->leftJoin('stockserialitems as ssi', function ($join) {
                $join
                    ->on('ssi.stockid', '=', 'ssm.stockid')
                    ->on('ssi.serialno', '=', 'ssm.serialno')
                    ->on('ssi.loccode', '=', 'smv.loccode');
            })
            ->select(
                'ssm.stkitmmoveno',
                'ssm.stockmoveno',
                'ssm.stockid',
                'ssm.serialno',
                'ssm.moveqty',
                'smv.type',
                'smv.transno',
                'smv.loccode',
                'smv.trandate',
                'smv.debtorno',
                'smv.branchcode',
                'smv.reference',
                'smv.qty',
                'smv.newqoh',
                'smv.userid',
                'smv.standardcost',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.decimalplaces',
                'st.typename',
                'ssi.quantity as current_quantity',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), smv.loccode) as location_name')
            );

        $this->applyCommonFilters($query, 'ssm.serialno', 'ssm.stockid', 'smv.loccode', $serial, $item, $location);

        if ($from !== null) {
            $query->whereDate('smv.trandate', '>=', $from);
        }

        if ($to !== null) {
            $query->whereDate('smv.trandate', '<=', $to);
        }

        return $query
            ->orderByDesc('ssm.stockmoveno')
            ->limit(160)
            ->get()
            ->map(function ($row) {
                $moveQty = (float) $row->moveqty;
                $standardCost = (float) $row->standardcost;
                return [
                    'serialMoveNumber' => (int) $row->stkitmmoveno,
                    'stockMoveNumber' => (int) $row->stockmoveno,
                    'serialNo' => (string) $row->serialno,
                    'stockId' => (string) $row->stockid,
                    'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
                    'location' => (string) $row->loccode,
                    'locationName' => html_entity_decode((string) $row->location_name),
                    'transactionDate' => $this->dateOnly((string) $row->trandate),
                    'movementQuantity' => $moveQty,
                    'totalMoveQuantity' => (float) $row->qty,
                    'currentQuantity' => $row->current_quantity === null ? null : (float) $row->current_quantity,
                    'newOnHand' => (float) $row->newqoh,
                    'transactionType' => (int) $row->type,
                    'transactionTypeName' => trim((string) ($row->typename ?: 'Transaction')),
                    'transactionNumber' => (int) $row->transno,
                    'debtorNo' => (string) ($row->debtorno ?? ''),
                    'branchCode' => (string) ($row->branchcode ?? ''),
                    'reference' => html_entity_decode((string) ($row->reference ?? '')),
                    'postedBy' => (string) ($row->userid ?? ''),
                    'units' => (string) ($row->units ?: ''),
                    'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
                    'unitCost' => $standardCost,
                    'value' => $moveQty * $standardCost,
                    'direction' => $moveQty >= 0 ? 'In' : 'Out',
                ];
            })
            ->values();
    }

    private function locations()
    {
        return DB::table('locations')
            ->select('loccode', 'locationname')
            ->orderBy('locationname')
            ->get()
            ->map(function ($row) {
                return [
                    'value' => (string) $row->loccode,
                    'label' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
                    'code' => (string) $row->loccode,
                ];
            })
            ->values();
    }

    private function items()
    {
        return DB::table('stockmaster')
            ->select('stockid', 'description', 'longdescription')
            ->where(function ($query) {
                $query->where('controlled', 1)->orWhere('serialised', 1);
            })
            ->where('discontinued', 0)
            ->orderBy('stockid')
            ->limit(500)
            ->get()
            ->map(function ($row) {
                $description = html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid));
                return [
                    'value' => (string) $row->stockid,
                    'label' => (string) $row->stockid . ' - ' . $description,
                    'code' => (string) $row->stockid,
                ];
            })
            ->values();
    }

    private function summary($currentSerials, $movements): array
    {
        $serials = [];
        foreach ($currentSerials as $row) {
            $serials[(string) $row['serialNo']] = true;
        }
        foreach ($movements as $row) {
            $serials[(string) $row['serialNo']] = true;
        }

        $currentQuantity = 0.0;
        $available = 0;
        $attention = 0;
        foreach ($currentSerials as $row) {
            $quantity = (float) $row['quantity'];
            $currentQuantity += $quantity;
            if ($quantity > 0) {
                $available++;
            }
            if (in_array((string) $row['status'], ['Expired', 'Expiring'], true)) {
                $attention++;
            }
        }

        return [
            'matchingSerials' => count($serials),
            'availableSerials' => $available,
            'currentQuantity' => $currentQuantity,
            'movementLines' => count($movements),
            'lastMovementDate' => count($movements) > 0 ? (string) $movements[0]['transactionDate'] : null,
            'attentionSerials' => $attention,
        ];
    }

    private function emptySummary(): array
    {
        return [
            'matchingSerials' => 0,
            'availableSerials' => 0,
            'currentQuantity' => 0,
            'movementLines' => 0,
            'lastMovementDate' => null,
            'attentionSerials' => 0,
        ];
    }

    private function applyCommonFilters($query, string $serialColumn, string $stockColumn, string $locationColumn, string $serial, string $item, string $location): void
    {
        if ($serial !== '') {
            $query->where($serialColumn, 'like', '%' . $serial . '%');
        }

        if ($item !== '' && $item !== 'ALL') {
            $query->where($stockColumn, $item);
        }

        if ($location !== '' && $location !== 'ALL') {
            $query->where($locationColumn, $location);
        }
    }

    private function serialStatus(float $quantity, ?string $expiration): string
    {
        if ($quantity <= 0) {
            return 'Depleted';
        }

        if ($expiration === null) {
            return 'Available';
        }

        $today = Carbon::today();
        $expiry = Carbon::parse($expiration);
        if ($expiry->lt($today)) {
            return 'Expired';
        }

        if ($expiry->lte($today->copy()->addDays(30))) {
            return 'Expiring';
        }

        return 'Available';
    }

    private function queryDate($value): ?string
    {
        $raw = trim((string) $value);
        if ($raw === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
            return null;
        }

        try {
            return Carbon::parse($raw)->toDateString();
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function nullableDate(string $value): ?string
    {
        $trimmed = trim($value);
        if ($trimmed === '' || str_starts_with($trimmed, '0000-00-00')) {
            return null;
        }

        try {
            return Carbon::parse($trimmed)->toDateString();
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function dateOnly(string $value): string
    {
        try {
            if ($value === '' || substr($value, 0, 10) === '0000-00-00') {
                return Carbon::today()->toDateString();
            }

            return Carbon::parse($value)->toDateString();
        } catch (\Throwable $e) {
            return Carbon::today()->toDateString();
        }
    }
}
