<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReverseGrnController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'suppliers' => [],
                    'locations' => [],
                    'reversibleGrns' => [],
                    'currency' => $this->currency(),
                    'settings' => ['stockLedgerLinked' => $this->stockLedgerLinked()],
                ],
            ]);
        }

        try {
            $supplier = trim((string) $request->query('supplier', ''));
            $location = strtoupper(trim((string) $request->query('location', '')));
            $search = trim((string) $request->query('q', ''));
            $fromDate = trim((string) $request->query('fromDate', ''));
            $fromDate = $fromDate !== '' ? $this->dateOnly($fromDate) : '';

            return response()->json([
                'success' => true,
                'data' => [
                    'suppliers' => $this->suppliers(),
                    'locations' => $this->locations(),
                    'reversibleGrns' => $this->reversibleGrns($supplier, $location, $search, $fromDate),
                    'currency' => $this->currency(),
                    'settings' => ['stockLedgerLinked' => $this->stockLedgerLinked()],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Goods received reversals could not be loaded.',
            ], 500);
        }
    }

    public function reverse(Request $request, $grnNo)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Goods received reversals are not available.',
            ], 503);
        }

        $grnNo = (int) $grnNo;
        $reason = trim((string) $request->input('reason', ''));
        if ($reason === '') {
            return $this->validationError('Enter the reason for reversing this goods receipt.');
        }

        $grn = $this->grnForPosting($grnNo);
        if ($grn === null) {
            return response()->json([
                'success' => false,
                'message' => 'The selected goods receipt was not found.',
            ], 404);
        }

        $quantityToReverse = round((float) $grn->qtyrecd - (float) $grn->quantityinv, 6);
        if ($quantityToReverse <= 0) {
            return $this->validationError('This goods receipt has already been invoiced or reversed.');
        }

        $stockItem = $this->stockItem((string) $grn->itemcode);
        if ($stockItem !== null) {
            $onHand = $this->locationStockQuantity((string) $grn->intostocklocation, (string) $grn->itemcode);
            if ($onHand < $quantityToReverse) {
                return $this->validationError('The receiving location no longer has enough stock to reverse this receipt.');
            }

            if ((bool) ($stockItem->controlled ?? false)) {
                $controlledCheck = $this->controlledItemsAvailable($grn, $quantityToReverse);
                if (!$controlledCheck['available']) {
                    return $this->validationError($controlledCheck['message']);
                }
            }
        }

        try {
            $posted = DB::transaction(function () use ($request, $grn, $grnNo, $quantityToReverse, $reason, $stockItem) {
                $deliveryDate = $this->dateOnly((string) $grn->deliverydate);
                $periodNo = $this->periodForDate($deliveryDate);
                $userId = $this->postingUser($request);
                $location = (string) $grn->intostocklocation;
                $stockId = (string) $grn->itemcode;
                $cost = $this->postingCost($grn);

                DB::table('purchorderdetails')
                    ->where('podetailitem', (int) $grn->podetailitem)
                    ->update([
                        'quantityrecd' => DB::raw('quantityrecd - ' . $quantityToReverse),
                        'completed' => 0,
                    ]);

                $this->updatePurchaseOrderStatus($grn, $reason);
                $this->updateGrnRecord($grnNo, (float) $grn->qtyrecd, $quantityToReverse);
                $this->reverseFixedAsset($grn, $quantityToReverse, $cost, $periodNo, $deliveryDate);

                if ($stockItem !== null) {
                    $decimalPlaces = (int) ($stockItem->decimalplaces ?? 0);
                    $onHandBefore = $this->locationStockQuantity($location, $stockId);
                    $this->adjustLocationStock($location, $stockId, -$quantityToReverse, $decimalPlaces);
                    $stockMoveNo = $this->insertStockMove([
                        'stockid' => $stockId,
                        'type' => 25,
                        'transno' => $grnNo,
                        'loccode' => $location,
                        'trandate' => $deliveryDate,
                        'userid' => $userId,
                        'prd' => $periodNo,
                        'reference' => 'Reversal - ' . (string) $grn->supplierid . ' - PO ' . (string) $this->purchaseOrderNumber($grn),
                        'qty' => -$quantityToReverse,
                        'standardcost' => $cost,
                        'newqoh' => $onHandBefore - $quantityToReverse,
                    ]);

                    if ((bool) ($stockItem->controlled ?? false)) {
                        $this->reverseControlledItems($grn, $stockMoveNo);
                    }
                }

                $this->postReversalGl($grn, $quantityToReverse, $cost, $periodNo, $deliveryDate, $grnNo);

                return [
                    'grnNo' => $grnNo,
                    'batch' => (int) $grn->grnbatch,
                    'purchaseOrder' => $this->purchaseOrderNumber($grn),
                    'supplierCode' => (string) $grn->supplierid,
                    'supplierName' => html_entity_decode((string) $grn->supplier_name),
                    'stockId' => $stockId,
                    'description' => html_entity_decode((string) $grn->itemdescription),
                    'quantityReversed' => $quantityToReverse,
                    'unitCost' => $cost,
                    'value' => $quantityToReverse * $cost,
                    'date' => $deliveryDate,
                    'reason' => $reason,
                ];
            });

            return response()->json([
                'success' => true,
                'message' => 'Goods receipt reversed.',
                'reversal' => $posted,
                'data' => [
                    'reversibleGrns' => $this->reversibleGrns(),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Goods receipt could not be reversed.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('grns')
            && Schema::hasTable('purchorderdetails')
            && Schema::hasTable('purchorders');
    }

    private function reversibleGrns(string $supplier = '', string $location = '', string $search = '', string $fromDate = '')
    {
        $query = DB::table('grns as g')
            ->join('purchorderdetails as pod', 'pod.podetailitem', '=', 'g.podetailitem')
            ->join('purchorders as po', 'po.orderno', '=', 'pod.orderno')
            ->leftJoin('suppliers as s', 's.supplierid', '=', 'g.supplierid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'po.intostocklocation')
            ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'g.itemcode')
            ->whereRaw('(g.qtyrecd - g.quantityinv) > 0')
            ->select(
                'g.grnno',
                'g.grnbatch',
                'po.orderno',
                'g.podetailitem',
                'g.itemcode',
                'g.itemdescription',
                'g.deliverydate',
                'g.supplierid',
                'g.supplierref',
                'g.qtyrecd',
                'g.quantityinv',
                DB::raw('(g.qtyrecd - g.quantityinv) as quantity_to_reverse'),
                DB::raw('COALESCE(NULLIF(g.stdcostunit, 0), NULLIF(pod.stdcostunit, 0), NULLIF(pod.unitprice, 0), 0) as unit_cost'),
                'pod.orderno as po_orderno',
                'pod.glcode',
                'pod.assetid',
                'po.intostocklocation',
                DB::raw('COALESCE(NULLIF(s.suppname, ""), g.supplierid) as supplier_name'),
                DB::raw('COALESCE(NULLIF(s.currcode, ""), "TZS") as currency_code'),
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), po.intostocklocation) as location_name'),
                DB::raw('COALESCE(sm.controlled, 0) as controlled_item'),
                DB::raw('COALESCE(sm.serialised, 0) as serialised_item'),
                DB::raw('COALESCE(sm.units, pod.uom, "each") as units'),
                DB::raw('COALESCE(sm.decimalplaces, 0) as decimalplaces')
            );

        if ($fromDate !== '') {
            $query->where('g.deliverydate', '>=', $fromDate);
        }

        if ($supplier !== '' && $supplier !== 'All') {
            $query->where('g.supplierid', $supplier);
        }

        if ($location !== '' && $location !== 'All') {
            $query->where('po.intostocklocation', $location);
        }

        if ($search !== '') {
            $query->where(function ($inner) use ($search) {
                $inner
                    ->where('g.grnno', 'like', "%{$search}%")
                    ->orWhere('g.grnbatch', 'like', "%{$search}%")
                    ->orWhere('po.orderno', 'like', "%{$search}%")
                    ->orWhere('g.itemcode', 'like', "%{$search}%")
                    ->orWhere('g.itemdescription', 'like', "%{$search}%")
                    ->orWhere('s.suppname', 'like', "%{$search}%")
                    ->orWhere('g.supplierref', 'like', "%{$search}%");
            });
        }

        return $query
            ->orderByDesc('g.deliverydate')
            ->orderByDesc('g.grnno')
            ->limit(200)
            ->get()
            ->map(function ($row) {
                $quantityToReverse = (float) $row->quantity_to_reverse;
                $unitCost = (float) $row->unit_cost;
                return [
                    'grnNo' => (int) $row->grnno,
                    'batch' => (int) $row->grnbatch,
                    'purchaseOrder' => (int) $row->orderno,
                    'podetailItem' => (int) $row->podetailitem,
                    'supplierCode' => (string) $row->supplierid,
                    'supplierName' => html_entity_decode((string) $row->supplier_name),
                    'supplierReference' => (string) ($row->supplierref ?? ''),
                    'stockId' => (string) $row->itemcode,
                    'description' => html_entity_decode((string) $row->itemdescription),
                    'location' => (string) $row->intostocklocation,
                    'locationName' => html_entity_decode((string) $row->location_name),
                    'date' => $this->dateOnly((string) $row->deliverydate),
                    'quantityReceived' => (float) $row->qtyrecd,
                    'quantityInvoiced' => (float) $row->quantityinv,
                    'quantityToReverse' => $quantityToReverse,
                    'unitCost' => $unitCost,
                    'value' => $quantityToReverse * $unitCost,
                    'currency' => $this->currency((string) $row->currency_code),
                    'controlled' => (bool) $row->controlled_item,
                    'serialised' => (bool) $row->serialised_item,
                    'units' => (string) ($row->units ?: 'each'),
                    'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
                    'status' => ((float) $row->quantityinv) > 0 ? 'Part invoiced' : 'Uninvoiced',
                ];
            })
            ->values();
    }

    private function grnForPosting(int $grnNo)
    {
        return DB::table('grns as g')
            ->join('purchorderdetails as pod', 'pod.podetailitem', '=', 'g.podetailitem')
            ->join('purchorders as po', 'po.orderno', '=', 'pod.orderno')
            ->leftJoin('suppliers as s', 's.supplierid', '=', 'g.supplierid')
            ->where('g.grnno', $grnNo)
            ->select(
                'g.*',
                'pod.orderno as po_orderno',
                'pod.glcode',
                'pod.assetid',
                DB::raw('COALESCE(NULLIF(g.stdcostunit, 0), NULLIF(pod.stdcostunit, 0), NULLIF(pod.unitprice, 0), 0) as posting_cost'),
                'po.intostocklocation',
                'po.stat_comment',
                DB::raw('COALESCE(NULLIF(s.suppname, ""), g.supplierid) as supplier_name')
            )
            ->first();
    }

    private function stockItem(string $stockId)
    {
        if (!Schema::hasTable('stockmaster')) {
            return null;
        }

        return DB::table('stockmaster')->where('stockid', $stockId)->first();
    }

    private function updatePurchaseOrderStatus(object $grn, string $reason): void
    {
        $comment = Carbon::today()->format('d/m/Y') . ' - GRN reversed for ' . html_entity_decode((string) $grn->itemdescription) . ' - ' . $reason . '<br />';
        DB::table('purchorders')
            ->where('orderno', $this->purchaseOrderNumber($grn))
            ->update([
                'status' => 'Printed',
                'stat_comment' => DB::raw('CONCAT(' . DB::getPdo()->quote($comment) . ', stat_comment)'),
            ]);
    }

    private function updateGrnRecord(int $grnNo, float $quantityReceived, float $quantityToReverse): void
    {
        if (abs($quantityToReverse - $quantityReceived) < 0.000001) {
            if (Schema::hasTable('suppinvstogrn')) {
                DB::table('suppinvstogrn')->where('grnno', $grnNo)->delete();
            }
            DB::table('grns')->where('grnno', $grnNo)->delete();
            return;
        }

        DB::table('grns')
            ->where('grnno', $grnNo)
            ->update(['qtyrecd' => DB::raw('qtyrecd - ' . $quantityToReverse)]);
    }

    private function reverseFixedAsset(object $grn, float $quantityToReverse, float $cost, int $periodNo, string $date): void
    {
        $assetId = (int) ($grn->assetid ?? 0);
        if ($assetId === 0 || !Schema::hasTable('fixedassets') || !Schema::hasTable('fixedassettrans')) {
            return;
        }

        DB::table('fixedassettrans')->insert([
            'assetid' => $assetId,
            'transtype' => 25,
            'transno' => (int) $grn->grnno,
            'transdate' => $date,
            'periodno' => $periodNo,
            'inputdate' => Carbon::today()->toDateString(),
            'cost' => -$cost * $quantityToReverse,
        ]);

        DB::table('fixedassets')
            ->where('assetid', $assetId)
            ->update(['cost' => DB::raw('cost - ' . ($cost * $quantityToReverse))]);
    }

    private function controlledItemsAvailable(object $grn, float $quantityToReverse): array
    {
        if (!Schema::hasTable('stockmoves') || !Schema::hasTable('stockserialmoves') || !Schema::hasTable('stockserialitems')) {
            return ['available' => false, 'message' => 'Batch or serial details are not available for this receipt.'];
        }

        $moves = $this->controlledOriginalMoves($grn);
        if ($moves->isEmpty()) {
            return ['available' => false, 'message' => 'Batch or serial details were not found for this receipt.'];
        }

        foreach ($moves as $move) {
            $available = (float) (DB::table('stockserialitems')
                ->where('stockid', (string) $grn->itemcode)
                ->where('loccode', (string) $grn->intostocklocation)
                ->where('serialno', (string) $move->serialno)
                ->value('quantity') ?? 0);

            if ($available < (float) $move->moveqty) {
                return [
                    'available' => false,
                    'message' => 'Serial or batch ' . (string) $move->serialno . ' is no longer fully available at the receiving location.',
                ];
            }
        }

        return ['available' => true, 'message' => ''];
    }

    private function controlledOriginalMoves(object $grn)
    {
        return DB::table('stockmoves as sm')
            ->join('stockserialmoves as ssm', 'ssm.stockmoveno', '=', 'sm.stkmoveno')
            ->where('sm.stockid', (string) $grn->itemcode)
            ->where('sm.type', 25)
            ->where('sm.transno', (int) $grn->grnbatch)
            ->select('ssm.serialno', 'ssm.moveqty')
            ->get();
    }

    private function reverseControlledItems(object $grn, int $stockMoveNo): void
    {
        if ($stockMoveNo === 0 || !Schema::hasTable('stockserialmoves') || !Schema::hasTable('stockserialitems')) {
            return;
        }

        foreach ($this->controlledOriginalMoves($grn) as $move) {
            DB::table('stockserialmoves')->insert([
                'stockmoveno' => $stockMoveNo,
                'stockid' => (string) $grn->itemcode,
                'serialno' => (string) $move->serialno,
                'moveqty' => -(float) $move->moveqty,
            ]);

            DB::table('stockserialitems')
                ->where('stockid', (string) $grn->itemcode)
                ->where('loccode', (string) $grn->intostocklocation)
                ->where('serialno', (string) $move->serialno)
                ->update(['quantity' => DB::raw('quantity - ' . (float) $move->moveqty)]);
        }
    }

    private function postReversalGl(object $grn, float $quantityToReverse, float $cost, int $periodNo, string $date, int $grnNo): void
    {
        $glCode = trim((string) ($grn->glcode ?? ''));
        $grnAccount = $this->grnAccount();
        if (!Schema::hasTable('gltrans') || !$this->stockLedgerLinked() || $glCode === '' || $glCode === '0' || $grnAccount === '' || $cost == 0.0) {
            return;
        }

        $narrative = 'GRN reversal PO ' . (string) $this->purchaseOrderNumber($grn) . ' ' . (string) $grn->supplierid . ' - ' . (string) $grn->itemcode . ' ' . html_entity_decode((string) $grn->itemdescription) . ' x ' . $this->formatQuantity($quantityToReverse) . ' @ ' . $this->formatQuantity($cost);
        $this->insertGlTrans([
            'type' => 25,
            'typeno' => $grnNo,
            'trandate' => $date,
            'periodno' => $periodNo,
            'period' => $periodNo,
            'account' => $glCode,
            'narrative' => $narrative,
            'amount' => -$cost * $quantityToReverse,
        ]);

        $this->insertGlTrans([
            'type' => 25,
            'typeno' => $grnNo,
            'trandate' => $date,
            'periodno' => $periodNo,
            'period' => $periodNo,
            'account' => $grnAccount,
            'narrative' => $narrative,
            'amount' => $cost * $quantityToReverse,
        ]);
    }

    private function suppliers()
    {
        if (!Schema::hasTable('suppliers')) {
            return [];
        }

        return DB::table('suppliers')
            ->select('supplierid', 'suppname')
            ->orderBy('suppname')
            ->limit(500)
            ->get()
            ->map(function ($row) {
                return [
                    'value' => (string) $row->supplierid,
                    'label' => html_entity_decode((string) ($row->suppname ?: $row->supplierid)),
                ];
            })
            ->values();
    }

    private function locations()
    {
        if (!Schema::hasTable('locations')) {
            return [];
        }

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

    private function locationStockQuantity(string $location, string $stockId): float
    {
        if (!Schema::hasTable('locstock')) {
            return 0.0;
        }

        return (float) (DB::table('locstock')
            ->where('loccode', $location)
            ->where('stockid', $stockId)
            ->value('quantity') ?? 0);
    }

    private function adjustLocationStock(string $location, string $stockId, float $quantity, int $decimalPlaces): void
    {
        if (!Schema::hasTable('locstock')) {
            return;
        }

        DB::table('locstock')
            ->where('loccode', $location)
            ->where('stockid', $stockId)
            ->update(['quantity' => DB::raw('quantity + ' . round($quantity, $decimalPlaces))]);
    }

    private function insertStockMove(array $values): int
    {
        if (!Schema::hasTable('stockmoves')) {
            return 0;
        }

        $columns = Schema::getColumnListing('stockmoves');
        $insert = [];
        foreach ($values as $column => $value) {
            if (in_array($column, $columns, true)) {
                $insert[$column] = $value;
            }
        }

        return (int) DB::table('stockmoves')->insertGetId($insert);
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

    private function postingCost(object $grn): float
    {
        return (float) ($grn->posting_cost ?? $grn->stdcostunit ?? 0);
    }

    private function purchaseOrderNumber(object $grn): int
    {
        $poOrderNo = (int) ($grn->po_orderno ?? 0);
        return $poOrderNo > 0 ? $poOrderNo : (int) ($grn->orderno ?? 0);
    }

    private function stockLedgerLinked(): bool
    {
        if (!Schema::hasTable('companies')) {
            return false;
        }

        return (string) DB::table('companies')->where('coycode', 1)->value('gllink_stock') === '1';
    }

    private function grnAccount(): string
    {
        if (!Schema::hasTable('companies')) {
            return '';
        }

        return (string) (DB::table('companies')->where('coycode', 1)->value('grnact') ?? '');
    }

    private function currency(string $fallback = ''): string
    {
        $currency = strtoupper(trim($fallback));
        if ($currency !== '') {
            return $currency;
        }

        if (!Schema::hasTable('companies')) {
            return 'TZS';
        }

        return (string) (DB::table('companies')->where('coycode', 1)->value('currencydefault') ?? 'TZS');
    }

    private function validationError(string $message)
    {
        return response()->json(['success' => false, 'message' => $message], 422);
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

    private function formatQuantity(float $value): string
    {
        return rtrim(rtrim(number_format($value, 4, '.', ','), '0'), '.');
    }
}
