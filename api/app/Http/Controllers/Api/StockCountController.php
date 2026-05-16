<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockCountController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => [],
                    'categories' => [],
                    'countRows' => [],
                    'recentEntries' => [],
                    'summary' => [
                        'sheetItems' => 0,
                        'countedItems' => 0,
                        'notCountedItems' => 0,
                        'countLines' => 0,
                        'varianceUnits' => 0,
                        'activeCountDate' => null,
                    ],
                ],
            ]);
        }

        try {
            $location = strtoupper(trim((string) $request->query('location', '')));
            $category = trim((string) $request->query('category', ''));
            $search = trim((string) $request->query('q', ''));

            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => $this->locations(),
                    'categories' => $this->categories(),
                    'countRows' => $this->countRows($location, $category, $search),
                    'recentEntries' => $this->recentEntries($location, $category, $search),
                    'summary' => $this->summary($location, $category, $search),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock counts could not be loaded.',
            ], 500);
        }
    }

    public function items(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [],
                'pagination' => ['page' => 1, 'limit' => 20, 'total' => 0, 'hasMore' => false],
            ]);
        }

        $location = strtoupper(trim((string) $request->query('location', '')));
        $category = trim((string) $request->query('category', ''));
        $search = trim((string) $request->query('q', ''));
        $page = max(1, (int) $request->query('page', 1));
        $limit = $this->safeLimit($request->query('limit', 20), 10, 50);

        try {
            $query = $this->stockCheckQuery($location, $category, $search);
            $total = (clone $query)->count();
            $rows = $query
                ->orderBy('sm.stockid')
                ->offset(($page - 1) * $limit)
                ->limit($limit)
                ->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(fn ($row) => $this->countRowPayload($row))->values(),
                'pagination' => [
                    'page' => $page,
                    'limit' => $limit,
                    'total' => $total,
                    'hasMore' => ($page * $limit) < $total,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Countable items could not be loaded.',
            ], 500);
        }
    }

    public function store(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Stock counts are not available.',
            ], 503);
        }

        $location = strtoupper(trim((string) $request->input('location', '')));
        $entries = $request->input('entries');
        if (!is_array($entries) || count($entries) === 0) {
            $entries = [[
                'stockId' => $request->input('stockId'),
                'quantity' => $request->input('quantity'),
                'reference' => $request->input('reference'),
            ]];
        }

        if ($location === '' || !$this->locationExists($location)) {
            return $this->validationError('Choose the count location.');
        }

        if (count($entries) > 50) {
            return $this->validationError('Post counts in batches of 50 lines or less.');
        }

        $prepared = [];
        foreach ($entries as $index => $entry) {
            $stockId = strtoupper(trim((string) ($entry['stockId'] ?? '')));
            $quantity = $this->numberValue($entry['quantity'] ?? null);
            $reference = trim((string) ($entry['reference'] ?? ''));

            if ($stockId === '') {
                return $this->validationError('Choose an item for every count line.');
            }

            if (!is_numeric((string) ($entry['quantity'] ?? ''))) {
                return $this->validationError('Enter a counted quantity for every count line.');
            }

            $sheetItem = $this->sheetItem($stockId, $location);
            if ($sheetItem === null) {
                return $this->validationError("{$stockId} is not on the active count sheet for this location.");
            }

            $decimalPlaces = (int) ($sheetItem->decimalplaces ?? 0);
            if ($this->hasTooManyDecimalPlaces($entry['quantity'] ?? 0, $decimalPlaces)) {
                return $this->validationError("{$stockId} allows {$decimalPlaces} decimal place" . ($decimalPlaces === 1 ? '' : 's') . '.');
            }

            $prepared[] = [
                'stockid' => $stockId,
                'loccode' => $location,
                'qtycounted' => round($quantity, $decimalPlaces),
                'reference' => mb_substr($reference, 0, 20),
            ];
        }

        try {
            DB::table('stockcounts')->insert($prepared);

            return response()->json([
                'success' => true,
                'message' => count($prepared) === 1 ? 'Count line saved.' : count($prepared) . ' count lines saved.',
                'data' => [
                    'countRows' => $this->countRows($location),
                    'recentEntries' => $this->recentEntries($location),
                    'summary' => $this->summary($location),
                ],
            ], 201);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock count could not be saved.',
            ], 500);
        }
    }

    public function saveLine(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Stock counts are not available.',
            ], 503);
        }

        $location = strtoupper(trim((string) $request->input('location', '')));
        $stockId = strtoupper(trim((string) $request->input('stockId', '')));
        $quantityInput = $request->input('quantity');
        $quantity = $this->numberValue($quantityInput);
        $reference = trim((string) $request->input('reference', 'Table edit'));
        $filterLocationInput = trim((string) $request->input('filterLocation', $location));
        $filterLocation = strcasecmp($filterLocationInput, 'All') === 0 ? 'All' : strtoupper($filterLocationInput);
        $category = trim((string) $request->input('category', ''));
        $search = trim((string) $request->input('q', ''));

        if ($location === '' || !$this->locationExists($location)) {
            return $this->validationError('Choose the count location.');
        }

        if ($stockId === '') {
            return $this->validationError('Choose the item being counted.');
        }

        if (!is_numeric((string) $quantityInput)) {
            return $this->validationError('Enter the counted quantity.');
        }

        $sheetItem = $this->sheetItem($stockId, $location);
        if ($sheetItem === null) {
            return $this->validationError("{$stockId} is not on the active count sheet for this location.");
        }

        $decimalPlaces = (int) ($sheetItem->decimalplaces ?? 0);
        if ($this->hasTooManyDecimalPlaces($quantityInput, $decimalPlaces)) {
            return $this->validationError("{$stockId} allows {$decimalPlaces} decimal place" . ($decimalPlaces === 1 ? '' : 's') . '.');
        }

        try {
            DB::transaction(function () use ($stockId, $location, $quantity, $decimalPlaces, $reference) {
                DB::table('stockcounts')
                    ->where('stockid', $stockId)
                    ->where('loccode', $location)
                    ->delete();

                DB::table('stockcounts')->insert([
                    'stockid' => $stockId,
                    'loccode' => $location,
                    'qtycounted' => round($quantity, $decimalPlaces),
                    'reference' => mb_substr($reference !== '' ? $reference : 'Table edit', 0, 20),
                ]);
            });

            return response()->json([
                'success' => true,
                'message' => 'Count saved.',
                'data' => [
                    'countRows' => $this->countRows($filterLocation, $category, $search),
                    'recentEntries' => $this->recentEntries($filterLocation, $category, $search),
                    'summary' => $this->summary($filterLocation, $category, $search),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Count could not be saved.',
            ], 500);
        }
    }

    public function prepare(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Stock counts are not available.',
            ], 503);
        }

        $location = strtoupper(trim((string) $request->input('location', '')));
        $category = trim((string) $request->input('category', ''));
        $mode = (string) $request->input('mode', 'update');
        $onlyNonZero = (bool) $request->input('onlyNonZero', false);

        if ($location === '' || !$this->locationExists($location)) {
            return $this->validationError('Choose the location to count.');
        }

        try {
            $created = DB::transaction(function () use ($location, $category, $mode, $onlyNonZero) {
                $items = DB::table('stockmaster as sm')
                    ->leftJoin('locstock as ls', function ($join) use ($location) {
                        $join->on('ls.stockid', '=', 'sm.stockid')
                            ->where('ls.loccode', '=', $location);
                    })
                    ->where('sm.discontinued', 0)
                    ->whereNotIn('sm.mbflag', ['D', 'A', 'K'])
                    ->select('sm.stockid', DB::raw('COALESCE(ls.quantity, 0) as qoh'));

                if ($category !== '' && $category !== 'All') {
                    $items->where('sm.categoryid', $category);
                }

                if ($onlyNonZero) {
                    $items->whereRaw('COALESCE(ls.quantity, 0) <> 0');
                }

                $rows = $items->get();

                if ($mode === 'replace') {
                    $delete = DB::table('stockcheckfreeze')->where('loccode', $location);
                    if ($category !== '' && $category !== 'All') {
                        $stockIds = $rows->pluck('stockid')->map(fn ($value) => (string) $value)->all();
                        $delete->whereIn('stockid', $stockIds);
                    }
                    $delete->delete();
                }

                $today = now()->toDateString();
                foreach ($rows as $row) {
                    DB::table('stockcheckfreeze')->updateOrInsert(
                        ['stockid' => (string) $row->stockid, 'loccode' => $location],
                        ['qoh' => (float) $row->qoh, 'stockcheckdate' => $today]
                    );
                }

                return $rows->count();
            });

            return response()->json([
                'success' => true,
                'message' => $created === 1 ? 'Count sheet prepared for 1 item.' : "Count sheet prepared for {$created} items.",
                'data' => [
                    'countRows' => $this->countRows($location, $category),
                    'recentEntries' => $this->recentEntries($location, $category),
                    'summary' => $this->summary($location, $category),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Count sheet could not be prepared.',
            ], 500);
        }
    }

    public function destroy($id)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Stock counts are not available.',
            ], 503);
        }

        $entry = DB::table('stockcounts')->where('id', (int) $id)->first();
        if ($entry === null) {
            return response()->json([
                'success' => false,
                'message' => 'The selected count line was not found.',
            ], 404);
        }

        try {
            DB::table('stockcounts')->where('id', (int) $id)->delete();

            return response()->json([
                'success' => true,
                'message' => 'Count line deleted.',
                'data' => [
                    'countRows' => $this->countRows((string) $entry->loccode),
                    'recentEntries' => $this->recentEntries((string) $entry->loccode),
                    'summary' => $this->summary((string) $entry->loccode),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Count line could not be deleted.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('stockcounts')
            && Schema::hasTable('stockcheckfreeze')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locstock')
            && Schema::hasTable('locations');
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

    private function categories()
    {
        $query = DB::table('stockmaster as sm')
            ->where('sm.discontinued', 0)
            ->whereNotIn('sm.mbflag', ['D', 'A', 'K'])
            ->select('sm.categoryid')
            ->distinct()
            ->orderBy('sm.categoryid');

        if (Schema::hasTable('stockcategory')) {
            $query
                ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
                ->addSelect(DB::raw('COALESCE(NULLIF(sc.categorydescription, ""), sm.categoryid) as category_name'));
        } else {
            $query->addSelect(DB::raw('sm.categoryid as category_name'));
        }

        return $query
            ->get()
            ->map(function ($row) {
                return [
                    'value' => (string) $row->categoryid,
                    'label' => html_entity_decode((string) ($row->category_name ?: $row->categoryid)),
                ];
            })
            ->values();
    }

    private function countRows(string $location = '', string $category = '', string $search = '')
    {
        return $this->stockCheckQuery($location, $category, $search)
            ->orderBy('loc.locationname')
            ->orderBy('sm.stockid')
            ->limit(200)
            ->get()
            ->map(fn ($row) => $this->countRowPayload($row))
            ->values();
    }

    private function stockCheckQuery(string $location = '', string $category = '', string $search = '')
    {
        $totals = $this->countTotalsQuery();

        $query = DB::table('stockcheckfreeze as scf')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'scf.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'scf.loccode')
            ->leftJoinSub($totals, 'counts', function ($join) {
                $join->on('counts.stockid', '=', 'scf.stockid')
                    ->on('counts.loccode', '=', 'scf.loccode');
            })
            ->select(
                'scf.stockid',
                'scf.loccode',
                'scf.qoh',
                'scf.stockcheckdate',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.categoryid',
                'sm.decimalplaces',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), scf.loccode) as location_name'),
                DB::raw('COALESCE(counts.qty_counted, 0) as qty_counted'),
                DB::raw('COALESCE(counts.count_lines, 0) as count_lines'),
                DB::raw('COALESCE(counts.last_reference, "") as last_reference')
            );

        if (Schema::hasTable('stockcategory')) {
            $query
                ->leftJoin('stockcategory as scat', 'scat.categoryid', '=', 'sm.categoryid')
                ->addSelect(DB::raw('COALESCE(NULLIF(scat.categorydescription, ""), sm.categoryid) as category_name'));
        } else {
            $query->addSelect(DB::raw('sm.categoryid as category_name'));
        }

        if ($location !== '' && $location !== 'All') {
            $query->where('scf.loccode', $location);
        }

        if ($category !== '' && $category !== 'All') {
            $query->where('sm.categoryid', $category);
        }

        if ($search !== '') {
            $query->where(function ($inner) use ($search) {
                $inner
                    ->where('scf.stockid', 'like', "%{$search}%")
                    ->orWhere('sm.description', 'like', "%{$search}%")
                    ->orWhere('sm.longdescription', 'like', "%{$search}%")
                    ->orWhere('loc.locationname', 'like', "%{$search}%")
                    ->orWhere('sm.categoryid', 'like', "%{$search}%");
            });
        }

        return $query;
    }

    private function countTotalsQuery()
    {
        return DB::table('stockcounts')
            ->select('stockid', 'loccode')
            ->selectRaw('SUM(qtycounted) as qty_counted')
            ->selectRaw('COUNT(*) as count_lines')
            ->selectRaw('MAX(reference) as last_reference')
            ->groupBy('stockid', 'loccode');
    }

    private function countRowPayload(object $row): array
    {
        $frozen = (float) $row->qoh;
        $counted = (float) $row->qty_counted;
        $countLines = (int) $row->count_lines;
        $variance = $countLines > 0 ? $counted - $frozen : 0.0;
        $status = $countLines === 0 ? 'Not counted' : (abs($variance) < 0.000001 ? 'Matched' : 'Variance');

        return [
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'longDescription' => html_entity_decode((string) ($row->longdescription ?? '')),
            'location' => (string) $row->loccode,
            'locationName' => html_entity_decode((string) $row->location_name),
            'category' => (string) $row->categoryid,
            'categoryName' => html_entity_decode((string) ($row->category_name ?: $row->categoryid)),
            'units' => (string) ($row->units ?: 'each'),
            'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
            'frozenQuantity' => $frozen,
            'countedQuantity' => $countLines > 0 ? $counted : null,
            'variance' => $variance,
            'countLines' => $countLines,
            'lastReference' => (string) ($row->last_reference ?? ''),
            'stockCheckDate' => $this->dateOnly((string) $row->stockcheckdate),
            'status' => $status,
        ];
    }

    private function recentEntries(string $location = '', string $category = '', string $search = '')
    {
        $query = DB::table('stockcounts as c')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'c.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'c.loccode')
            ->leftJoin('stockcheckfreeze as scf', function ($join) {
                $join->on('scf.stockid', '=', 'c.stockid')
                    ->on('scf.loccode', '=', 'c.loccode');
            })
            ->select(
                'c.id',
                'c.stockid',
                'c.loccode',
                'c.qtycounted',
                'c.reference',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.categoryid',
                'sm.decimalplaces',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), c.loccode) as location_name'),
                DB::raw('COALESCE(scf.qoh, 0) as frozen_quantity'),
                DB::raw('COALESCE(scf.stockcheckdate, NULL) as stockcheckdate')
            );

        if ($location !== '' && $location !== 'All') {
            $query->where('c.loccode', $location);
        }

        if ($category !== '' && $category !== 'All') {
            $query->where('sm.categoryid', $category);
        }

        if ($search !== '') {
            $query->where(function ($inner) use ($search) {
                $inner
                    ->where('c.stockid', 'like', "%{$search}%")
                    ->orWhere('sm.description', 'like', "%{$search}%")
                    ->orWhere('c.reference', 'like', "%{$search}%")
                    ->orWhere('loc.locationname', 'like', "%{$search}%");
            });
        }

        return $query
            ->orderByDesc('c.id')
            ->limit(100)
            ->get()
            ->map(function ($row) {
                return [
                    'id' => (int) $row->id,
                    'stockId' => (string) $row->stockid,
                    'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
                    'location' => (string) $row->loccode,
                    'locationName' => html_entity_decode((string) $row->location_name),
                    'quantity' => (float) $row->qtycounted,
                    'reference' => (string) $row->reference,
                    'units' => (string) ($row->units ?: 'each'),
                    'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
                    'frozenQuantity' => (float) $row->frozen_quantity,
                    'stockCheckDate' => $row->stockcheckdate ? $this->dateOnly((string) $row->stockcheckdate) : null,
                ];
            })
            ->values();
    }

    private function summary(string $location = '', string $category = '', string $search = ''): array
    {
        $rows = $this->stockCheckQuery($location, $category, $search)->get();
        $sheetItems = $rows->count();
        $countedItems = $rows->filter(fn ($row) => (int) $row->count_lines > 0)->count();
        $varianceUnits = (float) $rows->reduce(function ($sum, $row) {
            if ((int) $row->count_lines === 0) {
                return $sum;
            }
            return $sum + abs((float) $row->qty_counted - (float) $row->qoh);
        }, 0.0);
        $activeCountDate = $rows->max('stockcheckdate');

        $entriesQuery = DB::table('stockcounts as c')
            ->join('stockcheckfreeze as scf', function ($join) {
                $join->on('scf.stockid', '=', 'c.stockid')
                    ->on('scf.loccode', '=', 'c.loccode');
            })
            ->join('stockmaster as sm', 'sm.stockid', '=', 'c.stockid');

        if ($location !== '' && $location !== 'All') {
            $entriesQuery->where('c.loccode', $location);
        }
        if ($category !== '' && $category !== 'All') {
            $entriesQuery->where('sm.categoryid', $category);
        }
        if ($search !== '') {
            $entriesQuery->where(function ($inner) use ($search) {
                $inner
                    ->where('c.stockid', 'like', "%{$search}%")
                    ->orWhere('sm.description', 'like', "%{$search}%")
                    ->orWhere('c.reference', 'like', "%{$search}%");
            });
        }

        return [
            'sheetItems' => $sheetItems,
            'countedItems' => $countedItems,
            'notCountedItems' => max(0, $sheetItems - $countedItems),
            'countLines' => (clone $entriesQuery)->count(),
            'varianceUnits' => $varianceUnits,
            'activeCountDate' => $activeCountDate ? $this->dateOnly((string) $activeCountDate) : null,
        ];
    }

    private function sheetItem(string $stockId, string $location)
    {
        return DB::table('stockcheckfreeze as scf')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'scf.stockid')
            ->where('scf.stockid', $stockId)
            ->where('scf.loccode', $location)
            ->select('scf.stockid', 'scf.loccode', 'sm.decimalplaces')
            ->first();
    }

    private function locationExists(string $location): bool
    {
        return DB::table('locations')->where('loccode', $location)->exists();
    }

    private function safeLimit($value, int $minimum, int $maximum): int
    {
        $limit = (int) $value;
        if ($limit < $minimum) return $minimum;
        if ($limit > $maximum) return $maximum;
        return $limit;
    }

    private function numberValue($value): float
    {
        return (float) str_replace(',', '', (string) $value);
    }

    private function hasTooManyDecimalPlaces($value, int $allowed): bool
    {
        $raw = trim((string) $value);
        if ($raw === '' || !str_contains($raw, '.')) {
            return false;
        }

        $decimal = rtrim(substr($raw, strpos($raw, '.') + 1), '0');
        return mb_strlen($decimal) > $allowed;
    }

    private function dateOnly(string $date): string
    {
        return substr($date, 0, 10);
    }

    private function validationError(string $message)
    {
        return response()->json([
            'success' => false,
            'message' => $message,
        ], 422);
    }
}
