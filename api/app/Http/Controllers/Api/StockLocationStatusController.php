<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockLocationStatusController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json(['success' => true, 'data' => $this->emptyPayload()]);
        }

        try {
            @ini_set('memory_limit', '512M');
            @set_time_limit(90);

            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => $this->locations($filters['userId']),
                    'categories' => $this->categories(),
                    'rows' => $rows->values(),
                    'summary' => $this->summary($rows),
                    'filters' => $filters,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock location status could not be loaded.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('locstock')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locations')
            && Schema::hasTable('locationusers');
    }

    private function emptyPayload(): array
    {
        return [
            'locations' => [],
            'categories' => [],
            'rows' => [],
            'summary' => [
                'items' => 0,
                'onHand' => 0,
                'demand' => 0,
                'available' => 0,
                'onOrder' => 0,
                'belowReorder' => 0,
                'outOfStock' => 0,
                'controlledItems' => 0,
                'movementIn' => 0,
                'movementOut' => 0,
            ],
            'filters' => [],
        ];
    }

    private function filters(Request $request): array
    {
        $userId = $this->currentUserId($request);
        $location = strtoupper(trim((string) $request->query('location', '')));
        if ($location === '' || strtolower($location) === 'all' || !$this->canViewLocation($userId, $location)) {
            $location = $this->defaultLocation($userId);
        }

        $from = $this->validDate((string) $request->query('dateFrom', $request->query('from', '')), Carbon::today()->subMonths(2)->startOfMonth()->toDateString());
        $to = $this->validDate((string) $request->query('dateTo', $request->query('to', '')), Carbon::today()->toDateString());
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        $category = trim((string) $request->query('category', 'All'));
        $status = trim((string) $request->query('status', 'All'));
        $allowedStatuses = ['All', 'Below', 'NotZero', 'OnOrder', 'Short', 'Controlled'];

        return [
            'location' => $location,
            'category' => $category === '' ? 'All' : $category,
            'status' => in_array($status, $allowedStatuses, true) ? $status : 'All',
            'search' => trim((string) $request->query('q', '')),
            'dateFrom' => $from,
            'dateTo' => $to,
            'userId' => $userId,
            'limit' => $this->safeLimit($request->query('limit', 750), 100, 2000),
        ];
    }

    private function rows(array $filters)
    {
        if ($filters['location'] === '') {
            return collect();
        }

        $baseRows = $this->baseRows($filters);
        if ($baseRows->isEmpty()) {
            return collect();
        }

        $stockIds = $baseRows->pluck('stockid')->map(fn ($value) => (string) $value)->all();
        $location = $filters['location'];

        $directDemand = $this->directSalesDemand($stockIds, $location);
        $assemblyDemand = $this->assemblySalesDemand($stockIds, $location);
        $workOrderDemand = $this->workOrderDemand($stockIds, $location);
        $purchaseOnOrder = $this->purchaseOnOrder($stockIds, $location);
        $workOrderOnOrder = $this->workOrderOnOrder($stockIds, $location);
        $movementActivity = $this->movementActivity($stockIds, $location, $filters['dateFrom'], $filters['dateTo']);

        return $baseRows
            ->map(function ($row) use ($directDemand, $assemblyDemand, $workOrderDemand, $purchaseOnOrder, $workOrderOnOrder, $movementActivity) {
                $stockId = (string) $row->stockid;
                $decimalPlaces = (int) ($row->decimalplaces ?? 0);
                $onHand = (float) $row->quantity;
                $reorder = (float) $row->reorderlevel;
                $demand = ($directDemand[$stockId] ?? 0.0) + ($assemblyDemand[$stockId] ?? 0.0) + ($workOrderDemand[$stockId] ?? 0.0);
                $onOrder = ($purchaseOnOrder[$stockId] ?? 0.0) + ($workOrderOnOrder[$stockId] ?? 0.0);
                $available = $onHand - $demand;
                $activity = $movementActivity[$stockId] ?? ['in' => 0.0, 'out' => 0.0, 'net' => 0.0, 'lastDate' => ''];
                $controlled = (bool) $row->controlled || (bool) $row->serialised;

                return [
                    'stockId' => $stockId,
                    'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $stockId)),
                    'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
                    'category' => (string) ($row->categoryid ?? ''),
                    'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid ?: '')),
                    'location' => (string) $row->loccode,
                    'locationName' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
                    'bin' => (string) ($row->bin ?? ''),
                    'onHand' => round($onHand, $decimalPlaces),
                    'reorderLevel' => round($reorder, $decimalPlaces),
                    'demand' => round($demand, $decimalPlaces),
                    'available' => round($available, $decimalPlaces),
                    'onOrder' => round($onOrder, $decimalPlaces),
                    'movementIn' => round((float) $activity['in'], $decimalPlaces),
                    'movementOut' => round((float) $activity['out'], $decimalPlaces),
                    'netMovement' => round((float) $activity['net'], $decimalPlaces),
                    'lastMovementDate' => (string) $activity['lastDate'],
                    'units' => (string) ($row->units ?: ''),
                    'decimalPlaces' => $decimalPlaces,
                    'serialised' => (bool) $row->serialised,
                    'controlled' => (bool) $row->controlled,
                    'controlType' => (bool) $row->serialised ? 'Serialised' : ((bool) $row->controlled ? 'Controlled' : 'Standard'),
                    'status' => $this->rowStatus($onHand, $available, $reorder, $onOrder, $controlled),
                ];
            })
            ->filter(fn ($row) => $this->passesStatus($row, $filters['status']))
            ->values();
    }

    private function baseRows(array $filters)
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->join('locations as loc', 'loc.loccode', '=', 'ls.loccode')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->select(
                'ls.stockid',
                'ls.loccode',
                'ls.bin',
                'ls.quantity',
                'ls.reorderlevel',
                'loc.locationname',
                'sm.description',
                'sm.longdescription',
                'sm.categoryid',
                'sm.decimalplaces',
                'sm.serialised',
                'sm.controlled',
                'sm.units',
                'sc.categorydescription'
            )
            ->where('ls.loccode', $filters['location'])
            ->whereIn('sm.mbflag', ['B', 'M']);

        if ($filters['category'] !== 'All') {
            $query->where('sm.categoryid', $filters['category']);
        }

        if ($filters['search'] !== '') {
            $search = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $filters['search']) . '%';
            $query->where(function ($inner) use ($search) {
                $inner->where('ls.stockid', 'like', $search)
                    ->orWhere('sm.description', 'like', $search)
                    ->orWhere('sm.longdescription', 'like', $search)
                    ->orWhere('ls.bin', 'like', $search)
                    ->orWhere('sm.categoryid', 'like', $search)
                    ->orWhere('sc.categorydescription', 'like', $search);
            });
        }

        return $query
            ->orderBy('ls.stockid')
            ->limit($filters['limit'])
            ->get();
    }

    private function passesStatus(array $row, string $status): bool
    {
        return match ($status) {
            'Below' => ((float) $row['onHand'] - (float) $row['reorderLevel'] - (float) $row['demand']) < 0,
            'NotZero' => ((float) $row['onHand'] - (float) $row['demand']) > 0,
            'OnOrder' => (float) $row['onOrder'] !== 0.0,
            'Short' => (float) $row['available'] < 0,
            'Controlled' => (bool) $row['controlled'] || (bool) $row['serialised'],
            default => true,
        };
    }

    private function rowStatus(float $onHand, float $available, float $reorder, float $onOrder, bool $controlled): string
    {
        if ($available < 0) {
            return 'Short';
        }
        if ($onHand <= 0 && $onOrder > 0) {
            return 'On order';
        }
        if ($onHand <= 0) {
            return 'Out';
        }
        if (($onHand - $reorder) < 0) {
            return 'Below reorder';
        }
        if ($controlled) {
            return 'Controlled';
        }
        return 'Available';
    }

    private function directSalesDemand(array $stockIds, string $location): array
    {
        if (empty($stockIds) || !Schema::hasTable('salesorderdetails') || !Schema::hasTable('salesorders')) {
            return [];
        }

        return DB::table('salesorderdetails as sod')
            ->join('salesorders as so', 'so.orderno', '=', 'sod.orderno')
            ->whereIn('sod.stkcode', $stockIds)
            ->where('so.fromstkloc', $location)
            ->where('sod.completed', 0)
            ->where('so.quotation', 0)
            ->groupBy('sod.stkcode')
            ->select('sod.stkcode')
            ->selectRaw('COALESCE(SUM(sod.quantity - sod.qtyinvoiced), 0) as demand')
            ->pluck('demand', 'stkcode')
            ->map(fn ($value) => max(0, (float) $value))
            ->all();
    }

    private function assemblySalesDemand(array $stockIds, string $location): array
    {
        if (empty($stockIds) || !Schema::hasTable('salesorderdetails') || !Schema::hasTable('salesorders') || !Schema::hasTable('bom')) {
            return [];
        }

        return DB::table('salesorderdetails as sod')
            ->join('salesorders as so', 'so.orderno', '=', 'sod.orderno')
            ->join('bom', 'bom.parent', '=', 'sod.stkcode')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'bom.parent')
            ->whereIn('bom.component', $stockIds)
            ->where('so.fromstkloc', $location)
            ->where('so.quotation', 0)
            ->whereRaw('sod.quantity - sod.qtyinvoiced > 0')
            ->where('sm.mbflag', 'A')
            ->groupBy('bom.component')
            ->select('bom.component')
            ->selectRaw('COALESCE(SUM((sod.quantity - sod.qtyinvoiced) * bom.quantity), 0) as demand')
            ->pluck('demand', 'component')
            ->map(fn ($value) => max(0, (float) $value))
            ->all();
    }

    private function workOrderDemand(array $stockIds, string $location): array
    {
        if (empty($stockIds) || !Schema::hasTable('workorders') || !Schema::hasTable('woitems') || !Schema::hasTable('bom')) {
            return [];
        }

        return DB::table('workorders as wo')
            ->join('woitems as wi', 'wi.wo', '=', 'wo.wo')
            ->join('bom', 'bom.parent', '=', 'wi.stockid')
            ->whereIn('bom.component', $stockIds)
            ->where('wo.closed', 0)
            ->where('wo.loccode', $location)
            ->groupBy('bom.component')
            ->select('bom.component')
            ->selectRaw('COALESCE(SUM((wi.qtyreqd - wi.qtyrecd) * bom.quantity), 0) as demand')
            ->pluck('demand', 'component')
            ->map(fn ($value) => max(0, (float) $value))
            ->all();
    }

    private function purchaseOnOrder(array $stockIds, string $location): array
    {
        if (empty($stockIds) || !Schema::hasTable('purchorders') || !Schema::hasTable('purchorderdetails')) {
            return [];
        }

        return DB::table('purchorderdetails as pod')
            ->join('purchorders as po', 'po.orderno', '=', 'pod.orderno')
            ->whereIn('pod.itemcode', $stockIds)
            ->where('po.intostocklocation', $location)
            ->where('pod.completed', 0)
            ->whereNotIn('po.status', ['Cancelled', 'Completed'])
            ->groupBy('pod.itemcode')
            ->select('pod.itemcode')
            ->selectRaw('COALESCE(SUM(pod.quantityord - pod.quantityrecd), 0) as quantity')
            ->pluck('quantity', 'itemcode')
            ->map(fn ($value) => max(0, (float) $value))
            ->all();
    }

    private function workOrderOnOrder(array $stockIds, string $location): array
    {
        if (empty($stockIds) || !Schema::hasTable('workorders') || !Schema::hasTable('woitems')) {
            return [];
        }

        return DB::table('woitems as wi')
            ->join('workorders as wo', 'wo.wo', '=', 'wi.wo')
            ->whereIn('wi.stockid', $stockIds)
            ->where('wo.loccode', $location)
            ->where('wo.closed', 0)
            ->groupBy('wi.stockid')
            ->select('wi.stockid')
            ->selectRaw('COALESCE(SUM(wi.qtyreqd - wi.qtyrecd), 0) as quantity')
            ->pluck('quantity', 'stockid')
            ->map(fn ($value) => max(0, (float) $value))
            ->all();
    }

    private function movementActivity(array $stockIds, string $location, string $from, string $to): array
    {
        if (empty($stockIds) || !Schema::hasTable('stockmoves')) {
            return [];
        }

        return DB::table('stockmoves')
            ->whereIn('stockid', $stockIds)
            ->where('loccode', $location)
            ->where('hidemovt', 0)
            ->whereDate('trandate', '>=', $from)
            ->whereDate('trandate', '<=', $to)
            ->groupBy('stockid')
            ->select('stockid')
            ->selectRaw('COALESCE(SUM(CASE WHEN qty > 0 THEN qty ELSE 0 END), 0) as movement_in')
            ->selectRaw('COALESCE(SUM(CASE WHEN qty < 0 THEN ABS(qty) ELSE 0 END), 0) as movement_out')
            ->selectRaw('COALESCE(SUM(qty), 0) as net_movement')
            ->selectRaw('MAX(trandate) as last_movement_date')
            ->get()
            ->mapWithKeys(fn ($row) => [
                (string) $row->stockid => [
                    'in' => (float) $row->movement_in,
                    'out' => (float) $row->movement_out,
                    'net' => (float) $row->net_movement,
                    'lastDate' => $row->last_movement_date ? Carbon::parse((string) $row->last_movement_date)->toDateString() : '',
                ],
            ])
            ->all();
    }

    private function summary($rows): array
    {
        return [
            'items' => $rows->count(),
            'onHand' => round((float) $rows->sum('onHand'), 4),
            'demand' => round((float) $rows->sum('demand'), 4),
            'available' => round((float) $rows->sum('available'), 4),
            'onOrder' => round((float) $rows->sum('onOrder'), 4),
            'belowReorder' => $rows->filter(fn ($row) => $row['status'] === 'Below reorder' || $row['status'] === 'Short' || $row['status'] === 'Out')->count(),
            'outOfStock' => $rows->filter(fn ($row) => $row['status'] === 'Out')->count(),
            'controlledItems' => $rows->filter(fn ($row) => $row['controlled'] || $row['serialised'])->count(),
            'movementIn' => round((float) $rows->sum('movementIn'), 4),
            'movementOut' => round((float) $rows->sum('movementOut'), 4),
        ];
    }

    private function locations(string $userId)
    {
        return DB::table('locations')
            ->join('locationusers', function ($join) use ($userId) {
                $join->on('locationusers.loccode', '=', 'locations.loccode')
                    ->where('locationusers.userid', '=', $userId)
                    ->where('locationusers.canview', '=', 1);
            })
            ->select('locations.loccode', 'locations.locationname')
            ->orderBy('locations.locationname')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->loccode,
                'label' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
                'code' => (string) $row->loccode,
            ])
            ->values();
    }

    private function categories()
    {
        if (!Schema::hasTable('stockcategory')) {
            return collect();
        }

        return DB::table('stockcategory')
            ->select('categoryid', 'categorydescription')
            ->orderBy('categorydescription')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->categoryid,
                'label' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
                'code' => (string) $row->categoryid,
            ])
            ->values();
    }

    private function defaultLocation(string $userId): string
    {
        $location = DB::table('locationusers')
            ->where('userid', $userId)
            ->where('canview', 1)
            ->orderBy('loccode')
            ->value('loccode');

        return (string) ($location ?: DB::table('locations')->orderBy('loccode')->value('loccode') ?: '');
    }

    private function canViewLocation(string $userId, string $location): bool
    {
        return DB::table('locationusers')
            ->where('userid', $userId)
            ->where('loccode', $location)
            ->where('canview', 1)
            ->exists();
    }

    private function currentUserId(Request $request): string
    {
        $candidate = trim((string) ($request->header('X-User-Id') ?: $request->query('userId', '')));
        if ($candidate !== '' && Schema::hasTable('www_users') && DB::table('www_users')->where('userid', $candidate)->exists()) {
            return $candidate;
        }
        if (Schema::hasTable('www_users') && DB::table('www_users')->where('userid', 'admin')->exists()) {
            return 'admin';
        }
        return (string) (DB::table('locationusers')->orderBy('userid')->value('userid') ?: 'admin');
    }

    private function validDate(string $value, string $fallback): string
    {
        if ($value === '') {
            return $fallback;
        }
        try {
            return Carbon::parse($value)->toDateString();
        } catch (\Throwable) {
            return $fallback;
        }
    }

    private function safeLimit($value, int $min, int $max): int
    {
        $limit = (int) $value;
        if ($limit < $min) return $min;
        if ($limit > $max) return $max;
        return $limit;
    }
}
