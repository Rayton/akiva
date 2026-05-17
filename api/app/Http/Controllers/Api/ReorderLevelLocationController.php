<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class ReorderLevelLocationController extends Controller
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
                    'filters' => [
                        'location' => '',
                        'category' => '',
                        'dateFrom' => Carbon::today()->subMonths(2)->startOfMonth()->toDateString(),
                        'dateTo' => Carbon::today()->toDateString(),
                        'orderBy' => 'usage',
                    ],
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
                'message' => 'Reorder levels by location could not be loaded.',
            ], 500);
        }
    }

    public function updateLine(Request $request, string $stockId)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Reorder levels are not available.',
            ], 503);
        }

        $validator = Validator::make($request->all(), [
            'location' => ['required', 'string', 'max:10', 'exists:locations,loccode'],
            'reorderLevel' => ['required', 'numeric', 'min:0'],
            'bin' => ['nullable', 'string', 'max:20'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Please check the reorder level and bin location.',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $stockId = strtoupper(trim($stockId));
            $location = strtoupper(trim((string) $request->input('location')));
            $existing = DB::table('locstock')
                ->where('stockid', $stockId)
                ->where('loccode', $location)
                ->first();

            if (!$existing) {
                return response()->json([
                    'success' => false,
                    'message' => 'This item is not stocked at the selected location.',
                ], 404);
            }

            $reorderLevel = (float) $request->input('reorderLevel');
            $bin = strtoupper(trim((string) $request->input('bin', '')));

            DB::table('locstock')
                ->where('stockid', $stockId)
                ->where('loccode', $location)
                ->update([
                    'reorderlevel' => $reorderLevel,
                    'bin' => $bin,
                ]);

            try {
                $this->audit($request, $stockId, $location, (float) $existing->reorderlevel, $reorderLevel, (string) ($existing->bin ?? ''), $bin);
            } catch (\Throwable $auditError) {
                report($auditError);
            }

            return response()->json([
                'success' => true,
                'message' => 'Reorder level saved.',
                'data' => [
                    'stockId' => $stockId,
                    'location' => $location,
                    'reorderLevel' => $reorderLevel,
                    'bin' => $bin,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Reorder level could not be saved.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('locstock')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locations')
            && Schema::hasTable('stockcategory');
    }

    private function filters(Request $request): array
    {
        $location = strtoupper(trim((string) $request->query('location', '')));
        $category = trim((string) $request->query('category', ''));
        $dateFrom = $this->queryDate($request->query('dateFrom'), Carbon::today()->subMonths(2)->startOfMonth()->toDateString());
        $dateTo = $this->queryDate($request->query('dateTo'), Carbon::today()->toDateString());
        $orderBy = trim((string) $request->query('orderBy', 'usage'));
        $search = trim((string) $request->query('q', ''));

        if ($location === '' || $location === 'ALL' || !DB::table('locations')->where('loccode', $location)->exists()) {
            $location = (string) (DB::table('locations')->orderBy('locationname')->value('loccode') ?: '');
        }

        if ($category === '' || strtolower($category) === 'all' || !DB::table('stockcategory')->where('categoryid', $category)->exists()) {
            $category = (string) (DB::table('stockcategory')->where(function ($query) {
                $query->whereNull('stocktype')->orWhere('stocktype', '<>', 'A');
            })->orderBy('categorydescription')->value('categoryid') ?: '');
        }

        if ($dateFrom > $dateTo) {
            [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
        }

        if (!in_array($orderBy, ['usage', 'stockId'], true)) $orderBy = 'usage';

        return [
            'location' => $location,
            'category' => $category,
            'dateFrom' => $dateFrom,
            'dateTo' => $dateTo,
            'orderBy' => $orderBy,
            'search' => $search,
        ];
    }

    private function rows(array $filters)
    {
        if ($filters['location'] === '' || $filters['category'] === '') {
            return collect();
        }

        $usage = $this->usageSubquery($filters['location'], $filters['dateFrom'], $filters['dateTo']);
        $allStock = DB::table('locstock')
            ->select('stockid', DB::raw('SUM(quantity) as all_on_hand'))
            ->groupBy('stockid');

        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->leftJoinSub($usage, 'usage_rows', function ($join) {
                $join->on('usage_rows.stockid', '=', 'ls.stockid');
            })
            ->leftJoinSub($allStock, 'all_stock', function ($join) {
                $join->on('all_stock.stockid', '=', 'ls.stockid');
            })
            ->select(
                'ls.stockid',
                'ls.loccode',
                'ls.quantity',
                'ls.reorderlevel',
                'ls.bin',
                'sm.description',
                'sm.longdescription',
                'sm.decimalplaces',
                'sm.units',
                DB::raw('COALESCE(usage_rows.quantity_used, 0) as quantity_used'),
                DB::raw('COALESCE(all_stock.all_on_hand, 0) as all_on_hand')
            )
            ->where('ls.loccode', $filters['location'])
            ->where('sm.categoryid', $filters['category'])
            ->whereIn('sm.mbflag', ['B', 'M'])
            ->where(function ($inner) {
                $inner->whereNull('sm.discontinued')->orWhere('sm.discontinued', 0);
            });

        if ($filters['search'] !== '') {
            $search = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $filters['search']) . '%';
            $query->where(function ($inner) use ($search) {
                $inner->where('ls.stockid', 'like', $search)
                    ->orWhere('sm.description', 'like', $search)
                    ->orWhere('sm.longdescription', 'like', $search)
                    ->orWhere('ls.bin', 'like', $search);
            });
        }

        $rows = $query
            ->orderBy($filters['orderBy'] === 'usage' ? 'quantity_used' : 'ls.stockid', $filters['orderBy'] === 'usage' ? 'desc' : 'asc')
            ->orderBy('ls.stockid')
            ->limit(1200)
            ->get();

        return $rows->map(fn ($row) => $this->mapRow($row, $filters));
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

    private function mapRow($row, array $filters): array
    {
        $decimalPlaces = (int) ($row->decimalplaces ?? 0);
        $quantityUsed = (float) $row->quantity_used;
        $periodDays = max(1, Carbon::parse($filters['dateFrom'])->diffInDays(Carbon::parse($filters['dateTo'])) + 1);
        $dailyUsage = $quantityUsed / $periodDays;
        $suggestedReorder = max((float) $row->reorderlevel, $dailyUsage * 30);

        return [
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
            'location' => (string) $row->loccode,
            'onHand' => round((float) $row->quantity, $decimalPlaces),
            'onHandAll' => round((float) $row->all_on_hand, $decimalPlaces),
            'quantityUsed' => round($quantityUsed, $decimalPlaces),
            'dailyUsage' => round($dailyUsage, 4),
            'reorderLevel' => round((float) $row->reorderlevel, $decimalPlaces),
            'suggestedReorder' => round($suggestedReorder, $decimalPlaces),
            'bin' => (string) ($row->bin ?? ''),
            'units' => (string) ($row->units ?: ''),
            'decimalPlaces' => $decimalPlaces,
            'status' => (float) $row->quantity <= (float) $row->reorderlevel && (float) $row->reorderlevel > 0 ? 'Below reorder' : 'Set',
        ];
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

    private function summary($rows): array
    {
        return [
            'lines' => $rows->count(),
            'belowReorder' => $rows->where('status', 'Below reorder')->count(),
            'withUsage' => $rows->filter(fn ($row) => (float) $row['quantityUsed'] > 0.0)->count(),
            'zeroReorder' => $rows->filter(fn ($row) => (float) $row['reorderLevel'] <= 0.0)->count(),
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

    private function audit(Request $request, string $stockId, string $location, float $oldReorder, float $newReorder, string $oldBin, string $newBin): void
    {
        if (!Schema::hasTable('audittrail')) {
            return;
        }

        $columns = Schema::getColumnListing('audittrail');
        $row = [
            'transactiondate' => Carbon::now()->format('Y-m-d H:i:s'),
            'userid' => $this->currentUserId($request),
            'querystring' => 'Updated reorder level for ' . $stockId . ' at ' . $location . ' from ' . $oldReorder . ' to ' . $newReorder . '; bin ' . $oldBin . ' to ' . $newBin,
        ];

        $insert = array_intersect_key($row, array_flip($columns));
        if (count($insert) > 0) {
            DB::table('audittrail')->insert($insert);
        }
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

        return (string) (DB::table('locationusers')->orderBy('userid')->value('userid') ?: 'akiva');
    }
}
