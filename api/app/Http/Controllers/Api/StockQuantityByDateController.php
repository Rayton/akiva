<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockQuantityByDateController extends Controller
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
                    'summary' => $this->summary($rows, $filters),
                    'filters' => $filters,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Historical stock quantity could not be loaded.',
            ], 500);
        }
    }

    public function exportCsv(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Historical stock quantity data is not available.',
            ], 503);
        }

        try {
            @ini_set('memory_limit', '512M');
            @set_time_limit(120);

            $filters = $this->filters($request, true);
            $rows = $this->rows($filters);

            if ($rows->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no historical stock quantity rows to export for the selected filters.',
                ], 422);
            }

            return response($this->csv($rows), 200, [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Content-Disposition' => 'attachment; filename="stock-historical-' . $filters['dateTo'] . '.csv"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Historical stock quantity CSV could not be created.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('stockmaster')
            && Schema::hasTable('stockmoves')
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
                'quantity' => 0,
                'value' => 0,
                'controlledItems' => 0,
                'movedInRange' => 0,
                'locations' => 0,
                'asAt' => Carbon::today()->startOfMonth()->subDay()->toDateString(),
            ],
            'filters' => [],
        ];
    }

    private function filters(Request $request, bool $forExport = false): array
    {
        $userId = $this->currentUserId($request);
        $dateTo = $this->validDate(
            (string) $request->query('dateTo', $request->query('to', $request->query('asAt', $request->query('OnHandDate', '')))),
            Carbon::today()->startOfMonth()->subDay()->toDateString()
        );
        $dateFrom = $this->validDate(
            (string) $request->query('dateFrom', $request->query('from', '')),
            Carbon::parse($dateTo)->subMonthsNoOverflow(2)->startOfMonth()->toDateString()
        );
        if ($dateFrom > $dateTo) {
            [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
        }

        $category = trim((string) $request->query('category', $request->query('StockCategory', 'All')));
        $locations = $this->requestedLocations($request, $userId);

        return [
            'locations' => $locations,
            'location' => count($locations) === 1 ? $locations[0] : 'All',
            'category' => $category === '' ? 'All' : $category,
            'search' => trim((string) $request->query('q', '')),
            'dateFrom' => $dateFrom,
            'dateTo' => $dateTo,
            'includeZero' => $request->boolean('includeZero', $request->boolean('ShowZeroStocks', false)),
            'userId' => $userId,
            'limit' => $this->safeLimit($request->query('limit', $forExport ? 5000 : 1000), 50, $forExport ? 10000 : 3000),
        ];
    }

    private function rows(array $filters)
    {
        if (empty($filters['locations'])) {
            return collect();
        }

        $historical = $this->historicalQuantitySubquery($filters);

        $query = DB::table('stockmaster as sm')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->leftJoinSub($historical, 'hist', 'hist.stockid', '=', 'sm.stockid')
            ->whereIn('sm.mbflag', ['B', 'M'])
            ->select(
                'sm.stockid',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.categoryid',
                'sm.decimalplaces',
                'sm.materialcost',
                'sm.labourcost',
                'sm.overheadcost',
                'sm.controlled',
                'sm.serialised',
                'sc.categorydescription',
                DB::raw('COALESCE(hist.quantity, 0) as quantity'),
                DB::raw('COALESCE(hist.location_count, 0) as location_count'),
                DB::raw('hist.last_movement_date as last_movement_date'),
                DB::raw('hist.first_movement_in_range as first_movement_in_range')
            );

        if ($filters['category'] !== 'All') {
            $query->where('sm.categoryid', $filters['category']);
        }

        if (!$filters['includeZero']) {
            $query->whereRaw('COALESCE(hist.quantity, 0) > 0');
        }

        if ($filters['search'] !== '') {
            $search = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $filters['search']) . '%';
            $query->where(function ($inner) use ($search) {
                $inner->where('sm.stockid', 'like', $search)
                    ->orWhere('sm.description', 'like', $search)
                    ->orWhere('sm.longdescription', 'like', $search)
                    ->orWhere('sm.categoryid', 'like', $search)
                    ->orWhere('sc.categorydescription', 'like', $search);
            });
        }

        return $query
            ->orderBy('sm.stockid')
            ->limit($filters['limit'])
            ->get()
            ->map(fn ($row) => $this->mapRow($row, $filters));
    }

    private function historicalQuantitySubquery(array $filters)
    {
        $latest = DB::table('stockmoves as smv')
            ->select('smv.stockid', 'smv.loccode', DB::raw('MAX(smv.stkmoveno) as max_stkmoveno'))
            ->whereIn('smv.loccode', $filters['locations'])
            ->where('smv.hidemovt', 0)
            ->whereDate('smv.trandate', '<=', $filters['dateTo'])
            ->groupBy('smv.stockid', 'smv.loccode');

        return DB::query()
            ->fromSub($latest, 'latest')
            ->join('stockmoves as movement', 'movement.stkmoveno', '=', 'latest.max_stkmoveno')
            ->select('latest.stockid')
            ->selectRaw('SUM(movement.newqoh) as quantity')
            ->selectRaw('COUNT(DISTINCT latest.loccode) as location_count')
            ->selectRaw('MAX(movement.trandate) as last_movement_date')
            ->selectRaw('MIN(CASE WHEN movement.trandate >= ? THEN movement.trandate ELSE NULL END) as first_movement_in_range', [$filters['dateFrom']])
            ->groupBy('latest.stockid');
    }

    private function mapRow($row, array $filters): array
    {
        $decimalPlaces = (int) ($row->decimalplaces ?? 2);
        $quantity = round((float) $row->quantity, max(0, min(6, $decimalPlaces)));
        $unitCost = (float) $row->materialcost + (float) $row->labourcost + (float) $row->overheadcost;
        $totalCost = $quantity * $unitCost;
        $controlled = (bool) $row->controlled || (bool) $row->serialised;
        $lastMovementDate = $row->last_movement_date ? Carbon::parse((string) $row->last_movement_date)->toDateString() : '';
        $movedInRange = $lastMovementDate !== '' && $lastMovementDate >= $filters['dateFrom'] && $lastMovementDate <= $filters['dateTo'];

        return [
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
            'category' => (string) ($row->categoryid ?? ''),
            'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid ?: '')),
            'units' => (string) ($row->units ?: ''),
            'quantity' => $quantity,
            'unitCost' => round($unitCost, 4),
            'totalCost' => round($totalCost, 2),
            'controlled' => $controlled,
            'serialised' => (bool) $row->serialised,
            'controlType' => (bool) $row->serialised ? 'Serialised' : ((bool) $row->controlled ? 'Controlled' : 'Standard'),
            'locationsWithHistory' => (int) $row->location_count,
            'lastMovementDate' => $lastMovementDate,
            'movedInRange' => $movedInRange,
            'decimalPlaces' => $decimalPlaces,
        ];
    }

    private function summary($rows, array $filters): array
    {
        return [
            'items' => $rows->count(),
            'quantity' => round((float) $rows->sum('quantity'), 4),
            'value' => round((float) $rows->sum('totalCost'), 2),
            'controlledItems' => $rows->filter(fn ($row) => $row['controlled'] || $row['serialised'])->count(),
            'movedInRange' => $rows->filter(fn ($row) => $row['movedInRange'])->count(),
            'locations' => count($filters['locations']),
            'asAt' => $filters['dateTo'],
        ];
    }

    private function requestedLocations(Request $request, string $userId): array
    {
        $requested = $request->query('locations', $request->query('location', $request->query('StockLocation', [])));
        if (is_string($requested)) {
            $requested = explode(',', $requested);
        }
        if (!is_array($requested)) {
            $requested = [$requested];
        }

        $requested = collect($requested)
            ->map(fn ($value) => strtoupper(trim((string) $value)))
            ->filter(fn ($value) => $value !== '' && $value !== 'ALL')
            ->unique()
            ->values()
            ->all();

        $visible = $this->locations($userId)->pluck('value')->map(fn ($value) => strtoupper((string) $value))->values()->all();
        if (empty($visible)) {
            return [];
        }

        if (empty($requested)) {
            return $visible;
        }

        return array_values(array_intersect($requested, $visible));
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

    private function csv($rows): string
    {
        $handle = fopen('php://temp', 'r+');
        fwrite($handle, "\xEF\xBB\xBF");
        fputcsv($handle, ['Item Code', 'Description', 'Unit', 'Quantity On Hand', 'Unit Cost', 'Total Cost', 'Controlled']);

        foreach ($rows as $row) {
            fputcsv($handle, [
                $row['stockId'],
                $row['description'],
                $row['units'],
                $this->csvNumber((float) $row['quantity']),
                $this->csvNumber((float) $row['unitCost']),
                $this->csvNumber((float) $row['totalCost']),
                $row['controlled'] ? 'Yes' : 'No',
            ]);
        }

        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return (string) $csv;
    }

    private function csvNumber(float $value): string
    {
        $number = rtrim(rtrim(number_format($value, 6, '.', ''), '0'), '.');
        return $number === '-0' || $number === '' ? '0' : $number;
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
