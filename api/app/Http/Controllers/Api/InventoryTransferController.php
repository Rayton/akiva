<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class InventoryTransferController extends Controller
{
    public function workbench()
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'nextReference' => 1,
                    'locations' => [],
                    'pendingTransfers' => [],
                    'settings' => ['prohibitNegativeStock' => true],
                ],
            ]);
        }

        try {
            $locations = $this->locations();

            return response()->json([
                'success' => true,
                'data' => [
                    'nextReference' => $this->nextReference(),
                    'locations' => $locations,
                    'pendingTransfers' => $this->pendingTransfers(),
                    'settings' => [
                        'prohibitNegativeStock' => $this->prohibitNegativeStock(),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Inventory transfers could not be loaded.',
            ], 500);
        }
    }

    public function transferItems(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [],
                'pagination' => [
                    'page' => 1,
                    'limit' => 25,
                    'total' => 0,
                    'hasMore' => false,
                ],
            ]);
        }

        $fromLocation = strtoupper(trim((string) $request->query('fromLocation', '')));
        $search = trim((string) $request->query('q', ''));
        $page = max(1, (int) $request->query('page', 1));
        $limit = $this->safeLimit($request->query('limit', 25), 10, 50);

        try {
            $baseQuery = $this->itemsQuery($search, $fromLocation);
            $total = (clone $baseQuery)->count('sm.stockid');
            $rows = $baseQuery
                ->offset(($page - 1) * $limit)
                ->limit($limit)
                ->get();

            $stockIds = $rows->pluck('stockid')->map(function ($value) {
                return (string) $value;
            })->all();
            $balances = $fromLocation !== '' ? $this->availabilityForLocation($fromLocation, $stockIds) : [];
            $latestCosts = $this->latestItemCosts($stockIds);

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) use ($balances, $fromLocation, $latestCosts) {
                    $item = $this->itemPayload($row, $latestCosts);
                    $item['balance'] = $fromLocation !== ''
                        ? ($balances[$item['stockId']] ?? $this->emptyBalance())
                        : $this->emptyBalance();
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

    public function receivingWorkbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => [],
                    'pendingTransfers' => [],
                ],
            ]);
        }

        $receivingLocation = strtoupper(trim((string) $request->query('receivingLocation', '')));

        try {
            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => $this->locations(),
                    'pendingTransfers' => $this->pendingTransfers($receivingLocation !== '' ? $receivingLocation : null),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Inventory transfers could not be loaded.',
            ], 500);
        }
    }

    public function store(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory transfers are not available.',
            ], 503);
        }

        $fromLocation = strtoupper(trim((string) $request->input('fromLocation', '')));
        $toLocation = strtoupper(trim((string) $request->input('toLocation', '')));
        $rawLines = $request->input('lines', []);

        if ($fromLocation === '' || $toLocation === '') {
            return $this->validationError('Choose both the sending and receiving locations.');
        }

        if ($fromLocation === $toLocation) {
            return $this->validationError('Sending and receiving locations must be different.');
        }

        if (!$this->locationExists($fromLocation) || !$this->locationExists($toLocation)) {
            return $this->validationError('One of the selected locations is no longer available.');
        }

        if (!is_array($rawLines) || count($rawLines) === 0) {
            return $this->validationError('Add at least one item to transfer.');
        }

        $lines = $this->normaliseLines($rawLines);
        if (count($lines) === 0) {
            return $this->validationError('Add at least one item with a quantity greater than zero.');
        }

        $stockIds = array_keys($lines);
        $items = DB::table('stockmaster')
            ->whereIn('stockid', $stockIds)
            ->get()
            ->keyBy('stockid');

        foreach ($stockIds as $stockId) {
            if (!$items->has($stockId)) {
                return $this->validationError("Item {$stockId} is not available for transfer.");
            }

            $item = $items[$stockId];
            if (in_array(strtoupper((string) $item->mbflag), ['D', 'A', 'K'], true)) {
                return $this->validationError("Item {$stockId} is not a stock-held item.");
            }
        }

        if ($this->prohibitNegativeStock()) {
            $availability = $this->availabilityForLocation($fromLocation, $stockIds);
            foreach ($lines as $stockId => $quantity) {
                $available = $availability[$stockId]['available'] ?? 0.0;
                if ($quantity > $available) {
                    return $this->validationError("{$stockId} has only " . $this->formatQuantity($available) . ' available at the sending location.');
                }
            }
        }

        try {
            $created = DB::transaction(function () use ($fromLocation, $toLocation, $lines, $items) {
                $reference = $this->reserveReference();
                $now = Carbon::now()->format('Y-m-d H:i:s');

                foreach ($lines as $stockId => $quantity) {
                    $decimalPlaces = (int) ($items[$stockId]->decimalplaces ?? 0);
                    DB::table('loctransfers')->insert([
                        'reference' => $reference,
                        'stockid' => $stockId,
                        'shipqty' => round($quantity, $decimalPlaces),
                        'recqty' => 0,
                        'shipdate' => $now,
                        'recdate' => '1000-01-01 00:00:00',
                        'shiploc' => $fromLocation,
                        'recloc' => $toLocation,
                    ]);
                }

                return [
                    'reference' => $reference,
                    'fromLocation' => $fromLocation,
                    'toLocation' => $toLocation,
                    'lineCount' => count($lines),
                    'totalQuantity' => array_sum($lines),
                    'shipDate' => Carbon::parse($now)->toDateString(),
                ];
            });

            return response()->json([
                'success' => true,
                'message' => 'Transfer shipment created.',
                'transfer' => $created,
                'data' => [
                    'nextReference' => $this->nextReference(),
                    'pendingTransfers' => $this->pendingTransfers(),
                ],
            ], 201);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Transfer shipment could not be created.',
            ], 500);
        }
    }

    public function show($reference)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory transfers are not available.',
            ], 503);
        }

        try {
            $transfer = $this->transferDetail((int) $reference);

            if ($transfer === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Transfer shipment was not found.',
                ], 404);
            }

            return response()->json([
                'success' => true,
                'data' => $transfer,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Transfer shipment could not be loaded.',
            ], 500);
        }
    }

    public function transferPrint($reference)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory transfers are not available.',
            ], 503);
        }

        try {
            $reference = (int) $reference;
            $transfer = $this->transferDetail($reference);

            if ($transfer === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Transfer shipment was not found.',
                ], 404);
            }

            $options = new Options();
            $options->set('defaultFont', 'DejaVu Sans');
            $options->set('isRemoteEnabled', false);
            $options->set('isHtml5ParserEnabled', true);

            $dompdf = new Dompdf($options);
            $dompdf->loadHtml($this->transferPrintHtml($transfer, $this->companyProfile()), 'UTF-8');
            $dompdf->setPaper('A4', 'landscape');
            $dompdf->render();

            $canvas = $dompdf->getCanvas();
            $fontMetrics = $dompdf->getFontMetrics();
            $font = $fontMetrics->getFont('DejaVu Sans', 'normal');
            $canvas->page_text(745, 558, 'Page {PAGE_NUM} of {PAGE_COUNT}', $font, 8, [0.48, 0.38, 0.44]);

            return response($dompdf->output(), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="inventory-transfer-' . $reference . '.pdf"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Transfer could not be printed.',
            ], 500);
        }
    }

    public function receive(Request $request, $reference)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory transfers are not available.',
            ], 503);
        }

        $reference = (int) $reference;
        $rawLines = $request->input('lines', []);
        $receivedAt = $this->dateOnly((string) $request->input('receivedAt', Carbon::today()->toDateString()));

        if (!is_array($rawLines) || count($rawLines) === 0) {
            return $this->validationError('Choose at least one item quantity to receive.');
        }

        $transfer = $this->transferDetail($reference);
        if ($transfer === null) {
            return response()->json([
                'success' => false,
                'message' => 'Transfer shipment was not found.',
            ], 404);
        }

        $existingRows = $this->transferRowsForPosting($reference);
        if ($existingRows->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Transfer shipment was not found.',
            ], 404);
        }

        $requestLines = [];
        foreach ($rawLines as $line) {
            if (!is_array($line)) {
                continue;
            }

            $stockId = strtoupper(trim((string) ($line['stockId'] ?? '')));
            if ($stockId === '') {
                continue;
            }

            $requestLines[$stockId] = [
                'quantity' => $this->numberValue($line['quantity'] ?? 0),
                'cancelBalance' => (bool) ($line['cancelBalance'] ?? false),
            ];
        }

        if (count($requestLines) === 0) {
            return $this->validationError('Choose at least one item quantity to receive.');
        }

        $totalQuantity = 0.0;
        foreach ($existingRows as $row) {
            $stockId = (string) $row->stockid;
            if (!isset($requestLines[$stockId])) {
                continue;
            }

            $quantity = round((float) $requestLines[$stockId]['quantity'], (int) ($row->decimalplaces ?? 0));
            $outstanding = max(0.0, (float) $row->shipqty - (float) $row->recqty);

            if ($quantity < 0) {
                return $this->validationError("{$stockId} cannot be received with a negative quantity.");
            }

            if ($quantity > $outstanding) {
                return $this->validationError("{$stockId} has only " . $this->formatQuantity($outstanding) . ' left to receive.');
            }

            if ($quantity > 0 && (bool) $row->controlled) {
                return $this->validationError("{$stockId} requires batch or serial receiving before it can be posted.");
            }

            $requestLines[$stockId]['quantity'] = $quantity;
            $totalQuantity += $quantity;
        }

        $hasCancellation = collect($requestLines)->contains(function ($line) {
            return (bool) ($line['cancelBalance'] ?? false);
        });

        if ($totalQuantity <= 0 && !$hasCancellation) {
            return $this->validationError('Enter a quantity to receive, or cancel an outstanding balance.');
        }

        try {
            $posted = DB::transaction(function () use ($reference, $existingRows, $requestLines, $receivedAt, $request) {
                $periodNo = $this->periodForDate($receivedAt);
                $receivedDateTime = Carbon::parse($receivedAt)->format('Y-m-d H:i:s');
                $userId = $this->postingUser($request);
                $postedLines = [];

                foreach ($existingRows as $row) {
                    $stockId = (string) $row->stockid;
                    if (!isset($requestLines[$stockId])) {
                        continue;
                    }

                    $quantity = (float) $requestLines[$stockId]['quantity'];
                    $cancelBalance = (bool) $requestLines[$stockId]['cancelBalance'];
                    $outstandingBefore = max(0.0, (float) $row->shipqty - (float) $row->recqty);
                    $cancelQuantity = $cancelBalance ? max(0.0, $outstandingBefore - $quantity) : 0.0;

                    if ($quantity > 0) {
                        $decimalPlaces = (int) ($row->decimalplaces ?? 0);
                        $fromQtyBefore = $this->locationStockQuantity((string) $row->shiploc, $stockId);
                        $toQtyBefore = $this->locationStockQuantity((string) $row->recloc, $stockId);
                        $standardCost = $this->postingCost($row);

                        $this->insertStockMove([
                            'stockid' => $stockId,
                            'type' => 16,
                            'transno' => $reference,
                            'loccode' => (string) $row->shiploc,
                            'trandate' => $receivedAt,
                            'userid' => $userId,
                            'prd' => $periodNo,
                            'reference' => 'To ' . (string) $row->to_name,
                            'qty' => round(-$quantity, $decimalPlaces),
                            'newqoh' => round($fromQtyBefore - $quantity, $decimalPlaces),
                            'standardcost' => $standardCost,
                        ]);

                        $this->insertStockMove([
                            'stockid' => $stockId,
                            'type' => 16,
                            'transno' => $reference,
                            'loccode' => (string) $row->recloc,
                            'trandate' => $receivedAt,
                            'userid' => $userId,
                            'prd' => $periodNo,
                            'reference' => 'From ' . (string) $row->from_name,
                            'qty' => round($quantity, $decimalPlaces),
                            'newqoh' => round($toQtyBefore + $quantity, $decimalPlaces),
                            'standardcost' => $standardCost,
                        ]);

                        $this->adjustLocationStock((string) $row->shiploc, $stockId, -$quantity, $decimalPlaces);
                        $this->adjustLocationStock((string) $row->recloc, $stockId, $quantity, $decimalPlaces);
                        $this->postTransferGl($row, $quantity, $standardCost, $periodNo, $receivedAt, $reference);
                    }

                    DB::table('loctransfers')
                        ->where('reference', $reference)
                        ->where('stockid', $stockId)
                        ->update([
                            'recqty' => DB::raw('recqty + ' . $quantity),
                            'recdate' => $receivedDateTime,
                        ]);

                    if ($cancelBalance) {
                        $this->recordTransferCancellation($reference, $stockId, $cancelQuantity, $userId);
                        DB::table('loctransfers')
                            ->where('reference', $reference)
                            ->where('stockid', $stockId)
                            ->update([
                                'shipqty' => DB::raw('recqty'),
                                'recdate' => $receivedDateTime,
                            ]);
                    }

                    if ($quantity > 0 || $cancelQuantity > 0) {
                        $postedLines[] = [
                            'stockId' => $stockId,
                            'receivedQuantity' => $quantity,
                            'cancelledQuantity' => $cancelQuantity,
                        ];
                    }
                }

                return [
                    'reference' => $reference,
                    'receivedAt' => $receivedAt,
                    'lineCount' => count($postedLines),
                    'totalQuantity' => array_sum(array_column($postedLines, 'receivedQuantity')),
                    'lines' => $postedLines,
                ];
            });

            return response()->json([
                'success' => true,
                'message' => 'Transfer received.',
                'transfer' => $posted,
                'data' => [
                    'pendingTransfers' => $this->pendingTransfers(),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Transfer could not be received.',
            ], 500);
        }
    }

    public function update(Request $request, $reference)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory transfers are not available.',
            ], 503);
        }

        $reference = (int) $reference;
        $existingRows = DB::table('loctransfers')->where('reference', $reference)->get();

        if ($existingRows->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Transfer shipment was not found.',
            ], 404);
        }

        if ((float) $existingRows->sum('recqty') > 0) {
            return $this->validationError('Part received transfers cannot be edited.');
        }

        $fromLocation = strtoupper(trim((string) $request->input('fromLocation', '')));
        $toLocation = strtoupper(trim((string) $request->input('toLocation', '')));
        $rawLines = $request->input('lines', []);

        if ($fromLocation === '' || $toLocation === '') {
            return $this->validationError('Choose both the sending and receiving locations.');
        }

        if ($fromLocation === $toLocation) {
            return $this->validationError('Sending and receiving locations must be different.');
        }

        if (!$this->locationExists($fromLocation) || !$this->locationExists($toLocation)) {
            return $this->validationError('One of the selected locations is no longer available.');
        }

        if (!is_array($rawLines) || count($rawLines) === 0) {
            return $this->validationError('Add at least one item to transfer.');
        }

        $lines = $this->normaliseLines($rawLines);
        if (count($lines) === 0) {
            return $this->validationError('Add at least one item with a quantity greater than zero.');
        }

        $stockIds = array_keys($lines);
        $items = DB::table('stockmaster')
            ->whereIn('stockid', $stockIds)
            ->get()
            ->keyBy('stockid');

        foreach ($stockIds as $stockId) {
            if (!$items->has($stockId)) {
                return $this->validationError("Item {$stockId} is not available for transfer.");
            }

            $item = $items[$stockId];
            if (in_array(strtoupper((string) $item->mbflag), ['D', 'A', 'K'], true)) {
                return $this->validationError("Item {$stockId} is not a stock-held item.");
            }
        }

        if ($this->prohibitNegativeStock()) {
            $availability = $this->availabilityForLocation($fromLocation, $stockIds);
            $currentlyReserved = $existingRows
                ->where('shiploc', $fromLocation)
                ->groupBy('stockid')
                ->map(function ($rows) {
                    return (float) $rows->sum('shipqty');
                });

            foreach ($lines as $stockId => $quantity) {
                $available = (float) ($availability[$stockId]['available'] ?? 0.0) + (float) ($currentlyReserved[$stockId] ?? 0.0);
                if ($quantity > $available) {
                    return $this->validationError("{$stockId} has only " . $this->formatQuantity($available) . ' available at the sending location.');
                }
            }
        }

        try {
            $updated = DB::transaction(function () use ($reference, $fromLocation, $toLocation, $lines, $items, $existingRows) {
                $shipDate = (string) ($existingRows->first()->shipdate ?? Carbon::now()->format('Y-m-d H:i:s'));

                DB::table('loctransfers')->where('reference', $reference)->delete();

                foreach ($lines as $stockId => $quantity) {
                    $decimalPlaces = (int) ($items[$stockId]->decimalplaces ?? 0);
                    DB::table('loctransfers')->insert([
                        'reference' => $reference,
                        'stockid' => $stockId,
                        'shipqty' => round($quantity, $decimalPlaces),
                        'recqty' => 0,
                        'shipdate' => $shipDate,
                        'recdate' => '1000-01-01 00:00:00',
                        'shiploc' => $fromLocation,
                        'recloc' => $toLocation,
                    ]);
                }

                return [
                    'reference' => $reference,
                    'fromLocation' => $fromLocation,
                    'toLocation' => $toLocation,
                    'lineCount' => count($lines),
                    'totalQuantity' => array_sum($lines),
                    'shipDate' => $this->dateOnly($shipDate),
                ];
            });

            return response()->json([
                'success' => true,
                'message' => 'Transfer shipment updated.',
                'transfer' => $updated,
                'data' => [
                    'nextReference' => $this->nextReference(),
                    'pendingTransfers' => $this->pendingTransfers(),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Transfer shipment could not be updated.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('locations')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locstock')
            && Schema::hasTable('loctransfers');
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

    private function items()
    {
        $rows = $this->itemsQuery()->limit(1500)->get();
        $stockIds = $rows->pluck('stockid')->map(function ($value) {
            return (string) $value;
        })->all();
        $latestCosts = $this->latestItemCosts($stockIds);

        return $rows->map(function ($row) use ($latestCosts) {
            return $this->itemPayload($row, $latestCosts);
        });
    }

    private function itemsQuery(string $search = '', string $fromLocation = '')
    {
        $query = DB::table('stockmaster as sm')
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
                'sm.categoryid'
            )
            ->where('sm.discontinued', 0)
            ->whereNotIn('sm.mbflag', ['D', 'A', 'K']);

        if ($fromLocation !== '') {
            $query
                ->join('locstock as source_stock', function ($join) use ($fromLocation) {
                    $join
                        ->on('source_stock.stockid', '=', 'sm.stockid')
                        ->where('source_stock.loccode', '=', $fromLocation);
                })
                ->where('source_stock.quantity', '>', 0)
                ->orderByDesc('source_stock.quantity')
                ->orderBy('sm.stockid');
        } else {
            $query->orderBy('sm.stockid');
        }

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

        return $query;
    }

    private function itemPayload(object $row, array $latestCosts = []): array
    {
        $stockId = (string) $row->stockid;
        $description = html_entity_decode((string) ($row->description ?: $row->longdescription ?: $stockId));
        $standardCost = (float) ($row->materialcost ?? 0) + (float) ($row->labourcost ?? 0) + (float) ($row->overheadcost ?? 0);
        $unitCost = $standardCost > 0
            ? $standardCost
            : (float) ($row->actualcost ?: $row->lastcost ?: 0);
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

    private function balancesByItem(array $stockIds): array
    {
        if (count($stockIds) === 0) {
            return [];
        }

        $balances = [];
        $outgoing = $this->outgoingByLocation($stockIds);

        DB::table('locstock')
            ->whereIn('stockid', $stockIds)
            ->select('stockid', 'loccode', 'quantity', 'reorderlevel', 'bin')
            ->orderBy('stockid')
            ->get()
            ->each(function ($row) use (&$balances, $outgoing) {
                $stockId = (string) $row->stockid;
                $location = (string) $row->loccode;
                $onHand = (float) $row->quantity;
                $inTransit = (float) ($outgoing[$stockId][$location] ?? 0);

                $balances[$stockId][$location] = [
                    'onHand' => $onHand,
                    'inTransit' => $inTransit,
                    'available' => $onHand - $inTransit,
                    'reorderLevel' => (float) $row->reorderlevel,
                    'bin' => (string) ($row->bin ?? ''),
                ];
            });

        return $balances;
    }

    private function outgoingByLocation(array $stockIds): array
    {
        $outgoing = [];

        DB::table('loctransfers')
            ->whereIn('stockid', $stockIds)
            ->whereColumn('shipqty', '>', 'recqty')
            ->select('stockid', 'shiploc', DB::raw('SUM(shipqty - recqty) as quantity'))
            ->groupBy('stockid', 'shiploc')
            ->get()
            ->each(function ($row) use (&$outgoing) {
                $outgoing[(string) $row->stockid][(string) $row->shiploc] = (float) $row->quantity;
            });

        return $outgoing;
    }

    private function availabilityForLocation(string $location, array $stockIds): array
    {
        $balances = $this->balancesByItem($stockIds);
        $availability = [];

        foreach ($stockIds as $stockId) {
            $availability[$stockId] = $balances[$stockId][$location] ?? [
                'onHand' => 0.0,
                'inTransit' => 0.0,
                'available' => 0.0,
                'reorderLevel' => 0.0,
                'bin' => '',
            ];
        }

        return $availability;
    }

    private function latestItemCosts(array $stockIds): array
    {
        $costs = $this->latestStockMoveCosts($stockIds);
        $missingStockIds = array_values(array_filter($stockIds, function ($stockId) use ($costs) {
            return !isset($costs[$stockId]) || (float) $costs[$stockId] <= 0;
        }));

        foreach ($this->latestPurchaseCosts($missingStockIds) as $stockId => $cost) {
            if (!isset($costs[$stockId]) || (float) $costs[$stockId] <= 0) {
                $costs[$stockId] = $cost;
            }
        }

        return $costs;
    }

    private function latestStockMoveCosts(array $stockIds): array
    {
        if (count($stockIds) === 0 || !Schema::hasTable('stockmoves') || !Schema::hasColumn('stockmoves', 'stockid')) {
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
        if (count($stockIds) === 0 || !Schema::hasTable('purchorderdetails') || !Schema::hasColumn('purchorderdetails', 'itemcode')) {
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

    private function postingCost(object $row): float
    {
        $standardCost = (float) ($row->materialcost ?? 0) + (float) ($row->labourcost ?? 0) + (float) ($row->overheadcost ?? 0);
        if ($standardCost > 0) {
            return $standardCost;
        }

        $fallback = $this->latestItemCosts([(string) $row->stockid]);
        return (float) ($fallback[(string) $row->stockid] ?? (float) ($row->actualcost ?: $row->lastcost ?: 0));
    }

    private function locationStockQuantity(string $location, string $stockId): float
    {
        return (float) (DB::table('locstock')
            ->where('loccode', $location)
            ->where('stockid', $stockId)
            ->value('quantity') ?? 0);
    }

    private function insertStockMove(array $values): void
    {
        if (!Schema::hasTable('stockmoves')) {
            return;
        }

        $columns = Schema::getColumnListing('stockmoves');
        $insert = [];
        foreach ($values as $column => $value) {
            if (in_array($column, $columns, true)) {
                $insert[$column] = $value;
            }
        }

        DB::table('stockmoves')->insert($insert);
    }

    private function adjustLocationStock(string $location, string $stockId, float $quantity, int $decimalPlaces): void
    {
        $affected = DB::table('locstock')
            ->where('loccode', $location)
            ->where('stockid', $stockId)
            ->update([
                'quantity' => DB::raw('quantity + ' . round($quantity, $decimalPlaces)),
            ]);

        if ($affected === 0) {
            DB::table('locstock')->insert([
                'loccode' => $location,
                'stockid' => $stockId,
                'quantity' => round($quantity, $decimalPlaces),
            ]);
        }
    }

    private function postTransferGl(object $row, float $quantity, float $standardCost, int $periodNo, string $receivedAt, int $reference): void
    {
        if (!Schema::hasTable('gltrans') || $quantity <= 0 || $standardCost <= 0) {
            return;
        }

        $fromAccount = trim((string) ($row->from_gl_account ?? ''));
        $toAccount = trim((string) ($row->to_gl_account ?? ''));
        if ($fromAccount === '' && $toAccount === '') {
            return;
        }

        $stockAccount = $this->stockAccount((string) $row->stockid);
        $this->insertGlTrans([
            'periodno' => $periodNo,
            'trandate' => $receivedAt,
            'type' => 16,
            'typeno' => $reference,
            'account' => $fromAccount !== '' ? $fromAccount : $stockAccount,
            'narrative' => (string) $row->shiploc . ' - ' . (string) $row->stockid . ' x ' . $this->formatQuantity($quantity) . ' @ ' . $this->formatQuantity($standardCost),
            'amount' => -$quantity * $standardCost,
        ]);

        $this->insertGlTrans([
            'periodno' => $periodNo,
            'trandate' => $receivedAt,
            'type' => 16,
            'typeno' => $reference,
            'account' => $toAccount !== '' ? $toAccount : $stockAccount,
            'narrative' => (string) $row->recloc . ' - ' . (string) $row->stockid . ' x ' . $this->formatQuantity($quantity) . ' @ ' . $this->formatQuantity($standardCost),
            'amount' => $quantity * $standardCost,
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

    private function stockAccount(string $stockId): string
    {
        if (!Schema::hasTable('stockcategory')) {
            return '';
        }

        return (string) (DB::table('stockmaster as sm')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->where('sm.stockid', $stockId)
            ->value('sc.stockact') ?? '');
    }

    private function recordTransferCancellation(int $reference, string $stockId, float $cancelQuantity, string $userId): void
    {
        if ($cancelQuantity <= 0 || !Schema::hasTable('loctransfercancellations')) {
            return;
        }

        DB::table('loctransfercancellations')->insert([
            'reference' => $reference,
            'stockid' => $stockId,
            'cancelqty' => $cancelQuantity,
            'canceldate' => Carbon::now()->format('Y-m-d H:i:s'),
            'canceluserid' => $userId,
        ]);
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

    private function emptyBalance(): array
    {
        return [
            'onHand' => 0.0,
            'inTransit' => 0.0,
            'available' => 0.0,
            'reorderLevel' => 0.0,
            'bin' => '',
        ];
    }

    private function pendingTransfers(?string $receivingLocation = null)
    {
        $query = DB::table('loctransfers as lt')
            ->leftJoin('locations as fromloc', 'fromloc.loccode', '=', 'lt.shiploc')
            ->leftJoin('locations as toloc', 'toloc.loccode', '=', 'lt.recloc')
            ->whereColumn('lt.shipqty', '>', 'lt.recqty')
            ->select(
                'lt.reference',
                'lt.shiploc',
                'lt.recloc',
                DB::raw('COALESCE(NULLIF(fromloc.locationname, ""), lt.shiploc) as from_name'),
                DB::raw('COALESCE(NULLIF(toloc.locationname, ""), lt.recloc) as to_name'),
                DB::raw('MIN(lt.shipdate) as ship_date'),
                DB::raw('COUNT(DISTINCT lt.stockid) as item_count'),
                DB::raw('SUM(lt.shipqty) as ship_qty'),
                DB::raw('SUM(lt.recqty) as received_qty'),
                DB::raw('SUM(lt.shipqty - lt.recqty) as outstanding_qty')
            )
            ->groupBy('lt.reference', 'lt.shiploc', 'lt.recloc', 'fromloc.locationname', 'toloc.locationname')
            ->orderByDesc('lt.reference')
            ->limit(100);

        if ($receivingLocation !== null && $receivingLocation !== '') {
            $query->where('lt.recloc', $receivingLocation);
        }

        return $query->get()
            ->map(function ($row) {
                return [
                    'reference' => (int) $row->reference,
                    'fromLocation' => (string) $row->shiploc,
                    'fromLocationName' => html_entity_decode((string) $row->from_name),
                    'toLocation' => (string) $row->recloc,
                    'toLocationName' => html_entity_decode((string) $row->to_name),
                    'shipDate' => $this->dateOnly((string) $row->ship_date),
                    'itemCount' => (int) $row->item_count,
                    'shipQuantity' => (float) $row->ship_qty,
                    'receivedQuantity' => (float) $row->received_qty,
                    'outstandingQuantity' => (float) $row->outstanding_qty,
                    'status' => ((float) $row->received_qty) > 0 ? 'Part received' : 'Sent',
                ];
            })
            ->values();
    }

    private function transferDetail(int $reference): ?array
    {
        $query = DB::table('loctransfers as lt')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'lt.stockid')
            ->leftJoin('locations as fromloc', 'fromloc.loccode', '=', 'lt.shiploc')
            ->leftJoin('locations as toloc', 'toloc.loccode', '=', 'lt.recloc')
            ->where('lt.reference', $reference)
            ->select(
                'lt.reference',
                'lt.stockid',
                'lt.shipqty',
                'lt.recqty',
                'lt.shipdate',
                'lt.shiploc',
                'lt.recloc',
                DB::raw('COALESCE(NULLIF(fromloc.locationname, ""), lt.shiploc) as from_name'),
                DB::raw('COALESCE(NULLIF(toloc.locationname, ""), lt.recloc) as to_name'),
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
                'sm.categoryid'
            )
            ->orderBy('lt.stockid');

        if (Schema::hasTable('stockcategory')) {
            $query
                ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
                ->addSelect(DB::raw('COALESCE(NULLIF(sc.categorydescription, ""), sm.categoryid) as category_name'));
        } else {
            $query->addSelect(DB::raw('sm.categoryid as category_name'));
        }

        $rows = $query->get();
        if ($rows->isEmpty()) {
            return null;
        }

        $first = $rows->first();
        $stockIds = $rows->pluck('stockid')->map(function ($value) {
            return (string) $value;
        })->all();
        $balances = $this->availabilityForLocation((string) $first->shiploc, $stockIds);
        $latestCosts = $this->latestItemCosts($stockIds);
        $receivedQuantity = (float) $rows->sum('recqty');
        $shipQuantity = (float) $rows->sum('shipqty');

        return [
            'reference' => (int) $first->reference,
            'fromLocation' => (string) $first->shiploc,
            'fromLocationName' => html_entity_decode((string) $first->from_name),
            'toLocation' => (string) $first->recloc,
            'toLocationName' => html_entity_decode((string) $first->to_name),
            'shipDate' => $this->dateOnly((string) $first->shipdate),
            'itemCount' => $rows->count(),
            'shipQuantity' => $shipQuantity,
            'receivedQuantity' => $receivedQuantity,
            'outstandingQuantity' => max(0.0, $shipQuantity - $receivedQuantity),
            'status' => $receivedQuantity > 0 ? 'Part received' : 'Sent',
            'lines' => $rows->map(function ($row) use ($balances, $latestCosts) {
                $item = $this->itemPayload($row, $latestCosts);
                $balance = $balances[$item['stockId']] ?? $this->emptyBalance();
                $balance['available'] = (float) ($balance['available'] ?? 0.0) + max(0.0, (float) $row->shipqty - (float) $row->recqty);

                $item['balance'] = $balance;
                $item['quantity'] = (float) $row->shipqty;
                $item['receivedQuantity'] = (float) $row->recqty;

                return $item;
            })->values(),
        ];
    }

    private function transferRowsForPosting(int $reference)
    {
        $query = DB::table('loctransfers as lt')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'lt.stockid')
            ->leftJoin('locations as fromloc', 'fromloc.loccode', '=', 'lt.shiploc')
            ->leftJoin('locations as toloc', 'toloc.loccode', '=', 'lt.recloc')
            ->where('lt.reference', $reference)
            ->whereColumn('lt.shipqty', '>', 'lt.recqty')
            ->select(
                'lt.reference',
                'lt.stockid',
                'lt.shipqty',
                'lt.recqty',
                'lt.shiploc',
                'lt.recloc',
                DB::raw('COALESCE(NULLIF(fromloc.locationname, ""), lt.shiploc) as from_name'),
                DB::raw('COALESCE(NULLIF(toloc.locationname, ""), lt.recloc) as to_name'),
                'fromloc.glaccountcode as from_gl_account',
                'toloc.glaccountcode as to_gl_account',
                'sm.description',
                'sm.units',
                'sm.decimalplaces',
                'sm.controlled',
                'sm.serialised',
                'sm.materialcost',
                'sm.labourcost',
                'sm.overheadcost',
                'sm.actualcost',
                'sm.lastcost'
            )
            ->orderBy('lt.stockid');

        return $query->get();
    }

    private function companyProfile(): array
    {
        $company = Schema::hasTable('companies')
            ? DB::table('companies')->where('coycode', 1)->first()
            : null;

        return [
            'name' => html_entity_decode((string) ($company->coyname ?? 'Akiva')),
            'currency' => (string) ($company->currencydefault ?? 'TZS'),
            'logo' => $this->companyLogoDataUri(),
            'address' => array_values(array_filter([
                (string) ($company->regoffice1 ?? ''),
                (string) ($company->regoffice2 ?? ''),
                (string) ($company->regoffice3 ?? ''),
                (string) ($company->regoffice4 ?? ''),
                (string) ($company->regoffice5 ?? ''),
                (string) ($company->regoffice6 ?? ''),
            ])),
            'phone' => (string) ($company->telephone ?? ''),
            'email' => (string) ($company->email ?? ''),
        ];
    }

    private function companyLogoDataUri(): string
    {
        $database = (string) config('database.connections.mysql.database', '');
        $candidates = [];

        if ($database !== '') {
            $candidates[] = base_path('../weberp_updated/companies/' . $database . '/logo.png');
            $candidates[] = base_path('../weberp_updated/companies/' . $database . '/logo.jpg');
            $candidates[] = base_path('../weberp_updated/companies/' . $database . '/logo.jpeg');
        }

        $candidates[] = base_path('../public/icons/akiva-icon.svg');

        foreach ($candidates as $path) {
            if (!is_file($path)) {
                continue;
            }

            $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
            $mime = $extension === 'svg' ? 'image/svg+xml' : ($extension === 'jpg' || $extension === 'jpeg' ? 'image/jpeg' : 'image/png');

            return 'data:' . $mime . ';base64,' . base64_encode((string) file_get_contents($path));
        }

        return '';
    }

    private function transferPrintHtml(array $transfer, array $company): string
    {
        $rows = '';
        $totalValue = 0.0;
        foreach ($transfer['lines'] as $index => $line) {
            $quantity = (float) ($line['quantity'] ?? 0);
            $received = (float) ($line['receivedQuantity'] ?? 0);
            $outstanding = max(0.0, $quantity - $received);
            $unitCost = (float) ($line['unitCost'] ?? 0);
            $lineValue = $quantity * $unitCost;
            $totalValue += $lineValue;
            $rows .= '<tr>'
                . '<td class="center">' . ($index + 1) . '</td>'
                . '<td><strong>' . $this->html($line['stockId'] ?? '') . '</strong><br><span>' . $this->html($line['category'] ?? '') . '</span></td>'
                . '<td>' . $this->html($line['description'] ?? '') . '</td>'
                . '<td class="right">' . $this->html($this->formatQuantity($quantity)) . '</td>'
                . '<td class="right">' . $this->html($this->formatQuantity($received)) . '</td>'
                . '<td class="right">' . $this->html($this->formatQuantity($outstanding)) . '</td>'
                . '<td>' . $this->html($line['units'] ?? '') . '</td>'
                . '<td class="right">' . $this->html($this->formatMoney($unitCost, (string) ($company['currency'] ?? 'TZS'))) . '</td>'
                . '<td class="right">' . $this->html($this->formatMoney($lineValue, (string) ($company['currency'] ?? 'TZS'))) . '</td>'
                . '</tr>';
        }

        $address = '';
        foreach ($company['address'] as $line) {
            $address .= '<div>' . $this->html($line) . '</div>';
        }

        $printedAt = Carbon::now()->format('d M Y, H:i');
        $sentDate = $this->displayDate((string) ($transfer['shipDate'] ?? ''));

        return '<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 26px 28px 40px; }
    body { color: #211019; font-family: DejaVu Sans, sans-serif; font-size: 13px; line-height: 1.5; }
    .top { background: #fff8fb; border: 1px solid #eadbe3; border-radius: 14px; padding: 14px 16px; }
    .brand-table { border-collapse: collapse; width: 100%; }
    .brand-table td { vertical-align: top; }
    .logo-cell { width: 78px; }
    .logo { max-height: 58px; max-width: 68px; object-fit: contain; }
    .company { color: #211019; font-size: 21px; font-weight: 700; margin-bottom: 5px; }
    .muted { color: #7b6170; }
    .doc-panel { background: #ffffff; border: 1px solid #eadbe3; border-radius: 12px; padding: 12px 14px; text-align: right; width: 250px; }
    .doc-title { color: #26364a; font-size: 24px; font-weight: 700; margin-bottom: 6px; }
    .reference { color: #d81b72; font-size: 15px; font-weight: 700; }
    .meta { margin-top: 14px; width: 100%; border-collapse: collapse; }
    .meta td { border: 1px solid #eadbe3; padding: 10px 12px; vertical-align: top; width: 33.33%; }
    .label { color: #856776; display: block; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .value { color: #211019; display: block; font-size: 14px; font-weight: 700; margin-top: 4px; }
    table.lines { border-collapse: collapse; margin-top: 18px; width: 100%; }
    .lines th { background: #f8edf3; border: 1px solid #eadbe3; color: #856776; font-size: 11px; letter-spacing: .04em; padding: 9px 8px; text-align: left; text-transform: uppercase; }
    .lines td { border: 1px solid #eadbe3; padding: 8px 7px; vertical-align: top; }
    .lines tbody tr:nth-child(even) td { background: #fff8fb; }
    .lines span { color: #856776; font-size: 11px; }
    .right { text-align: right; }
    .center { text-align: center; }
    .summary { margin-top: 12px; text-align: right; }
    .summary strong { color: #211019; font-size: 14px; }
    .notes { background: #fff8fb; border: 1px solid #eadbe3; border-radius: 8px; margin-top: 16px; padding: 10px 12px; }
    .signatures { margin-top: 28px; width: 100%; border-collapse: collapse; }
    .signatures td { padding: 0 14px 16px 0; width: 33.33%; }
    .line { border-top: 1px solid #7b6170; color: #7b6170; font-size: 11px; padding-top: 8px; text-transform: uppercase; }
    .footer { bottom: -24px; color: #9a8290; font-size: 11px; left: 0; position: fixed; right: 0; text-align: center; }
  </style>
</head>
<body>
  <div class="top">
    <table class="brand-table">
      <tr>
        <td class="logo-cell">' . ($company['logo'] ? '<img class="logo" src="' . $this->html($company['logo']) . '" alt="Logo">' : '') . '</td>
        <td>
          <div class="company">' . $this->html($company['name']) . '</div>
          <div class="muted">' . $address . '</div>
          <div class="muted">' . $this->html($company['phone']) . ($company['phone'] && $company['email'] ? ' · ' : '') . $this->html($company['email']) . '</div>
        </td>
        <td class="doc-panel">
          <div class="doc-title">Inventory Transfer</div>
          <div class="reference">Transfer #' . $this->html($transfer['reference'] ?? '') . '</div>
          <div class="muted">Printed ' . $this->html($printedAt) . '</div>
          <div class="muted">' . $this->html($transfer['status'] ?? '') . '</div>
        </td>
      </tr>
    </table>
  </div>

  <table class="meta">
    <tr>
      <td><span class="label">From location</span><span class="value">' . $this->html($transfer['fromLocationName'] ?? '') . '</span><span class="muted">' . $this->html($transfer['fromLocation'] ?? '') . '</span></td>
      <td><span class="label">To location</span><span class="value">' . $this->html($transfer['toLocationName'] ?? '') . '</span><span class="muted">' . $this->html($transfer['toLocation'] ?? '') . '</span></td>
      <td><span class="label">Status</span><span class="value">' . $this->html($transfer['status'] ?? '') . '</span><span class="muted">Sent ' . $this->html($sentDate) . '</span></td>
    </tr>
    <tr>
      <td><span class="label">Items</span><span class="value">' . $this->html($transfer['itemCount'] ?? 0) . '</span></td>
      <td><span class="label">Quantity sent</span><span class="value">' . $this->html($this->formatQuantity((float) ($transfer['shipQuantity'] ?? 0))) . '</span></td>
      <td><span class="label">Outstanding</span><span class="value">' . $this->html($this->formatQuantity((float) ($transfer['outstandingQuantity'] ?? 0))) . '</span></td>
    </tr>
  </table>

  <table class="lines">
    <thead>
      <tr>
        <th class="center" style="width: 34px;">#</th>
        <th style="width: 115px;">Item</th>
        <th>Description</th>
        <th class="right" style="width: 74px;">Sent</th>
        <th class="right" style="width: 74px;">Received</th>
        <th class="right" style="width: 82px;">Open</th>
        <th style="width: 62px;">Unit</th>
        <th class="right" style="width: 84px;">Unit cost</th>
        <th class="right" style="width: 92px;">Total cost</th>
      </tr>
    </thead>
    <tbody>' . $rows . '</tbody>
  </table>

  <div class="summary">
    Total open quantity: <strong>' . $this->html($this->formatQuantity((float) ($transfer['outstandingQuantity'] ?? 0))) . '</strong>
    &nbsp;&nbsp; Total value of goods: <strong>' . $this->html($this->formatMoney($totalValue, (string) ($company['currency'] ?? 'TZS'))) . '</strong>
  </div>

  <div class="notes">
    Confirm item quantities before dispatch. Receiving should be posted only after the goods arrive at the destination location.
  </div>

  <table class="signatures">
    <tr>
      <td><div class="line">Issued by: Name</div></td>
      <td><div class="line">Issued by: Signature</div></td>
      <td><div class="line">Received by: Name</div></td>
    </tr>
    <tr>
      <td><div class="line">Received by: Signature</div></td>
      <td><div class="line">Checked by</div></td>
      <td><div class="line">Checked by: Signature</div></td>
    </tr>
  </table>

  <div class="footer">Printed ' . $this->html($printedAt) . ' · Inventory Transfer #' . $this->html($transfer['reference'] ?? '') . '</div>
</body>
</html>';
    }

    private function normaliseLines(array $rawLines): array
    {
        $lines = [];

        foreach ($rawLines as $line) {
            if (!is_array($line)) {
                continue;
            }

            $stockId = strtoupper(trim((string) ($line['stockId'] ?? '')));
            $quantity = $this->numberValue($line['quantity'] ?? 0);

            if ($stockId === '' || $quantity <= 0) {
                continue;
            }

            $lines[$stockId] = ($lines[$stockId] ?? 0) + $quantity;
        }

        return $lines;
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

    private function nextReference(): int
    {
        $maxReference = (int) DB::table('loctransfers')->max('reference');
        $typeNo = Schema::hasTable('systypes')
            ? (int) (DB::table('systypes')->where('typeid', 16)->value('typeno') ?? 0)
            : 0;

        return max($maxReference, $typeNo) + 1;
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
        return response()->json([
            'success' => false,
            'message' => $message,
        ], 422);
    }

    private function numberValue($value): float
    {
        if (is_numeric($value)) {
            return (float) $value;
        }

        return (float) str_replace(',', '', (string) $value);
    }

    private function formatQuantity(float $value): string
    {
        return rtrim(rtrim(number_format($value, 4, '.', ','), '0'), '.');
    }

    private function formatMoney(float $value, string $currency): string
    {
        return strtoupper($currency) . ' ' . number_format($value, 2, '.', ',');
    }

    private function safeLimit($value, int $min, int $max): int
    {
        $limit = (int) $value;
        if ($limit < $min) return $min;
        if ($limit > $max) return $max;
        return $limit;
    }

    private function html($value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }

    private function displayDate(string $value): string
    {
        try {
            if ($value === '') {
                return '';
            }

            return Carbon::parse($value)->format('d M Y');
        } catch (\Throwable $e) {
            return $value;
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
