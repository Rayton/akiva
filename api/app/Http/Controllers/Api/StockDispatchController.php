<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockDispatchController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => [],
                    'categories' => [],
                    'rows' => [],
                    'summary' => $this->summary(collect()),
                ],
            ]);
        }

        try {
            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => $this->locations(),
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
                'message' => 'Stock dispatch plan could not be loaded.',
            ], 500);
        }
    }

    public function createBatch(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Stock dispatch is not available.',
            ], 503);
        }

        try {
            $submittedFrom = strtoupper(trim((string) $request->input('fromLocation', '')));
            $submittedTo = strtoupper(trim((string) $request->input('toLocation', '')));
            if ($submittedFrom !== '' && $submittedTo !== '' && $submittedFrom === $submittedTo) {
                return response()->json([
                    'success' => false,
                    'message' => 'Choose different sending and receiving locations.',
                ], 422);
            }

            $filters = $this->filters($request);
            if ($filters['fromLocation'] === '' || $filters['toLocation'] === '' || $filters['fromLocation'] === $filters['toLocation']) {
                return response()->json([
                    'success' => false,
                    'message' => 'Choose different sending and receiving locations.',
                ], 422);
            }

            $requested = collect($request->input('lines', []))
                ->filter(fn ($line) => is_array($line))
                ->mapWithKeys(fn ($line) => [strtoupper(trim((string) ($line['stockId'] ?? ''))) => (float) ($line['quantity'] ?? 0)])
                ->filter(fn ($quantity, $stockId) => $stockId !== '' && $quantity > 0);

            $rows = $this->rows($filters);
            if ($requested->isNotEmpty()) {
                $rows = $rows->filter(fn ($row) => $requested->has($row['stockId']))
                    ->map(function ($row) use ($requested) {
                        $row['dispatchQuantity'] = min((float) $row['dispatchQuantity'], (float) $requested->get($row['stockId']));
                        return $row;
                    })
                    ->filter(fn ($row) => (float) $row['dispatchQuantity'] > 0)
                    ->values();
            }

            if ($rows->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no dispatch quantities to create a transfer batch.',
                ], 422);
            }

            $created = DB::transaction(function () use ($rows, $filters) {
                $reference = $this->reserveReference();
                $now = Carbon::now()->format('Y-m-d H:i:s');

                foreach ($rows as $row) {
                    DB::table('loctransfers')->insert([
                        'reference' => $reference,
                        'stockid' => $row['stockId'],
                        'shipqty' => round((float) $row['dispatchQuantity'], (int) $row['decimalPlaces']),
                        'recqty' => 0,
                        'shipdate' => $now,
                        'recdate' => '1000-01-01 00:00:00',
                        'shiploc' => $filters['fromLocation'],
                        'recloc' => $filters['toLocation'],
                    ]);
                }

                return [
                    'reference' => $reference,
                    'fromLocation' => $filters['fromLocation'],
                    'toLocation' => $filters['toLocation'],
                    'lineCount' => $rows->count(),
                    'totalQuantity' => round((float) $rows->sum('dispatchQuantity'), 4),
                    'shipDate' => Carbon::parse($now)->toDateString(),
                ];
            });

            return response()->json([
                'success' => true,
                'message' => 'Transfer batch created.',
                'transfer' => $created,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Transfer batch could not be created.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('locstock')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locations')
            && Schema::hasTable('stockcategory')
            && Schema::hasTable('loctransfers');
    }

    private function filters(Request $request): array
    {
        $defaults = $this->defaultDispatchLocations();
        $first = (string) ($defaults['fromLocation'] ?: DB::table('locations')->orderBy('locationname')->value('loccode') ?: '');
        $second = (string) ($defaults['toLocation'] ?: DB::table('locations')->where('loccode', '<>', $first)->orderBy('locationname')->value('loccode') ?: $first);
        $fromLocation = strtoupper(trim((string) ($request->input('fromLocation') ?? $request->query('fromLocation', $first))));
        $toLocation = strtoupper(trim((string) ($request->input('toLocation') ?? $request->query('toLocation', $second))));
        $category = trim((string) ($request->input('category') ?? $request->query('category', 'All')));
        $strategy = trim((string) ($request->input('strategy') ?? $request->query('strategy', 'needed')));
        $percent = (float) ($request->input('percent') ?? $request->query('percent', 0));
        $dateFrom = $this->queryDate($request->input('dateFrom') ?? $request->query('dateFrom'), Carbon::today()->subMonths(2)->startOfMonth()->toDateString());
        $dateTo = $this->queryDate($request->input('dateTo') ?? $request->query('dateTo'), Carbon::today()->toDateString());
        $search = trim((string) ($request->input('q') ?? $request->query('q', '')));

        if (!DB::table('locations')->where('loccode', $fromLocation)->exists()) {
            $fromLocation = $first;
        }
        if (!DB::table('locations')->where('loccode', $toLocation)->exists()) {
            $toLocation = $second;
        }
        if ($fromLocation === $toLocation) {
            $toLocation = $second !== $fromLocation ? $second : '';
        }
        if ($category === '') {
            $category = 'All';
        }
        if (!in_array($strategy, ['needed', 'source-surplus'], true)) {
            $strategy = 'needed';
        }
        if ($percent < 0) $percent = 0;
        if ($percent > 500) $percent = 500;
        if ($dateFrom > $dateTo) {
            [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
        }

        return compact('fromLocation', 'toLocation', 'category', 'strategy', 'percent', 'dateFrom', 'dateTo', 'search');
    }

    private function defaultDispatchLocations(): array
    {
        $row = DB::table('locstock as tostock')
            ->join('locstock as fromstock', function ($join) {
                $join->on('fromstock.stockid', '=', 'tostock.stockid')
                    ->whereColumn('fromstock.loccode', '<>', 'tostock.loccode');
            })
            ->join('stockmaster as sm', 'sm.stockid', '=', 'tostock.stockid')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->whereColumn('tostock.reorderlevel', '>', 'tostock.quantity')
            ->whereRaw('(fromstock.quantity - fromstock.reorderlevel) > 0')
            ->whereIn('sm.mbflag', ['B', 'M'])
            ->where(function ($inner) {
                $inner->whereNull('sm.discontinued')->orWhere('sm.discontinued', 0);
            })
            ->where(function ($inner) {
                $inner->whereNull('sc.stocktype')->orWhere('sc.stocktype', '<>', 'A');
            })
            ->orderBy('fromstock.loccode')
            ->orderBy('tostock.loccode')
            ->select('fromstock.loccode as from_location', 'tostock.loccode as to_location')
            ->first();

        return [
            'fromLocation' => (string) ($row->from_location ?? ''),
            'toLocation' => (string) ($row->to_location ?? ''),
        ];
    }

    private function rows(array $filters)
    {
        if ($filters['fromLocation'] === '' || $filters['toLocation'] === '' || $filters['fromLocation'] === $filters['toLocation']) {
            return collect();
        }

        $inTransitFrom = $this->transferSubquery('shiploc', $filters['fromLocation']);
        $inTransitTo = $this->transferSubquery('recloc', $filters['toLocation']);
        $usage = $this->usageSubquery($filters['toLocation'], $filters['dateFrom'], $filters['dateTo']);

        $query = DB::table('locstock as tostock')
            ->join('locstock as fromstock', function ($join) use ($filters) {
                $join->on('fromstock.stockid', '=', 'tostock.stockid')
                    ->where('fromstock.loccode', '=', $filters['fromLocation']);
            })
            ->join('stockmaster as sm', 'sm.stockid', '=', 'tostock.stockid')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->leftJoinSub($inTransitFrom, 'from_transit', fn ($join) => $join->on('from_transit.stockid', '=', 'tostock.stockid'))
            ->leftJoinSub($inTransitTo, 'to_transit', fn ($join) => $join->on('to_transit.stockid', '=', 'tostock.stockid'))
            ->leftJoinSub($usage, 'usage_rows', fn ($join) => $join->on('usage_rows.stockid', '=', 'tostock.stockid'))
            ->where('tostock.loccode', $filters['toLocation'])
            ->whereRaw('(fromstock.quantity - fromstock.reorderlevel - COALESCE(from_transit.quantity, 0)) > 0')
            ->whereIn('sm.mbflag', ['B', 'M'])
            ->where(function ($inner) {
                $inner->whereNull('sm.discontinued')->orWhere('sm.discontinued', 0);
            })
            ->where(function ($inner) {
                $inner->whereNull('sc.stocktype')->orWhere('sc.stocktype', '<>', 'A');
            })
            ->select(
                'tostock.stockid',
                'tostock.quantity as to_quantity',
                'tostock.reorderlevel as to_reorder',
                'tostock.bin as to_bin',
                'fromstock.quantity as from_quantity',
                'fromstock.reorderlevel as from_reorder',
                'fromstock.bin as from_bin',
                'sm.description',
                'sm.longdescription',
                'sm.categoryid',
                'sm.decimalplaces',
                'sm.units',
                'sc.categorydescription',
                DB::raw('COALESCE(from_transit.quantity, 0) as from_in_transit'),
                DB::raw('COALESCE(to_transit.quantity, 0) as to_in_transit'),
                DB::raw('COALESCE(usage_rows.quantity_used, 0) as quantity_used')
            );

        if ($filters['strategy'] === 'needed') {
            $query->whereColumn('tostock.reorderlevel', '>', 'tostock.quantity');
        }

        if ($filters['category'] !== 'All') {
            $query->where('sm.categoryid', $filters['category']);
        }

        if ($filters['search'] !== '') {
            $search = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $filters['search']) . '%';
            $query->where(function ($inner) use ($search) {
                $inner->where('tostock.stockid', 'like', $search)
                    ->orWhere('sm.description', 'like', $search)
                    ->orWhere('sm.longdescription', 'like', $search)
                    ->orWhere('sc.categorydescription', 'like', $search)
                    ->orWhere('tostock.bin', 'like', $search)
                    ->orWhere('fromstock.bin', 'like', $search);
            });
        }

        return $query
            ->orderBy('tostock.stockid')
            ->limit(1200)
            ->get()
            ->map(fn ($row) => $this->mapRow($row, $filters))
            ->filter(fn ($row) => (float) $row['dispatchQuantity'] > 0)
            ->values();
    }

    private function mapRow($row, array $filters): array
    {
        $decimalPlaces = (int) ($row->decimalplaces ?? 0);
        $fromAvailable = max(0.0, (float) $row->from_quantity - (float) $row->from_reorder - (float) $row->from_in_transit);
        $baseNeed = max(0.0, (float) $row->to_reorder - (float) $row->to_quantity);
        $neededWithPercent = round($baseNeed * (1 + ((float) $filters['percent'] / 100)), $decimalPlaces);
        $toNeed = max(0.0, $neededWithPercent - (float) $row->to_in_transit);
        $dispatchQuantity = $filters['strategy'] === 'source-surplus'
            ? $fromAvailable
            : min($fromAvailable, $toNeed);

        return [
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
            'category' => (string) ($row->categoryid ?? ''),
            'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid ?: '')),
            'fromOnHand' => round((float) $row->from_quantity, $decimalPlaces),
            'fromReorder' => round((float) $row->from_reorder, $decimalPlaces),
            'fromInTransit' => round((float) $row->from_in_transit, $decimalPlaces),
            'fromAvailable' => round($fromAvailable, $decimalPlaces),
            'toOnHand' => round((float) $row->to_quantity, $decimalPlaces),
            'toReorder' => round((float) $row->to_reorder, $decimalPlaces),
            'toInTransit' => round((float) $row->to_in_transit, $decimalPlaces),
            'neededQuantity' => round($toNeed, $decimalPlaces),
            'dispatchQuantity' => round($dispatchQuantity, $decimalPlaces),
            'quantityUsed' => round((float) $row->quantity_used, $decimalPlaces),
            'fromBin' => (string) ($row->from_bin ?? ''),
            'toBin' => (string) ($row->to_bin ?? ''),
            'units' => (string) ($row->units ?: ''),
            'decimalPlaces' => $decimalPlaces,
        ];
    }

    private function transferSubquery(string $locationColumn, string $location)
    {
        return DB::table('loctransfers')
            ->select('stockid', DB::raw('SUM(shipqty - recqty) as quantity'))
            ->where($locationColumn, $location)
            ->whereColumn('shipqty', '>', 'recqty')
            ->groupBy('stockid');
    }

    private function usageSubquery(string $location, string $dateFrom, string $dateTo)
    {
        return DB::table('stockmoves')
            ->select('stockid', DB::raw('SUM(-qty) as quantity_used'))
            ->where('loccode', $location)
            ->whereIn('type', [10, 11])
            ->where('qty', '<', 0)
            ->whereDate('trandate', '>=', $dateFrom)
            ->whereDate('trandate', '<=', $dateTo)
            ->groupBy('stockid');
    }

    private function summary($rows): array
    {
        return [
            'lines' => $rows->count(),
            'items' => $rows->pluck('stockId')->unique()->count(),
            'dispatchQuantity' => round((float) $rows->sum('dispatchQuantity'), 4),
            'fromAvailable' => round((float) $rows->sum('fromAvailable'), 4),
            'neededQuantity' => round((float) $rows->sum('neededQuantity'), 4),
            'usedInPeriod' => round((float) $rows->sum('quantityUsed'), 4),
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

    private function categories()
    {
        return DB::table('stockcategory')
            ->select('categoryid', 'categorydescription')
            ->where(function ($query) {
                $query->whereNull('stocktype')->orWhere('stocktype', '<>', 'A');
            })
            ->orderBy('categorydescription')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->categoryid,
                'label' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
                'code' => (string) $row->categoryid,
            ])
            ->values();
    }

    private function reserveReference(): int
    {
        $maxReference = (int) DB::table('loctransfers')->max('reference');
        $systype = Schema::hasTable('systypes')
            ? DB::table('systypes')->where('typeid', 16)->lockForUpdate()->first()
            : null;
        $currentTypeNo = (int) ($systype->typeno ?? 0);
        $reference = max($maxReference, $currentTypeNo) + 1;

        if (Schema::hasTable('systypes')) {
            DB::table('systypes')->updateOrInsert(
                ['typeid' => 16],
                ['typename' => 'Location Transfer', 'typeno' => $reference]
            );
        }

        return $reference;
    }

    private function queryDate($value, string $fallback): string
    {
        if ($value === null || trim((string) $value) === '') {
            return $fallback;
        }

        try {
            return Carbon::parse((string) $value)->toDateString();
        } catch (\Throwable) {
            return $fallback;
        }
    }
}
