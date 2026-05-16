<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class InventoryDashboardController extends Controller
{
    private array $filters = [];

    public function show(Request $request)
    {
        $this->filters = $this->readFilters($request);

        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'currency' => 'TZS',
                    'filters' => $this->filters,
                    'filterOptions' => [
                        'locations' => [],
                        'categories' => [],
                    ],
                    'summary' => $this->emptySummary(),
                    'attentionItems' => [],
                    'recentMovements' => [],
                    'pendingTransfers' => [],
                    'topValueItems' => [],
                    'locationValue' => [],
                    'countActivity' => [],
                    'attentionBreakdown' => [],
                    'movementTrend' => [],
                    'categoryValue' => [],
                ],
            ]);
        }

        try {
            $summary = $this->summary();

            return response()->json([
                'success' => true,
                'data' => [
                    'currency' => $this->currency(),
                    'filters' => $this->filters,
                    'filterOptions' => $this->filterOptions(),
                    'summary' => $summary,
                    'attentionItems' => $this->attentionItems(),
                    'recentMovements' => $this->recentMovements(),
                    'pendingTransfers' => $this->pendingTransfers(),
                    'topValueItems' => $this->topValueItems(),
                    'locationValue' => $this->locationValue(),
                    'countActivity' => $this->countActivity(),
                    'attentionBreakdown' => $this->attentionBreakdown(),
                    'movementTrend' => $this->movementTrend(),
                    'categoryValue' => $this->categoryValue(),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Inventory dashboard could not be loaded.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('stockmaster')
            && Schema::hasTable('locstock')
            && Schema::hasTable('locations');
    }

    private function readFilters(Request $request): array
    {
        $from = $this->validDate((string) $request->query('dateFrom', ''), Carbon::today()->subMonths(2)->startOfMonth()->toDateString());
        $to = $this->validDate((string) $request->query('dateTo', ''), Carbon::today()->toDateString());

        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        return [
            'location' => trim((string) $request->query('location', '')),
            'category' => trim((string) $request->query('category', '')),
            'dateFrom' => $from,
            'dateTo' => $to,
        ];
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

    private function filterOptions(): array
    {
        return [
            'locations' => DB::table('locations')
                ->select('loccode', 'locationname')
                ->orderBy('locationname')
                ->get()
                ->map(fn ($row) => [
                    'value' => (string) $row->loccode,
                    'label' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
                ])
                ->values(),
            'categories' => Schema::hasTable('stockcategory')
                ? DB::table('stockcategory')
                    ->select('categoryid', 'categorydescription')
                    ->orderBy('categorydescription')
                    ->get()
                    ->map(fn ($row) => [
                        'value' => (string) $row->categoryid,
                        'label' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
                    ])
                    ->values()
                : collect(),
        ];
    }

    private function applyStockFilters($query, string $locationAlias = 'ls', string $stockAlias = 'sm')
    {
        if ($this->filters['location'] !== '') {
            $query->where("{$locationAlias}.loccode", $this->filters['location']);
        }

        if ($this->filters['category'] !== '') {
            $query->where("{$stockAlias}.categoryid", $this->filters['category']);
        }

        return $query;
    }

    private function applyActivityDates($query, string $dateColumn)
    {
        return $query
            ->whereDate($dateColumn, '>=', $this->filters['dateFrom'])
            ->whereDate($dateColumn, '<=', $this->filters['dateTo']);
    }

    private function applyMovementFilters($query, string $movementAlias = 'smv', string $stockAlias = 'sm')
    {
        $this->applyActivityDates($query, "{$movementAlias}.trandate");

        if ($this->filters['location'] !== '') {
            $query->where("{$movementAlias}.loccode", $this->filters['location']);
        }

        if ($this->filters['category'] !== '') {
            $query->where("{$stockAlias}.categoryid", $this->filters['category']);
        }

        return $query;
    }

    private function summary(): array
    {
        $summary = $this->emptySummary();
        $summary['stockItems'] = $this->stockItemCount(false);
        $summary['stockHeldItems'] = $this->stockItemCount(true);
        $summary['locations'] = $this->locationCount();
        $summary['inventoryValue'] = $this->inventoryValue();
        $summary['availableQuantity'] = $this->availableQuantity();
        $summary['negativeBalances'] = $this->negativeBalanceCount();
        $summary['belowReorder'] = $this->belowReorderCount();
        $summary['needsAttention'] = $this->attentionCount();
        $summary['outOfStock'] = $this->outOfStockCount();
        $summary['pendingTransferReferences'] = $this->pendingTransferReferenceCount();
        $summary['pendingTransferQuantity'] = $this->pendingTransferQuantity();
        $summary['openPurchaseQuantity'] = $this->openPurchaseQuantity();
        $summary['openPurchaseLines'] = $this->openPurchaseLineCount();
        $summary['recentMovementLines'] = $this->recentMovementCount();
        $summary['activeCountSheets'] = $this->activeCountSheets();

        return $summary;
    }

    private function stockItemCount(bool $stockHeld): int
    {
        $excluded = $stockHeld ? ['A', 'D', 'K'] : ['D', 'K'];

        if ($this->filters['location'] !== '') {
            $query = DB::table('locstock as ls')
                ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
                ->whereNotIn('sm.mbflag', $excluded);
            $this->applyStockFilters($query);

            return (int) $query->distinct('ls.stockid')->count('ls.stockid');
        }

        $query = DB::table('stockmaster as sm')->whereNotIn('sm.mbflag', $excluded);
        if ($this->filters['category'] !== '') {
            $query->where('sm.categoryid', $this->filters['category']);
        }

        return (int) $query->count();
    }

    private function locationCount(): int
    {
        if ($this->filters['location'] !== '') {
            return 1;
        }

        if ($this->filters['category'] === '') {
            return (int) DB::table('locations')->count();
        }

        return (int) DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K'])
            ->where('sm.categoryid', $this->filters['category'])
            ->distinct('ls.loccode')
            ->count('ls.loccode');
    }

    private function availableQuantity(): float
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K']);
        $this->applyStockFilters($query);

        return (float) ($query->selectRaw('COALESCE(SUM(ls.quantity), 0) as quantity')->value('quantity') ?? 0);
    }

    private function negativeBalanceCount(): int
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K'])
            ->where('ls.quantity', '<', 0);
        $this->applyStockFilters($query);

        return (int) $query->count();
    }

    private function emptySummary(): array
    {
        return [
            'stockItems' => 0,
            'stockHeldItems' => 0,
            'locations' => 0,
            'inventoryValue' => 0.0,
            'availableQuantity' => 0.0,
            'negativeBalances' => 0,
            'belowReorder' => 0,
            'needsAttention' => 0,
            'outOfStock' => 0,
            'pendingTransferReferences' => 0,
            'pendingTransferQuantity' => 0.0,
            'openPurchaseQuantity' => 0.0,
            'openPurchaseLines' => 0,
            'recentMovementLines' => 0,
            'activeCountSheets' => 0,
        ];
    }

    private function inventoryValue(): float
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K']);
        $this->applyStockFilters($query);

        return (float) ($query
            ->selectRaw('COALESCE(SUM(ls.quantity * ' . $this->costExpression('sm') . '), 0) as value')
            ->value('value') ?? 0);
    }

    private function belowReorderCount(): int
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K'])
            ->where('ls.reorderlevel', '>', 0)
            ->whereColumn('ls.quantity', '<=', 'ls.reorderlevel');
        $this->applyStockFilters($query);

        return (int) $query->count();
    }

    private function attentionCount(): int
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K'])
            ->where(function ($query) {
                $query->where('ls.quantity', '<', 0)
                    ->orWhere(function ($inner) {
                        $inner->where('ls.reorderlevel', '>', 0)
                            ->whereColumn('ls.quantity', '<=', 'ls.reorderlevel');
                    });
            });
        $this->applyStockFilters($query);

        return (int) $query->count();
    }

    private function outOfStockCount(): int
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K']);
        $this->applyStockFilters($query);

        return $query
            ->select('ls.stockid')
            ->groupBy('ls.stockid')
            ->havingRaw('SUM(ls.quantity) <= 0')
            ->get()
            ->count();
    }

    private function pendingTransferReferenceCount(): int
    {
        if (!Schema::hasTable('loctransfers')) {
            return 0;
        }

        $query = DB::table('loctransfers as lt')
            ->whereColumn('lt.shipqty', '>', 'lt.recqty');
        $this->applyTransferFilters($query);

        return (int) $query
            ->distinct('reference')
            ->count('lt.reference');
    }

    private function pendingTransferQuantity(): float
    {
        if (!Schema::hasTable('loctransfers')) {
            return 0.0;
        }

        $query = DB::table('loctransfers as lt')
            ->whereColumn('lt.shipqty', '>', 'lt.recqty');
        $this->applyTransferFilters($query);

        return (float) ($query
            ->selectRaw('COALESCE(SUM(lt.shipqty - lt.recqty), 0) as quantity')
            ->value('quantity') ?? 0);
    }

    private function applyTransferFilters($query)
    {
        $this->applyActivityDates($query, 'lt.shipdate');

        if ($this->filters['location'] !== '') {
            $query->where(function ($inner) {
                $inner->where('lt.shiploc', $this->filters['location'])
                    ->orWhere('lt.recloc', $this->filters['location']);
            });
        }

        if ($this->filters['category'] !== '') {
            $query->join('stockmaster as sm', 'sm.stockid', '=', 'lt.stockid')
                ->where('sm.categoryid', $this->filters['category']);
        }

        return $query;
    }

    private function openPurchaseQuantity(): float
    {
        if (!Schema::hasTable('purchorders') || !Schema::hasTable('purchorderdetails')) {
            return 0.0;
        }

        $query = DB::table('purchorderdetails as pod')
            ->join('purchorders as po', 'po.orderno', '=', 'pod.orderno')
            ->where('pod.completed', 0)
            ->whereNotIn('po.status', ['Cancelled', 'Pending', 'Rejected', 'Completed']);
        if ($this->filters['category'] !== '') {
            $query->join('stockmaster as sm', 'sm.stockid', '=', 'pod.itemcode')
                ->where('sm.categoryid', $this->filters['category']);
        }

        return (float) ($query
            ->selectRaw('COALESCE(SUM(GREATEST(pod.quantityord - pod.quantityrecd, 0)), 0) as quantity')
            ->value('quantity') ?? 0);
    }

    private function openPurchaseLineCount(): int
    {
        if (!Schema::hasTable('purchorders') || !Schema::hasTable('purchorderdetails')) {
            return 0;
        }

        $query = DB::table('purchorderdetails as pod')
            ->join('purchorders as po', 'po.orderno', '=', 'pod.orderno')
            ->where('pod.completed', 0)
            ->whereNotIn('po.status', ['Cancelled', 'Pending', 'Rejected', 'Completed'])
            ->whereRaw('(pod.quantityord - pod.quantityrecd) > 0');
        if ($this->filters['category'] !== '') {
            $query->join('stockmaster as sm', 'sm.stockid', '=', 'pod.itemcode')
                ->where('sm.categoryid', $this->filters['category']);
        }

        return (int) $query->count();
    }

    private function recentMovementCount(): int
    {
        if (!Schema::hasTable('stockmoves')) {
            return 0;
        }

        $query = DB::table('stockmoves as smv')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'smv.stockid')
            ->where('smv.hidemovt', 0);
        $this->applyMovementFilters($query);

        return (int) $query->count();
    }

    private function activeCountSheets(): int
    {
        if (!Schema::hasTable('stockcheckfreeze')) {
            return 0;
        }

        $query = DB::table('stockcheckfreeze as scf')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'scf.stockid');
        if ($this->filters['location'] !== '') {
            $query->where('scf.loccode', $this->filters['location']);
        }
        if ($this->filters['category'] !== '') {
            $query->where('sm.categoryid', $this->filters['category']);
        }
        $this->applyActivityDates($query, 'scf.stockcheckdate');

        return (int) $query
            ->select('scf.loccode', 'scf.stockcheckdate')
            ->distinct()
            ->get()
            ->count();
    }

    private function attentionItems()
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'ls.loccode')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K'])
            ->where(function ($query) {
                $query->where('ls.quantity', '<', 0)
                    ->orWhere(function ($inner) {
                        $inner->where('ls.reorderlevel', '>', 0)
                            ->whereColumn('ls.quantity', '<=', 'ls.reorderlevel');
                    });
            });
        $this->applyStockFilters($query);

        return $query
            ->select(
                'ls.stockid',
                'ls.loccode',
                'ls.quantity',
                'ls.reorderlevel',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.decimalplaces',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), ls.loccode) as location_name')
            )
            ->orderBy('ls.quantity')
            ->limit(12)
            ->get()
            ->map(function ($row) {
                return [
                    'stockId' => (string) $row->stockid,
                    'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
                    'location' => (string) $row->loccode,
                    'locationName' => html_entity_decode((string) $row->location_name),
                    'quantity' => (float) $row->quantity,
                    'reorderLevel' => (float) $row->reorderlevel,
                    'units' => (string) ($row->units ?: ''),
                    'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
                    'status' => (float) $row->quantity < 0 ? 'Negative' : ((float) $row->quantity <= 0 ? 'Out' : 'Reorder'),
                ];
            })
            ->values();
    }

    private function attentionBreakdown()
    {
        $negativeQuery = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K'])
            ->where('ls.quantity', '<', 0);
        $this->applyStockFilters($negativeQuery);
        $negative = (int) $negativeQuery->count();

        $outQuery = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K'])
            ->where('ls.quantity', '=', 0)
            ->where('ls.reorderlevel', '>', 0);
        $this->applyStockFilters($outQuery);
        $out = (int) $outQuery->count();

        $reorderQuery = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K'])
            ->where('ls.reorderlevel', '>', 0)
            ->where('ls.quantity', '>', 0)
            ->whereColumn('ls.quantity', '<=', 'ls.reorderlevel');
        $this->applyStockFilters($reorderQuery);
        $reorder = (int) $reorderQuery->count();

        return collect([
            ['name' => 'Negative', 'value' => $negative],
            ['name' => 'Out of stock', 'value' => $out],
            ['name' => 'At reorder level', 'value' => $reorder],
        ])->filter(fn ($row) => $row['value'] > 0)->values();
    }

    private function recentMovements()
    {
        if (!Schema::hasTable('stockmoves')) {
            return collect();
        }

        $query = DB::table('stockmoves as smv')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'smv.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'smv.loccode')
            ->leftJoin('systypes as st', 'st.typeid', '=', 'smv.type')
            ->where('smv.hidemovt', 0);
        $this->applyMovementFilters($query);

        return $query
            ->select(
                'smv.stkmoveno',
                'smv.stockid',
                'smv.type',
                'smv.transno',
                'smv.loccode',
                'smv.trandate',
                'smv.qty',
                'smv.standardcost',
                'smv.reference',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.decimalplaces',
                'st.typename',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), smv.loccode) as location_name')
            )
            ->orderByDesc('smv.stkmoveno')
            ->limit(10)
            ->get()
            ->map(function ($row) {
                $quantity = (float) $row->qty;

                return [
                    'movementNumber' => (int) $row->stkmoveno,
                    'stockId' => (string) $row->stockid,
                    'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
                    'location' => (string) $row->loccode,
                    'locationName' => html_entity_decode((string) $row->location_name),
                    'date' => $this->dateOnly((string) $row->trandate),
                    'quantity' => $quantity,
                    'value' => abs($quantity * (float) $row->standardcost),
                    'units' => (string) ($row->units ?: ''),
                    'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
                    'typeName' => html_entity_decode((string) ($row->typename ?: 'Transaction')),
                    'transactionNumber' => (int) $row->transno,
                    'reference' => html_entity_decode((string) ($row->reference ?? '')),
                    'direction' => $quantity > 0 ? 'In' : ($quantity < 0 ? 'Out' : 'No change'),
                ];
            })
            ->values();
    }

    private function movementTrend()
    {
        if (!Schema::hasTable('stockmoves')) {
            return collect();
        }

        $query = DB::table('stockmoves as smv')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'smv.stockid')
            ->where('smv.hidemovt', 0);
        $this->applyMovementFilters($query);

        return $query
            ->selectRaw('DATE(smv.trandate) as movement_date')
            ->selectRaw('COALESCE(SUM(CASE WHEN smv.qty > 0 THEN smv.qty ELSE 0 END), 0) as in_qty')
            ->selectRaw('COALESCE(SUM(CASE WHEN smv.qty < 0 THEN ABS(smv.qty) ELSE 0 END), 0) as out_qty')
            ->selectRaw('COALESCE(SUM(smv.qty), 0) as net_qty')
            ->groupBy(DB::raw('DATE(smv.trandate)'))
            ->orderBy('movement_date')
            ->get()
            ->map(fn ($row) => [
                'date' => $this->dateOnly((string) $row->movement_date),
                'inQuantity' => (float) $row->in_qty,
                'outQuantity' => (float) $row->out_qty,
                'netQuantity' => (float) $row->net_qty,
            ])
            ->values();
    }

    private function pendingTransfers()
    {
        if (!Schema::hasTable('loctransfers')) {
            return collect();
        }

        $query = DB::table('loctransfers as lt')
            ->leftJoin('locations as fromloc', 'fromloc.loccode', '=', 'lt.shiploc')
            ->leftJoin('locations as toloc', 'toloc.loccode', '=', 'lt.recloc')
            ->whereColumn('lt.shipqty', '>', 'lt.recqty');
        $this->applyTransferFilters($query);

        return $query
            ->select(
                'lt.reference',
                'lt.shiploc',
                'lt.recloc',
                DB::raw('COALESCE(NULLIF(fromloc.locationname, ""), lt.shiploc) as from_name'),
                DB::raw('COALESCE(NULLIF(toloc.locationname, ""), lt.recloc) as to_name'),
                DB::raw('MIN(lt.shipdate) as ship_date'),
                DB::raw('COUNT(DISTINCT lt.stockid) as item_count'),
                DB::raw('SUM(lt.shipqty - lt.recqty) as outstanding_qty')
            )
            ->groupBy('lt.reference', 'lt.shiploc', 'lt.recloc', 'fromloc.locationname', 'toloc.locationname')
            ->orderByDesc('lt.reference')
            ->limit(8)
            ->get()
            ->map(fn ($row) => [
                'reference' => (int) $row->reference,
                'fromLocation' => (string) $row->shiploc,
                'fromLocationName' => html_entity_decode((string) $row->from_name),
                'toLocation' => (string) $row->recloc,
                'toLocationName' => html_entity_decode((string) $row->to_name),
                'shipDate' => $this->dateOnly((string) $row->ship_date),
                'itemCount' => (int) $row->item_count,
                'outstandingQuantity' => (float) $row->outstanding_qty,
            ])
            ->values();
    }

    private function topValueItems()
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K']);
        $this->applyStockFilters($query);

        return $query
            ->select(
                'ls.stockid',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.decimalplaces'
            )
            ->selectRaw('COALESCE(SUM(ls.quantity), 0) as quantity')
            ->selectRaw('COALESCE(SUM(ls.quantity * ' . $this->costExpression('sm') . '), 0) as value')
            ->groupBy('ls.stockid', 'sm.description', 'sm.longdescription', 'sm.units', 'sm.decimalplaces')
            ->orderByDesc('value')
            ->limit(8)
            ->get()
            ->map(fn ($row) => [
                'stockId' => (string) $row->stockid,
                'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
                'quantity' => (float) $row->quantity,
                'value' => (float) $row->value,
                'units' => (string) ($row->units ?: ''),
                'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
            ])
            ->values();
    }

    private function locationValue()
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'ls.loccode')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K']);
        $this->applyStockFilters($query);

        return $query
            ->select(
                'ls.loccode',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), ls.loccode) as location_name')
            )
            ->selectRaw('COALESCE(SUM(ls.quantity), 0) as quantity')
            ->selectRaw('COALESCE(SUM(ls.quantity * ' . $this->costExpression('sm') . '), 0) as value')
            ->groupBy('ls.loccode', 'loc.locationname')
            ->orderByDesc('value')
            ->limit(8)
            ->get()
            ->map(fn ($row) => [
                'location' => (string) $row->loccode,
                'locationName' => html_entity_decode((string) $row->location_name),
                'quantity' => (float) $row->quantity,
                'value' => (float) $row->value,
            ])
            ->values();
    }

    private function categoryValue()
    {
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->whereNotIn('sm.mbflag', ['A', 'D', 'K']);
        $this->applyStockFilters($query);

        if (Schema::hasTable('stockcategory')) {
            $query->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
                ->selectRaw('COALESCE(NULLIF(sc.categorydescription, ""), sm.categoryid, "Uncategorised") as category_name')
                ->groupBy('sm.categoryid', 'sc.categorydescription');
        } else {
            $query->selectRaw('COALESCE(sm.categoryid, "Uncategorised") as category_name')
                ->groupBy('sm.categoryid');
        }

        return $query
            ->selectRaw('COALESCE(SUM(ls.quantity), 0) as quantity')
            ->selectRaw('COALESCE(SUM(ls.quantity * ' . $this->costExpression('sm') . '), 0) as value')
            ->havingRaw('value > 0')
            ->orderByDesc('value')
            ->limit(8)
            ->get()
            ->map(fn ($row) => [
                'category' => html_entity_decode((string) $row->category_name),
                'quantity' => (float) $row->quantity,
                'value' => (float) $row->value,
            ])
            ->values();
    }

    private function countActivity()
    {
        if (!Schema::hasTable('stockcounts')) {
            return collect();
        }

        $query = DB::table('stockcounts as c')
            ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'c.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'c.loccode')
            ->leftJoin('stockcheckfreeze as scf', function ($join) {
                $join->on('scf.stockid', '=', 'c.stockid')
                    ->on('scf.loccode', '=', 'c.loccode');
            });
        if ($this->filters['location'] !== '') {
            $query->where('c.loccode', $this->filters['location']);
        }
        if ($this->filters['category'] !== '') {
            $query->where('sm.categoryid', $this->filters['category']);
        }
        $this->applyActivityDates($query, 'scf.stockcheckdate');

        return $query
            ->select(
                'c.id',
                'c.stockid',
                'c.loccode',
                'c.qtycounted',
                'c.reference',
                'sm.description',
                'sm.longdescription',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), c.loccode) as location_name'),
                DB::raw('COALESCE(scf.qoh, 0) as expected_quantity'),
                DB::raw('COALESCE(scf.stockcheckdate, NULL) as stockcheckdate')
            )
            ->orderByDesc('c.id')
            ->limit(8)
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'stockId' => (string) $row->stockid,
                'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
                'location' => (string) $row->loccode,
                'locationName' => html_entity_decode((string) $row->location_name),
                'countedQuantity' => (float) $row->qtycounted,
                'expectedQuantity' => (float) $row->expected_quantity,
                'variance' => (float) $row->qtycounted - (float) $row->expected_quantity,
                'date' => $row->stockcheckdate ? $this->dateOnly((string) $row->stockcheckdate) : (string) ($row->reference ?? ''),
            ])
            ->values();
    }

    private function costExpression(string $alias): string
    {
        $material = Schema::hasColumn('stockmaster', 'materialcost') ? "{$alias}.materialcost" : '0';
        $labour = Schema::hasColumn('stockmaster', 'labourcost') ? "{$alias}.labourcost" : '0';
        $overhead = Schema::hasColumn('stockmaster', 'overheadcost') ? "{$alias}.overheadcost" : '0';
        $actual = Schema::hasColumn('stockmaster', 'actualcost') ? "{$alias}.actualcost" : '0';
        $standard = "({$material} + {$labour} + {$overhead})";

        return "(CASE WHEN {$actual} > 0 THEN {$actual} ELSE {$standard} END)";
    }

    private function currency(): string
    {
        if (!Schema::hasTable('companies')) {
            return 'TZS';
        }

        return (string) (DB::table('companies')->where('coycode', 1)->value('currencydefault') ?: 'TZS');
    }

    private function dateOnly(string $value): string
    {
        try {
            return Carbon::parse($value)->toDateString();
        } catch (\Throwable) {
            return $value;
        }
    }
}
