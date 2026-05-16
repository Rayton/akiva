<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockIssueController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'nextIssueNumber' => 1,
                    'locations' => [],
                    'tags' => [],
                    'recentIssues' => [],
                    'currency' => 'TZS',
                    'settings' => ['prohibitNegativeStock' => true],
                ],
            ]);
        }

        try {
            return response()->json([
                'success' => true,
                'data' => [
                    'nextIssueNumber' => $this->nextIssueNumber(),
                    'locations' => $this->locations(),
                    'tags' => $this->tags(),
                    'recentIssues' => $this->recentIssues(
                        strtoupper(trim((string) $request->query('location', ''))),
                        trim((string) $request->query('q', '')),
                        $this->queryDate($request->query('from')),
                        $this->queryDate($request->query('to'))
                    ),
                    'currency' => $this->currency(),
                    'settings' => ['prohibitNegativeStock' => $this->prohibitNegativeStock()],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock issues could not be loaded.',
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
        $search = trim((string) $request->query('q', ''));
        $page = max(1, (int) $request->query('page', 1));
        $limit = $this->safeLimit($request->query('limit', 20), 10, 50);

        if ($location === '' || !$this->locationExists($location)) {
            return response()->json([
                'success' => true,
                'data' => [],
                'pagination' => ['page' => $page, 'limit' => $limit, 'total' => 0, 'hasMore' => false],
            ]);
        }

        try {
            $baseQuery = $this->itemsQuery($search, $location);
            $total = (clone $baseQuery)->count('sm.stockid');
            $rows = $baseQuery
                ->offset(($page - 1) * $limit)
                ->limit($limit)
                ->get();

            $stockIds = $rows->pluck('stockid')->map(fn ($value) => (string) $value)->all();
            $latestCosts = $this->latestItemCosts($stockIds);
            $balances = $this->availabilityForLocation($location, $stockIds);

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) use ($latestCosts, $balances) {
                    $item = $this->itemPayload($row, $latestCosts);
                    $item['balance'] = $balances[$item['stockId']] ?? $this->emptyBalance();
                    return $item;
                })->values(),
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
                'message' => 'Items could not be loaded.',
            ], 500);
        }
    }

    public function store(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Stock issues are not available.',
            ], 503);
        }

        $location = strtoupper(trim((string) $request->input('location', '')));
        $date = $this->dateOnly((string) $request->input('date', Carbon::today()->toDateString()));
        $reason = trim((string) $request->input('reason', ''));
        $lines = $request->input('lines', []);

        if ($location === '' || !$this->locationExists($location)) {
            return $this->validationError('Choose the stock location issuing the items.');
        }

        if ($reason === '') {
            return $this->validationError('Enter why these items are being issued.');
        }

        if (!is_array($lines) || count($lines) === 0) {
            return $this->validationError('Add at least one item to issue.');
        }

        $preparedLines = [];
        $issueByStockId = [];

        foreach ($lines as $line) {
            $stockId = strtoupper(trim((string) ($line['stockId'] ?? '')));
            $quantity = $this->numberValue($line['quantity'] ?? 0);
            $tag = (int) ($line['tag'] ?? 0);

            if ($stockId === '') {
                return $this->validationError('Choose an item for every issue line.');
            }

            if ($quantity <= 0) {
                return $this->validationError('Enter a quantity greater than zero for every issue line.');
            }

            $item = $this->itemForPosting($stockId);
            if ($item === null) {
                return $this->validationError("{$stockId} is no longer available.");
            }

            if (in_array(strtoupper((string) $item->mbflag), ['D', 'A', 'K'], true)) {
                return $this->validationError("{$stockId} is not a stock-held item and cannot be issued.");
            }

            if ((bool) $item->controlled || (bool) $item->serialised) {
                return $this->validationError("{$stockId} is batch or serial controlled and needs the controlled-stock issue flow.");
            }

            $decimalPlaces = (int) ($item->decimalplaces ?? 0);
            if ($this->hasTooManyDecimalPlaces($line['quantity'] ?? 0, $decimalPlaces)) {
                return $this->validationError("{$stockId} allows {$decimalPlaces} decimal place" . ($decimalPlaces === 1 ? '' : 's') . '.');
            }

            $quantity = round($quantity, $decimalPlaces);
            $preparedLines[] = [
                'stockId' => $stockId,
                'quantity' => $quantity,
                'tag' => $tag,
                'item' => $item,
                'decimalPlaces' => $decimalPlaces,
            ];
            $issueByStockId[$stockId] = ($issueByStockId[$stockId] ?? 0) + $quantity;
        }

        if ($this->prohibitNegativeStock()) {
            foreach ($issueByStockId as $stockId => $issueQuantity) {
                $onHand = $this->locationStockQuantity($location, $stockId);
                if ($onHand - $issueQuantity < 0) {
                    return $this->validationError("{$stockId} does not have enough stock at this location.");
                }
            }
        }

        try {
            $posted = DB::transaction(function () use ($request, $preparedLines, $location, $date, $reason) {
                $issueNumber = $this->reserveIssueNumber();
                $periodNo = $this->periodForDate($date);
                $userId = $this->postingUser($request);
                $postedLines = [];

                foreach ($preparedLines as $line) {
                    $item = $line['item'];
                    $quantity = -abs((float) $line['quantity']);
                    $stockId = (string) $line['stockId'];
                    $decimalPlaces = (int) $line['decimalPlaces'];
                    $onHandBefore = $this->locationStockQuantity($location, $stockId);
                    $onHandAfter = round($onHandBefore + $quantity, $decimalPlaces);
                    $standardCost = $this->postingCost($item);

                    $this->insertStockMove([
                        'stockid' => $stockId,
                        'type' => 17,
                        'transno' => $issueNumber,
                        'loccode' => $location,
                        'trandate' => $date,
                        'userid' => $userId,
                        'prd' => $periodNo,
                        'reference' => $reason,
                        'qty' => $quantity,
                        'newqoh' => $onHandAfter,
                        'standardcost' => $standardCost,
                        'narrative' => '',
                        'units' => (string) ($item->units ?? ''),
                        'conversionfactor' => 1,
                    ]);

                    $this->adjustLocationStock($location, $stockId, $quantity, $decimalPlaces);
                    $this->postIssueGl($item, $quantity, $standardCost, $periodNo, $date, $issueNumber, $reason, (int) $line['tag']);

                    $postedLines[] = [
                        'stockId' => $stockId,
                        'description' => html_entity_decode((string) ($item->description ?: $item->longdescription ?: $stockId)),
                        'quantity' => abs($quantity),
                        'onHandBefore' => $onHandBefore,
                        'onHandAfter' => $onHandAfter,
                        'unitCost' => $standardCost,
                        'value' => abs($quantity) * $standardCost,
                        'units' => (string) ($item->units ?: ''),
                    ];
                }

                return [
                    'issueNumber' => $issueNumber,
                    'location' => $location,
                    'date' => $date,
                    'reason' => $reason,
                    'lines' => $postedLines,
                    'totalValue' => array_sum(array_map(fn ($line) => (float) $line['value'], $postedLines)),
                ];
            });

            return response()->json([
                'success' => true,
                'message' => 'Stock issue posted.',
                'issue' => $posted,
                'data' => [
                    'nextIssueNumber' => $this->nextIssueNumber(),
                    'recentIssues' => $this->recentIssues(),
                ],
            ], 201);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock issue could not be posted.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('locations')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locstock')
            && Schema::hasTable('stockmoves');
    }

    private function locations()
    {
        return DB::table('locations')
            ->select('loccode', 'locationname')
            ->orderBy('locationname')
            ->get()
            ->map(function ($row) {
                $name = html_entity_decode((string) ($row->locationname ?: $row->loccode));
                return [
                    'value' => (string) $row->loccode,
                    'label' => $name,
                    'code' => (string) $row->loccode,
                ];
            })
            ->values();
    }

    private function tags()
    {
        if (!Schema::hasTable('tags')) {
            return [];
        }

        return DB::table('tags')
            ->select('tagref', 'tagdescription')
            ->orderBy('tagdescription')
            ->get()
            ->map(function ($row) {
                return [
                    'value' => (string) $row->tagref,
                    'label' => (string) $row->tagref . ' - ' . html_entity_decode((string) $row->tagdescription),
                ];
            })
            ->values();
    }

    private function currency(): string
    {
        if (!Schema::hasTable('companies')) {
            return 'TZS';
        }

        return (string) (DB::table('companies')->where('coycode', 1)->value('currencydefault') ?? 'TZS');
    }

    private function recentIssues(string $location = '', string $search = '', ?string $fromDate = null, ?string $toDate = null)
    {
        $columns = Schema::getColumnListing('stockmoves');
        $hasUserId = in_array('userid', $columns, true);

        $query = DB::table('stockmoves as smv')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'smv.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'smv.loccode')
            ->where('smv.type', 17)
            ->where('smv.qty', '<', 0)
            ->select(
                'smv.transno',
                'smv.stockid',
                'smv.loccode',
                'smv.trandate',
                'smv.reference',
                'smv.qty',
                'smv.newqoh',
                'smv.standardcost',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), smv.loccode) as location_name')
            );

        if ($hasUserId) {
            $query->addSelect('smv.userid');
        }

        if ($location !== '') {
            $query->where('smv.loccode', $location);
        }

        if ($fromDate !== null && $toDate !== null && $fromDate > $toDate) {
            [$fromDate, $toDate] = [$toDate, $fromDate];
        }

        if ($fromDate !== null) {
            $query->whereDate('smv.trandate', '>=', $fromDate);
        }

        if ($toDate !== null) {
            $query->whereDate('smv.trandate', '<=', $toDate);
        }

        if ($search !== '') {
            $query->where(function ($inner) use ($search) {
                $inner
                    ->where('smv.stockid', 'like', "%{$search}%")
                    ->orWhere('sm.description', 'like', "%{$search}%")
                    ->orWhere('smv.reference', 'like', "%{$search}%")
                    ->orWhere('smv.transno', 'like', "%{$search}%");
            });
        }

        return $query
            ->orderByDesc('smv.trandate')
            ->orderByDesc('smv.transno')
            ->limit(120)
            ->get()
            ->map(function ($row) use ($hasUserId) {
                $qty = abs((float) $row->qty);
                $unitCost = (float) $row->standardcost;
                return [
                    'issueNumber' => (int) $row->transno,
                    'stockId' => (string) $row->stockid,
                    'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
                    'location' => (string) $row->loccode,
                    'locationName' => html_entity_decode((string) $row->location_name),
                    'date' => $this->dateOnly((string) $row->trandate),
                    'quantity' => $qty,
                    'newOnHand' => (float) $row->newqoh,
                    'unitCost' => $unitCost,
                    'value' => $qty * $unitCost,
                    'reason' => html_entity_decode((string) $row->reference),
                    'postedBy' => $hasUserId ? (string) ($row->userid ?? '') : '',
                    'units' => (string) ($row->units ?: ''),
                ];
            })
            ->values();
    }

    private function itemsQuery(string $search, string $location)
    {
        $query = DB::table('stockmaster as sm')
            ->leftJoin('locstock as ls', function ($join) use ($location) {
                $join->on('ls.stockid', '=', 'sm.stockid')->where('ls.loccode', '=', $location);
            })
            ->select(
                'sm.stockid',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.mbflag',
                'sm.decimalplaces',
                'sm.controlled',
                'sm.serialised',
                'sm.materialcost',
                'sm.labourcost',
                'sm.overheadcost',
                'sm.actualcost',
                'sm.lastcost',
                'sm.categoryid',
                DB::raw('COALESCE(ls.quantity, 0) as location_quantity')
            )
            ->where('sm.discontinued', 0)
            ->whereNotIn('sm.mbflag', ['D', 'A', 'K']);

        if (Schema::hasTable('stockcategory')) {
            $query
                ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
                ->addSelect(DB::raw('COALESCE(NULLIF(sc.categorydescription, ""), sm.categoryid) as category_name'));
        } else {
            $query->addSelect(DB::raw('sm.categoryid as category_name'));
        }

        if ($search !== '') {
            $query->where(function ($inner) use ($search) {
                $inner
                    ->where('sm.stockid', 'like', "%{$search}%")
                    ->orWhere('sm.description', 'like', "%{$search}%")
                    ->orWhere('sm.longdescription', 'like', "%{$search}%")
                    ->orWhere('sm.categoryid', 'like', "%{$search}%");
            });
        }

        return $query
            ->orderByDesc(DB::raw('COALESCE(ls.quantity, 0)'))
            ->orderBy('sm.stockid');
    }

    private function itemPayload(object $row, array $latestCosts = []): array
    {
        $stockId = (string) $row->stockid;
        $description = html_entity_decode((string) ($row->description ?: $row->longdescription ?: $stockId));
        $standardCost = (float) ($row->materialcost ?? 0) + (float) ($row->labourcost ?? 0) + (float) ($row->overheadcost ?? 0);
        $unitCost = $standardCost > 0 ? $standardCost : (float) ($row->actualcost ?: $row->lastcost ?: 0);
        if ($unitCost <= 0 && isset($latestCosts[$stockId])) {
            $unitCost = (float) $latestCosts[$stockId];
        }

        return [
            'stockId' => $stockId,
            'description' => $description,
            'longDescription' => html_entity_decode((string) ($row->longdescription ?? '')),
            'units' => (string) ($row->units ?: 'each'),
            'category' => html_entity_decode((string) ($row->category_name ?: 'Uncategorised')),
            'mbFlag' => (string) $row->mbflag,
            'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
            'controlled' => (bool) $row->controlled,
            'serialised' => (bool) $row->serialised,
            'unitCost' => $unitCost,
        ];
    }

    private function itemForPosting(string $stockId)
    {
        return DB::table('stockmaster')
            ->where('stockid', $stockId)
            ->where('discontinued', 0)
            ->first();
    }

    private function latestItemCosts(array $stockIds): array
    {
        $costs = $this->latestStockMoveCosts($stockIds);
        $missingStockIds = array_values(array_filter($stockIds, fn ($stockId) => !isset($costs[$stockId]) || (float) $costs[$stockId] <= 0));

        foreach ($this->latestPurchaseCosts($missingStockIds) as $stockId => $cost) {
            if (!isset($costs[$stockId]) || (float) $costs[$stockId] <= 0) {
                $costs[$stockId] = $cost;
            }
        }

        return $costs;
    }

    private function latestStockMoveCosts(array $stockIds): array
    {
        if (count($stockIds) === 0 || !Schema::hasTable('stockmoves')) {
            return [];
        }

        $costSources = [];
        foreach (['standardcost', 'price'] as $column) {
            if (Schema::hasColumn('stockmoves', $column)) {
                $costSources[] = $column;
            }
        }

        if (count($costSources) === 0) {
            return [];
        }

        $costExpression = '0';
        foreach (array_reverse($costSources) as $column) {
            $costExpression = 'CASE WHEN ' . $column . ' > 0 THEN ' . $column . ' ELSE ' . $costExpression . ' END';
        }

        $orderColumn = Schema::hasColumn('stockmoves', 'stkmoveno') ? 'stkmoveno' : 'trandate';
        $costs = [];

        DB::table('stockmoves')
            ->whereIn('stockid', $stockIds)
            ->whereRaw('(' . $costExpression . ') > 0')
            ->select('stockid')
            ->selectRaw($costExpression . ' as cost')
            ->orderBy('stockid')
            ->orderByDesc($orderColumn)
            ->get()
            ->each(function ($row) use (&$costs) {
                $stockId = (string) $row->stockid;
                if (!isset($costs[$stockId])) {
                    $costs[$stockId] = (float) $row->cost;
                }
            });

        return $costs;
    }

    private function latestPurchaseCosts(array $stockIds): array
    {
        if (count($stockIds) === 0 || !Schema::hasTable('purchorderdetails')) {
            return [];
        }

        $costSources = [];
        foreach (['stdcostunit', 'actprice', 'unitprice'] as $column) {
            if (Schema::hasColumn('purchorderdetails', $column)) {
                $costSources[] = $column;
            }
        }

        if (count($costSources) === 0) {
            return [];
        }

        $costExpression = '0';
        foreach (array_reverse($costSources) as $column) {
            $costExpression = 'CASE WHEN ' . $column . ' > 0 THEN ' . $column . ' ELSE ' . $costExpression . ' END';
        }

        $orderColumn = Schema::hasColumn('purchorderdetails', 'podetailitem') ? 'podetailitem' : 'orderno';
        $costs = [];

        DB::table('purchorderdetails')
            ->whereIn('itemcode', $stockIds)
            ->whereRaw('(' . $costExpression . ') > 0')
            ->select('itemcode')
            ->selectRaw($costExpression . ' as cost')
            ->orderBy('itemcode')
            ->orderByDesc($orderColumn)
            ->get()
            ->each(function ($row) use (&$costs) {
                $stockId = (string) $row->itemcode;
                if (!isset($costs[$stockId])) {
                    $costs[$stockId] = (float) $row->cost;
                }
            });

        return $costs;
    }

    private function postingCost(object $item): float
    {
        $standardCost = (float) ($item->materialcost ?? 0) + (float) ($item->labourcost ?? 0) + (float) ($item->overheadcost ?? 0);
        if ($standardCost > 0) {
            return $standardCost;
        }

        $stockId = (string) $item->stockid;
        $fallback = $this->latestItemCosts([$stockId]);
        return (float) ($fallback[$stockId] ?? (float) ($item->actualcost ?: $item->lastcost ?: 0));
    }

    private function balancesByItem(array $stockIds): array
    {
        if (count($stockIds) === 0) {
            return [];
        }

        $balances = [];
        DB::table('locstock')
            ->whereIn('stockid', $stockIds)
            ->select('stockid', 'loccode', 'quantity', 'reorderlevel', 'bin')
            ->orderBy('stockid')
            ->get()
            ->each(function ($row) use (&$balances) {
                $balances[(string) $row->stockid][(string) $row->loccode] = [
                    'onHand' => (float) $row->quantity,
                    'available' => (float) $row->quantity,
                    'reorderLevel' => (float) $row->reorderlevel,
                    'bin' => (string) ($row->bin ?? ''),
                ];
            });

        return $balances;
    }

    private function availabilityForLocation(string $location, array $stockIds): array
    {
        $balances = $this->balancesByItem($stockIds);
        $availability = [];

        foreach ($stockIds as $stockId) {
            $availability[$stockId] = $balances[$stockId][$location] ?? $this->emptyBalance();
        }

        return $availability;
    }

    private function emptyBalance(): array
    {
        return ['onHand' => 0.0, 'available' => 0.0, 'reorderLevel' => 0.0, 'bin' => ''];
    }

    private function locationStockQuantity(string $location, string $stockId): float
    {
        return (float) (DB::table('locstock')
            ->where('loccode', $location)
            ->where('stockid', $stockId)
            ->value('quantity') ?? 0);
    }

    private function adjustLocationStock(string $location, string $stockId, float $quantity, int $decimalPlaces): void
    {
        $affected = DB::table('locstock')
            ->where('loccode', $location)
            ->where('stockid', $stockId)
            ->update(['quantity' => DB::raw('quantity + ' . round($quantity, $decimalPlaces))]);

        if ($affected === 0) {
            DB::table('locstock')->insert([
                'loccode' => $location,
                'stockid' => $stockId,
                'quantity' => round($quantity, $decimalPlaces),
            ]);
        }
    }

    private function insertStockMove(array $values): void
    {
        $columns = Schema::getColumnListing('stockmoves');
        $insert = [];
        foreach ($values as $column => $value) {
            if (in_array($column, $columns, true)) {
                $insert[$column] = $value;
            }
        }

        DB::table('stockmoves')->insert($insert);
    }

    private function postIssueGl(object $item, float $quantity, float $standardCost, int $periodNo, string $date, int $issueNumber, string $reason, int $tag): void
    {
        if (!Schema::hasTable('gltrans') || $quantity == 0.0 || $standardCost <= 0 || !$this->stockGlLinked()) {
            return;
        }

        $accounts = $this->stockGlAccounts((string) $item->stockid);
        $adjustmentAccount = trim((string) ($accounts['adjustment'] ?? ''));
        $stockAccount = trim((string) ($accounts['stock'] ?? ''));
        if ($adjustmentAccount === '' || $stockAccount === '') {
            return;
        }

        $narrative = (string) $item->stockid . ' x ' . $this->formatQuantity($quantity) . ' @ ' . $this->formatQuantity($standardCost) . ' ' . $reason;
        $this->insertGlTrans([
            'type' => 17,
            'typeno' => $issueNumber,
            'trandate' => $date,
            'periodno' => $periodNo,
            'period' => $periodNo,
            'account' => $adjustmentAccount,
            'amount' => -$quantity * $standardCost,
            'narrative' => $narrative,
            'tag' => $tag,
        ]);

        $this->insertGlTrans([
            'type' => 17,
            'typeno' => $issueNumber,
            'trandate' => $date,
            'periodno' => $periodNo,
            'period' => $periodNo,
            'account' => $stockAccount,
            'amount' => $quantity * $standardCost,
            'narrative' => $narrative,
            'tag' => $tag,
        ]);
    }

    private function insertGlTrans(array $values): void
    {
        $columns = Schema::getColumnListing('gltrans');
        $insert = [];
        foreach ($values as $column => $value) {
            if (in_array($column, $columns, true)) {
                $insert[$column] = $value;
            }
        }

        DB::table('gltrans')->insert($insert);
    }

    private function stockGlAccounts(string $stockId): array
    {
        if (!Schema::hasTable('stockcategory')) {
            return ['stock' => '', 'adjustment' => ''];
        }

        $row = DB::table('stockmaster as sm')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->where('sm.stockid', $stockId)
            ->select('sc.stockact', 'sc.adjglact')
            ->first();

        return [
            'stock' => (string) ($row->stockact ?? ''),
            'adjustment' => (string) ($row->adjglact ?? ''),
        ];
    }

    private function stockGlLinked(): bool
    {
        if (!Schema::hasTable('companies')) {
            return true;
        }

        $value = DB::table('companies')->where('coycode', 1)->value('gllink_stock');
        return (string) $value === '1';
    }

    private function reserveIssueNumber(): int
    {
        $maxTransNo = (int) DB::table('stockmoves')->where('type', 17)->max('transno');
        $systype = Schema::hasTable('systypes')
            ? DB::table('systypes')->where('typeid', 17)->lockForUpdate()->first()
            : null;
        $currentTypeNo = (int) ($systype->typeno ?? 0);
        $number = max($maxTransNo, $currentTypeNo) + 1;

        if (Schema::hasTable('systypes')) {
            DB::table('systypes')->updateOrInsert(
                ['typeid' => 17],
                ['typename' => 'Stock Adjustment', 'typeno' => $number]
            );
        }

        return $number;
    }

    private function nextIssueNumber(): int
    {
        $maxTransNo = (int) DB::table('stockmoves')->where('type', 17)->max('transno');
        $typeNo = Schema::hasTable('systypes')
            ? (int) (DB::table('systypes')->where('typeid', 17)->value('typeno') ?? 0)
            : 0;

        return max($maxTransNo, $typeNo) + 1;
    }

    private function periodForDate(string $date): int
    {
        if (!Schema::hasTable('periods')) {
            return 0;
        }

        $period = DB::table('periods')
            ->where('lastdate_in_period', '>=', $date)
            ->orderBy('lastdate_in_period')
            ->value('periodno');

        if ($period !== null) {
            return (int) $period;
        }

        return (int) (DB::table('periods')->max('periodno') ?? 0);
    }

    private function postingUser(Request $request): string
    {
        $user = $request->user();
        if ($user && isset($user->userid)) {
            return (string) $user->userid;
        }
        if ($user && isset($user->name)) {
            return (string) $user->name;
        }

        return 'akiva';
    }

    private function prohibitNegativeStock(): bool
    {
        if (!Schema::hasTable('config')) {
            return true;
        }

        $value = DB::table('config')->where('confname', 'ProhibitNegativeStock')->value('confvalue');
        return (string) $value !== '0';
    }

    private function locationExists(string $location): bool
    {
        return DB::table('locations')->where('loccode', $location)->exists();
    }

    private function validationError(string $message)
    {
        return response()->json(['success' => false, 'message' => $message], 422);
    }

    private function numberValue($value): float
    {
        if (is_numeric($value)) {
            return (float) $value;
        }

        return (float) str_replace(',', '', (string) $value);
    }

    private function hasTooManyDecimalPlaces($value, int $allowed): bool
    {
        $raw = trim(str_replace(',', '', (string) $value));
        if (strpos($raw, '.') === false) {
            return false;
        }

        $parts = explode('.', $raw, 2);
        return strlen(rtrim($parts[1], '0')) > $allowed;
    }

    private function safeLimit($value, int $min, int $max): int
    {
        $limit = (int) $value;
        if ($limit < $min) return $min;
        if ($limit > $max) return $max;
        return $limit;
    }

    private function formatQuantity(float $value): string
    {
        return rtrim(rtrim(number_format($value, 4, '.', ','), '0'), '.');
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
}
