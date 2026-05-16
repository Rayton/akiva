<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockStatusController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'items' => [],
                    'locations' => [],
                    'selectedItem' => null,
                    'statusRows' => [],
                    'summary' => $this->emptySummary(),
                ],
            ]);
        }

        try {
            $stockId = strtoupper(trim((string) $request->query('item', '')));
            $location = strtoupper(trim((string) $request->query('location', '')));

            if ($stockId === '' || strtolower($stockId) === 'all') {
                $stockId = $this->defaultStockId();
            }

            $item = $stockId !== '' ? $this->item($stockId) : null;
            $statusRows = $item ? $this->statusRows($stockId, $location, $item) : collect();

            return response()->json([
                'success' => true,
                'data' => [
                    'items' => $this->itemOptions('', 50),
                    'locations' => $this->locations(),
                    'selectedItem' => $item,
                    'statusRows' => $statusRows->values(),
                    'summary' => $this->summary($statusRows),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock status could not be loaded.',
            ], 500);
        }
    }

    public function items(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json(['success' => true, 'data' => []]);
        }

        try {
            $search = trim((string) $request->query('q', ''));
            $limit = $this->safeLimit($request->query('limit', 50), 20, 100);

            return response()->json([
                'success' => true,
                'data' => $this->itemOptions($search, $limit),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Items could not be loaded.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('stockmaster')
            && Schema::hasTable('locstock')
            && Schema::hasTable('locations');
    }

    private function defaultStockId(): string
    {
        $row = DB::table('locstock')
            ->select('stockid')
            ->selectRaw('SUM(quantity) as quantity')
            ->groupBy('stockid')
            ->orderByDesc('quantity')
            ->first();

        if ($row) {
            return (string) $row->stockid;
        }

        return (string) (DB::table('stockmaster')->orderBy('stockid')->value('stockid') ?: '');
    }

    private function item(string $stockId): ?array
    {
        $row = DB::table('stockmaster as sm')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->select(
                'sm.stockid',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.mbflag',
                'sm.decimalplaces',
                'sm.serialised',
                'sm.controlled',
                'sm.categoryid',
                'sc.categorydescription'
            )
            ->where('sm.stockid', $stockId)
            ->first();

        if (!$row) {
            return null;
        }

        return [
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
            'units' => (string) ($row->units ?: ''),
            'mbFlag' => (string) ($row->mbflag ?: ''),
            'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
            'serialised' => (bool) $row->serialised,
            'controlled' => (bool) $row->controlled,
            'category' => (string) ($row->categoryid ?? ''),
            'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid ?: '')),
            'stockHeld' => !in_array(strtoupper((string) $row->mbflag), ['A', 'D', 'K'], true),
        ];
    }

    private function statusRows(string $stockId, string $location, array $item)
    {
        $query = DB::table('locstock as ls')
            ->join('locations as loc', 'loc.loccode', '=', 'ls.loccode')
            ->select(
                'ls.stockid',
                'ls.loccode',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), ls.loccode) as location_name'),
                'ls.quantity',
                'ls.reorderlevel',
                'ls.bin'
            )
            ->where('ls.stockid', $stockId);

        if ($location !== '' && strtolower($location) !== 'all') {
            $query->where('ls.loccode', $location);
        }

        $rows = $query
            ->orderBy('loc.locationname')
            ->get()
            ->map(function ($row) use ($stockId, $item) {
                $locCode = (string) $row->loccode;
                $decimalPlaces = (int) $item['decimalPlaces'];
                $onHand = (float) $row->quantity;
                $reorderLevel = (float) $row->reorderlevel;
                $demand = $this->demand($stockId, $locCode);
                $inTransit = $this->inTransit($stockId, $locCode);
                $onOrder = $this->onOrder($stockId, $locCode);
                $available = (bool) $item['stockHeld']
                    ? $onHand - $demand + min(0, $inTransit)
                    : 0.0;

                return [
                    'stockId' => $stockId,
                    'location' => $locCode,
                    'locationName' => html_entity_decode((string) $row->location_name),
                    'bin' => (string) ($row->bin ?? ''),
                    'onHand' => round($onHand, $decimalPlaces),
                    'reorderLevel' => round($reorderLevel, $decimalPlaces),
                    'demand' => round($demand, $decimalPlaces),
                    'inTransit' => round($inTransit, $decimalPlaces),
                    'available' => round($available, $decimalPlaces),
                    'onOrder' => round($onOrder, $decimalPlaces),
                    'status' => $this->rowStatus($onHand, $available, $reorderLevel, (bool) $item['stockHeld']),
                    'units' => (string) $item['units'],
                    'decimalPlaces' => $decimalPlaces,
                ];
            });

        if ($location !== '' && strtolower($location) !== 'all') {
            return $rows;
        }

        $meaningfulRows = $rows
            ->filter(fn ($row) =>
                (float) $row['onHand'] !== 0.0 ||
                (float) $row['reorderLevel'] !== 0.0 ||
                (float) $row['demand'] !== 0.0 ||
                (float) $row['inTransit'] !== 0.0 ||
                (float) $row['onOrder'] !== 0.0
            )
            ->values();

        return $meaningfulRows->isNotEmpty() ? $meaningfulRows : $rows;
    }

    private function demand(string $stockId, string $location): float
    {
        $demand = 0.0;

        if (Schema::hasTable('salesorderdetails') && Schema::hasTable('salesorders')) {
            $demand += (float) (DB::table('salesorderdetails as sod')
                ->join('salesorders as so', 'so.orderno', '=', 'sod.orderno')
                ->where('so.fromstkloc', $location)
                ->where('sod.completed', 0)
                ->where('so.quotation', 0)
                ->where('sod.stkcode', $stockId)
                ->selectRaw('COALESCE(SUM(sod.quantity - sod.qtyinvoiced), 0) as demand')
                ->value('demand') ?? 0);

            if (Schema::hasTable('bom')) {
                $demand += (float) (DB::table('salesorderdetails as sod')
                    ->join('salesorders as so', 'so.orderno', '=', 'sod.orderno')
                    ->join('bom', 'bom.parent', '=', 'sod.stkcode')
                    ->join('stockmaster as sm', 'sm.stockid', '=', 'bom.parent')
                    ->where('so.fromstkloc', $location)
                    ->where('so.quotation', 0)
                    ->where('sod.quantity', '>', DB::raw('sod.qtyinvoiced'))
                    ->where('bom.component', $stockId)
                    ->where('sm.mbflag', 'A')
                    ->selectRaw('COALESCE(SUM((sod.quantity - sod.qtyinvoiced) * bom.quantity), 0) as demand')
                    ->value('demand') ?? 0);
            }
        }

        if (Schema::hasTable('woitems') && Schema::hasTable('worequirements') && Schema::hasTable('workorders')) {
            $demand += (float) (DB::table('woitems')
                ->join('worequirements', function ($join) {
                    $join->on('woitems.stockid', '=', 'worequirements.parentstockid')
                        ->on('woitems.wo', '=', 'worequirements.wo');
                })
                ->join('workorders', 'woitems.wo', '=', 'workorders.wo')
                ->where('workorders.loccode', $location)
                ->where('worequirements.stockid', $stockId)
                ->where('workorders.closed', 0)
                ->selectRaw('COALESCE(SUM(worequirements.qtypu * (woitems.qtyreqd - woitems.qtyrecd)), 0) as demand')
                ->value('demand') ?? 0);
        }

        return max(0, $demand);
    }

    private function inTransit(string $stockId, string $location): float
    {
        if (!Schema::hasTable('loctransfers')) {
            return 0.0;
        }

        $incoming = (float) (DB::table('loctransfers')
            ->where('stockid', $stockId)
            ->where('recloc', $location)
            ->selectRaw('COALESCE(SUM(shipqty - recqty), 0) as quantity')
            ->value('quantity') ?? 0);

        $outgoing = (float) (DB::table('loctransfers')
            ->where('stockid', $stockId)
            ->where('shiploc', $location)
            ->selectRaw('COALESCE(SUM(shipqty - recqty), 0) as quantity')
            ->value('quantity') ?? 0);

        return $incoming - $outgoing;
    }

    private function onOrder(string $stockId, string $location): float
    {
        $quantity = 0.0;

        if (Schema::hasTable('purchorders') && Schema::hasTable('purchorderdetails')) {
            $quantity += (float) (DB::table('purchorderdetails as pod')
                ->join('purchorders as po', 'po.orderno', '=', 'pod.orderno')
                ->where('pod.itemcode', $stockId)
                ->where('po.intostocklocation', $location)
                ->where('pod.completed', 0)
                ->whereNotIn('po.status', ['Cancelled', 'Pending', 'Rejected', 'Completed'])
                ->selectRaw('COALESCE(SUM(pod.quantityord - pod.quantityrecd), 0) as quantity')
                ->value('quantity') ?? 0);
        }

        if (Schema::hasTable('woitems') && Schema::hasTable('workorders')) {
            $quantity += (float) (DB::table('woitems')
                ->join('workorders', 'woitems.wo', '=', 'workorders.wo')
                ->where('woitems.stockid', $stockId)
                ->where('workorders.loccode', $location)
                ->where('workorders.closed', 0)
                ->selectRaw('COALESCE(SUM(woitems.qtyreqd - woitems.qtyrecd), 0) as quantity')
                ->value('quantity') ?? 0);
        }

        return max(0, $quantity);
    }

    private function rowStatus(float $onHand, float $available, float $reorderLevel, bool $stockHeld): string
    {
        if (!$stockHeld) return 'Non-stock';
        if ($available < 0) return 'Short';
        if ($onHand <= 0) return 'Out';
        if ($reorderLevel > 0 && $available <= $reorderLevel) return 'Reorder';
        return 'Available';
    }

    private function summary($rows): array
    {
        $summary = $this->emptySummary();

        foreach ($rows as $row) {
            $summary['locations'] += 1;
            $summary['onHand'] += (float) $row['onHand'];
            $summary['demand'] += (float) $row['demand'];
            $summary['inTransit'] += (float) $row['inTransit'];
            $summary['available'] += (float) $row['available'];
            $summary['onOrder'] += (float) $row['onOrder'];
            if (in_array($row['status'], ['Short', 'Out', 'Reorder'], true)) {
                $summary['attentionLocations'] += 1;
            }
        }

        return $summary;
    }

    private function emptySummary(): array
    {
        return [
            'locations' => 0,
            'onHand' => 0.0,
            'demand' => 0.0,
            'inTransit' => 0.0,
            'available' => 0.0,
            'onOrder' => 0.0,
            'attentionLocations' => 0,
        ];
    }

    private function locations()
    {
        return DB::table('locations')
            ->select('loccode', 'locationname')
            ->orderBy('locationname')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->loccode,
                'label' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
                'code' => (string) $row->loccode,
            ])
            ->values();
    }

    private function itemOptions(string $search, int $limit)
    {
        $query = DB::table('stockmaster as sm')
            ->leftJoin('locstock as ls', 'ls.stockid', '=', 'sm.stockid')
            ->select('sm.stockid', 'sm.description', 'sm.longdescription')
            ->selectRaw('COALESCE(SUM(ls.quantity), 0) as total_quantity');

        if ($search !== '') {
            $query->where(function ($query) use ($search) {
                $query->where('sm.stockid', 'like', '%' . $search . '%')
                    ->orWhere('sm.description', 'like', '%' . $search . '%')
                    ->orWhere('sm.longdescription', 'like', '%' . $search . '%');
            });
        }

        return $query
            ->groupBy('sm.stockid', 'sm.description', 'sm.longdescription')
            ->orderByDesc('total_quantity')
            ->orderBy('sm.stockid')
            ->limit($limit)
            ->get()
            ->map(function ($row) {
                $description = html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid));

                return [
                    'value' => (string) $row->stockid,
                    'label' => (string) $row->stockid . ' - ' . $description,
                    'code' => (string) $row->stockid,
                    'searchText' => trim((string) $row->stockid . ' ' . $description . ' ' . html_entity_decode((string) ($row->longdescription ?? ''))),
                ];
            })
            ->values();
    }

    private function safeLimit($value, int $min, int $max): int
    {
        $limit = (int) $value;
        if ($limit < $min) return $min;
        if ($limit > $max) return $max;
        return $limit;
    }
}
