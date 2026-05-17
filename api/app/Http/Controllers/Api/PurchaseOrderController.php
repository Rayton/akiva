<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class PurchaseOrderController extends Controller
{
    public function index(Request $request)
    {
        if (!Schema::hasTable('purchorders') || !Schema::hasTable('purchorderdetails')) {
            return response()->json([
                'success' => true,
                'data' => [],
                'lookups' => $this->lookups(),
            ]);
        }

        $limit = $this->safeLimit($request->query('limit', 250), 20, 1000);
        $search = trim((string) $request->query('q', ''));

        try {
            $query = DB::table('purchorders as po')
                ->leftJoin('suppliers as s', 's.supplierid', '=', 'po.supplierno')
                ->leftJoin('locations as l', 'l.loccode', '=', 'po.intostocklocation')
                ->leftJoin('purchorderdetails as pod', 'pod.orderno', '=', 'po.orderno')
                ->select(
                    'po.orderno',
                    'po.supplierno',
                    'po.comments',
                    'po.orddate',
                    'po.rate',
                    'po.dateprinted',
                    'po.allowprint',
                    'po.initiator',
                    'po.requisitionno',
                    'po.intostocklocation',
                    'po.realorderno',
                    'po.deliveryby',
                    'po.deliverydate',
                    'po.status',
                    'po.stat_comment',
                    'po.paymentterms',
                    DB::raw('COALESCE(NULLIF(s.suppname, ""), po.supplierno) as supplier_name'),
                    DB::raw('COALESCE(s.currcode, "TZS") as currency_code'),
                    DB::raw('CONCAT_WS(", ", NULLIF(s.address1, ""), NULLIF(s.address2, ""), NULLIF(s.address3, ""), NULLIF(s.address4, "")) as supplier_address'),
                    DB::raw('COALESCE(NULLIF(l.locationname, ""), po.intostocklocation) as location_name'),
                    DB::raw('COALESCE(SUM(pod.quantityord * pod.unitprice), 0) as order_total'),
                    DB::raw('COALESCE(SUM(GREATEST(pod.quantityord - pod.quantityrecd, 0)), 0) as balance_qty'),
                    DB::raw('COUNT(DISTINCT pod.podetailitem) as line_count')
                )
                ->groupBy(
                    'po.orderno',
                    'po.supplierno',
                    'po.comments',
                    'po.orddate',
                    'po.rate',
                    'po.dateprinted',
                    'po.allowprint',
                    'po.initiator',
                    'po.requisitionno',
                    'po.intostocklocation',
                    'po.realorderno',
                    'po.deliveryby',
                    'po.deliverydate',
                    'po.status',
                    'po.stat_comment',
                    'po.paymentterms',
                    's.suppname',
                    's.currcode',
                    's.address1',
                    's.address2',
                    's.address3',
                    's.address4',
                    'l.locationname'
                )
                ->orderByDesc('po.orderno')
                ->limit($limit);

            if ($search !== '') {
                $query->where(function ($inner) use ($search) {
                    $inner
                        ->where('po.orderno', 'like', "%{$search}%")
                        ->orWhere('po.realorderno', 'like', "%{$search}%")
                        ->orWhere('po.requisitionno', 'like', "%{$search}%")
                        ->orWhere('po.supplierno', 'like', "%{$search}%")
                        ->orWhere('s.suppname', 'like', "%{$search}%")
                        ->orWhere('pod.itemcode', 'like', "%{$search}%")
                        ->orWhere('pod.itemdescription', 'like', "%{$search}%");
                });
            }

            $headers = $query->get();
            $orderNumbers = $headers->pluck('orderno')->map(function ($value) {
                return (int) $value;
            })->all();
            $linesByOrder = $this->linesByOrder($orderNumbers);

            return response()->json([
                'success' => true,
                'data' => $headers->map(function ($row) use ($linesByOrder) {
                    return $this->orderPayload($row, $linesByOrder[(int) $row->orderno] ?? []);
                })->values(),
                'lookups' => $this->lookups(),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
                'lookups' => $this->lookups(),
            ]);
        }
    }

    public function shipments(Request $request)
    {
        if (!Schema::hasTable('purchorders') || !Schema::hasTable('purchorderdetails')) {
            return response()->json([
                'success' => true,
                'data' => [],
                'summary' => $this->shipmentSummary([]),
                'meta' => $this->shipmentMeta(),
            ]);
        }

        $limit = $this->safeLimit($request->query('limit', 250), 20, 1000);
        $search = trim((string) $request->query('q', ''));

        try {
            $query = DB::table('purchorders as po')
                ->leftJoin('suppliers as s', 's.supplierid', '=', 'po.supplierno')
                ->leftJoin('locations as l', 'l.loccode', '=', 'po.intostocklocation')
                ->leftJoin('purchorderdetails as pod', 'pod.orderno', '=', 'po.orderno')
                ->select(
                    'po.orderno',
                    'po.supplierno',
                    'po.comments',
                    'po.orddate',
                    'po.rate',
                    'po.dateprinted',
                    'po.allowprint',
                    'po.initiator',
                    'po.requisitionno',
                    'po.intostocklocation',
                    'po.realorderno',
                    'po.deliveryby',
                    'po.deliverydate',
                    'po.status',
                    'po.stat_comment',
                    'po.paymentterms',
                    DB::raw('COALESCE(NULLIF(s.suppname, ""), po.supplierno) as supplier_name'),
                    DB::raw('COALESCE(s.currcode, "TZS") as currency_code'),
                    DB::raw('CONCAT_WS(", ", NULLIF(s.address1, ""), NULLIF(s.address2, ""), NULLIF(s.address3, ""), NULLIF(s.address4, "")) as supplier_address'),
                    DB::raw('COALESCE(NULLIF(l.locationname, ""), po.intostocklocation) as location_name'),
                    DB::raw('COALESCE(SUM(pod.quantityord * pod.unitprice), 0) as order_total'),
                    DB::raw('COALESCE(SUM(GREATEST(pod.quantityord - pod.quantityrecd, 0)), 0) as balance_qty'),
                    DB::raw('COALESCE(SUM(pod.quantityord), 0) as ordered_qty'),
                    DB::raw('COALESCE(SUM(pod.quantityrecd), 0) as received_qty'),
                    DB::raw('COALESCE(SUM(pod.qtyinvoiced), 0) as invoiced_qty'),
                    DB::raw('COUNT(DISTINCT pod.podetailitem) as line_count')
                )
                ->whereNotIn('po.status', ['Cancelled', 'Canceled', 'Rejected', 'Completed', 'Pending', 'Modify', 'Reviewed'])
                ->groupBy(
                    'po.orderno',
                    'po.supplierno',
                    'po.comments',
                    'po.orddate',
                    'po.rate',
                    'po.dateprinted',
                    'po.allowprint',
                    'po.initiator',
                    'po.requisitionno',
                    'po.intostocklocation',
                    'po.realorderno',
                    'po.deliveryby',
                    'po.deliverydate',
                    'po.status',
                    'po.stat_comment',
                    'po.paymentterms',
                    's.suppname',
                    's.currcode',
                    's.address1',
                    's.address2',
                    's.address3',
                    's.address4',
                    'l.locationname'
                )
                ->havingRaw('COALESCE(SUM(pod.quantityord), 0) > 0')
                ->orderByDesc('po.orderno')
                ->limit($limit);

            if ($search !== '') {
                $query->where(function ($inner) use ($search) {
                    $inner
                        ->where('po.orderno', 'like', "%{$search}%")
                        ->orWhere('po.realorderno', 'like', "%{$search}%")
                        ->orWhere('po.requisitionno', 'like', "%{$search}%")
                        ->orWhere('po.supplierno', 'like', "%{$search}%")
                        ->orWhere('s.suppname', 'like', "%{$search}%")
                        ->orWhere('pod.itemcode', 'like', "%{$search}%")
                        ->orWhere('pod.itemdescription', 'like', "%{$search}%");
                });
            }

            $headers = $query->get();
            $orderNumbers = $headers->pluck('orderno')->map(function ($value) {
                return (int) $value;
            })->all();
            $linesByOrder = $this->linesByOrder($orderNumbers);
            $grnsByOrder = $this->grnStatsByOrder($orderNumbers);
            $legacyShipments = $this->legacyShipmentPayloads($limit, $search);

            $receivingShipments = $headers
                ->map(function ($row) use ($linesByOrder, $grnsByOrder) {
                    return $this->shipmentPayload($row, $linesByOrder[(int) $row->orderno] ?? [], $grnsByOrder[(int) $row->orderno] ?? null);
                })
                ->filter(function ($shipment) {
                    return $shipment !== null;
                });

            $shipments = collect($legacyShipments)
                ->merge($receivingShipments)
                ->sortByDesc('priority')
                ->take($limit)
                ->values();

            return response()->json([
                'success' => true,
                'data' => $shipments,
                'summary' => $this->shipmentSummary($shipments->all()),
                'meta' => $this->shipmentMeta(),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Shipment operations could not be loaded.',
                'data' => [],
                'summary' => $this->shipmentSummary([]),
                'meta' => $this->shipmentMeta(),
            ], 500);
        }
    }

    private function linesByOrder(array $orderNumbers): array
    {
        if (count($orderNumbers) === 0) {
            return [];
        }

        $rows = DB::table('purchorderdetails as pod')
            ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'pod.itemcode')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->whereIn('pod.orderno', $orderNumbers)
            ->select(
                'pod.*',
                DB::raw('COALESCE(NULLIF(sm.description, ""), pod.itemdescription) as stock_description'),
                DB::raw('COALESCE(NULLIF(sc.categorydescription, ""), sm.categoryid, "Uncategorised") as category_name'),
                DB::raw('COALESCE(NULLIF(sm.units, ""), NULLIF(pod.uom, ""), "each") as stock_units'),
                DB::raw('COALESCE(sm.controlled, 0) as controlled_item')
            )
            ->orderBy('pod.orderno')
            ->orderBy('pod.podetailitem')
            ->get();

        return $rows
            ->groupBy('orderno')
            ->map(function ($lines) {
                return $lines->map(function ($line) {
                    return $this->linePayload($line);
                })->values()->all();
            })
            ->all();
    }

    private function grnStatsByOrder(array $orderNumbers): array
    {
        if (count($orderNumbers) === 0 || !Schema::hasTable('grns')) {
            return [];
        }

        return DB::table('grns as g')
            ->join('purchorderdetails as pod', 'pod.podetailitem', '=', 'g.podetailitem')
            ->whereIn('pod.orderno', $orderNumbers)
            ->select(
                'pod.orderno',
                DB::raw('COUNT(DISTINCT g.grnno) as grn_count'),
                DB::raw('MAX(g.deliverydate) as last_grn_date'),
                DB::raw('COALESCE(SUM(g.qtyrecd), 0) as grn_received_qty'),
                DB::raw('COALESCE(SUM(g.quantityinv), 0) as grn_invoiced_qty')
            )
            ->groupBy('pod.orderno')
            ->get()
            ->keyBy(function ($row) {
                return (int) $row->orderno;
            })
            ->all();
    }

    private function shipmentPayload(object $row, array $lines, ?object $grnStats): ?array
    {
        if (Schema::hasTable('shipments') && Schema::hasColumn('purchorderdetails', 'shiptref')) {
            $unassignedLines = array_values(array_filter($lines, function ($line) {
                return (int) ($line['shipmentReference'] ?? 0) <= 0;
            }));

            if (count($lines) > 0 && count($unassignedLines) === 0) {
                return null;
            }

            if (count($unassignedLines) > 0) {
                $lines = $unassignedLines;
            }
        }

        $order = $this->orderPayload($row, $lines);
        $orderedQty = array_reduce($lines, fn ($sum, $line) => $sum + (float) ($line['quantityOrdered'] ?? 0), 0.0);
        $receivedQty = array_reduce($lines, fn ($sum, $line) => $sum + (float) ($line['quantityReceived'] ?? 0), 0.0);
        $invoicedQty = array_reduce($lines, fn ($sum, $line) => $sum + (float) ($line['quantityInvoiced'] ?? 0), 0.0);
        $openQty = max(0, $orderedQty - $receivedQty);

        if ($orderedQty <= 0) {
            return null;
        }

        $etaDate = $this->safeDate((string) ($row->deliverydate ?? ''), $order['orderDate']);
        $etaDays = $this->signedDaysUntil($etaDate);
        $status = $this->shipmentStatus((string) $row->status, $etaDays, $openQty, $receivedQty, $invoicedQty, $row, $grnStats);
        $value = array_reduce($lines, function ($sum, $line) {
            return $sum + ((float) ($line['quantityOrdered'] ?? 0) * (float) ($line['unitPrice'] ?? 0));
        }, 0.0);
        if ($value <= 0) {
            $value = (float) ($row->order_total ?? 0);
        }
        $risk = $this->shipmentRisk($status, $etaDays, $value, $openQty, $receivedQty, $invoicedQty);
        $issue = $this->shipmentIssue($status, $etaDays, $openQty, $receivedQty, $invoicedQty);
        $grnCount = (int) ($grnStats->grn_count ?? 0);

        return [
            'id' => 'PO-' . (string) $row->orderno,
            'order' => $order,
            'orderId' => $order['id'],
            'orderNumber' => $order['orderNumber'],
            'realOrderNumber' => $order['realOrderNumber'],
            'supplierCode' => $order['supplierCode'],
            'supplierName' => $order['supplierName'],
            'location' => $order['location'],
            'currency' => $order['currency'],
            'etaDate' => $etaDate,
            'etaLabel' => $this->etaLabel($etaDays),
            'etaDays' => $etaDays,
            'status' => $status,
            'risk' => $risk,
            'value' => $value,
            'progress' => $this->shipmentProgress($status),
            'containerCount' => 0,
            'issue' => $issue,
            'priority' => $this->shipmentPriority($risk, $etaDays, $value, $openQty, $receivedQty, $invoicedQty, $status),
            'orderedQuantity' => $orderedQty,
            'receivedQuantity' => $receivedQty,
            'invoicedQuantity' => $invoicedQty,
            'openQuantity' => $openQty,
            'grnCount' => $grnCount,
            'lastGrnDate' => $grnStats?->last_grn_date ? $this->safeDate((string) $grnStats->last_grn_date, '') : '',
            'timeline' => $this->shipmentTimeline($row, $order, $status, $issue, $grnStats),
            'source' => 'purchase_order_receiving',
        ];
    }

    private function legacyShipmentPayloads(int $limit, string $search): array
    {
        if (
            !Schema::hasTable('shipments') ||
            !Schema::hasTable('purchorders') ||
            !Schema::hasTable('purchorderdetails') ||
            !Schema::hasColumn('purchorderdetails', 'shiptref')
        ) {
            return [];
        }

        $query = DB::table('shipments as sh')
            ->leftJoin('suppliers as s', 's.supplierid', '=', 'sh.supplierid')
            ->leftJoin('purchorderdetails as pod', 'pod.shiptref', '=', 'sh.shiptref')
            ->leftJoin('purchorders as po', 'po.orderno', '=', 'pod.orderno')
            ->leftJoin('locations as l', 'l.loccode', '=', 'po.intostocklocation')
            ->select(
                'sh.shiptref',
                'sh.voyageref',
                'sh.vessel',
                'sh.eta',
                'sh.accumvalue',
                'sh.supplierid',
                'sh.closed',
                DB::raw('COALESCE(NULLIF(MAX(s.suppname), ""), sh.supplierid) as supplier_name'),
                DB::raw('COALESCE(NULLIF(MAX(s.currcode), ""), "TZS") as currency_code'),
                DB::raw('CONCAT_WS(", ", NULLIF(MAX(s.address1), ""), NULLIF(MAX(s.address2), ""), NULLIF(MAX(s.address3), ""), NULLIF(MAX(s.address4), "")) as supplier_address'),
                DB::raw('MIN(po.orderno) as first_order_no'),
                DB::raw('MIN(po.orddate) as first_order_date'),
                DB::raw('COALESCE(NULLIF(MIN(po.intostocklocation), ""), "") as intostocklocation'),
                DB::raw('COALESCE(NULLIF(MIN(l.locationname), ""), NULLIF(MIN(po.intostocklocation), ""), "") as location_name'),
                DB::raw('COALESCE(NULLIF(MAX(po.deliveryby), ""), "") as deliveryby'),
                DB::raw('COALESCE(NULLIF(MAX(po.comments), ""), "") as comments'),
                DB::raw('COUNT(DISTINCT po.orderno) as order_count'),
                DB::raw('COUNT(DISTINCT pod.podetailitem) as line_count'),
                DB::raw('COALESCE(SUM(pod.quantityord * pod.unitprice), 0) as order_total'),
                DB::raw('COALESCE(SUM(pod.quantityord), 0) as ordered_qty'),
                DB::raw('COALESCE(SUM(pod.quantityrecd), 0) as received_qty'),
                DB::raw('COALESCE(SUM(pod.qtyinvoiced), 0) as invoiced_qty')
            )
            ->groupBy(
                'sh.shiptref',
                'sh.voyageref',
                'sh.vessel',
                'sh.eta',
                'sh.accumvalue',
                'sh.supplierid',
                'sh.closed'
            )
            ->orderBy('sh.closed')
            ->orderByRaw('COALESCE(sh.eta, NOW()) asc')
            ->limit($limit);

        if ($search !== '') {
            $query->where(function ($inner) use ($search) {
                $inner
                    ->where('sh.shiptref', 'like', "%{$search}%")
                    ->orWhere('sh.vessel', 'like', "%{$search}%")
                    ->orWhere('sh.voyageref', 'like', "%{$search}%")
                    ->orWhere('sh.supplierid', 'like', "%{$search}%")
                    ->orWhere('s.suppname', 'like', "%{$search}%")
                    ->orWhere('pod.itemcode', 'like', "%{$search}%")
                    ->orWhere('pod.itemdescription', 'like', "%{$search}%");
            });
        }

        $rows = $query->get();
        $shipmentRefs = $rows->pluck('shiptref')->map(function ($value) {
            return (int) $value;
        })->filter()->values()->all();

        $linesByShipment = $this->shipmentLinesByReference($shipmentRefs);
        $chargesByShipment = $this->shipmentChargesByReference($shipmentRefs);

        return $rows
            ->map(function ($row) use ($linesByShipment, $chargesByShipment) {
                return $this->legacyShipmentPayload(
                    $row,
                    $linesByShipment[(int) $row->shiptref] ?? [],
                    $chargesByShipment[(int) $row->shiptref] ?? null
                );
            })
            ->filter(function ($shipment) {
                return $shipment !== null;
            })
            ->values()
            ->all();
    }

    private function shipmentLinesByReference(array $shipmentRefs): array
    {
        if (count($shipmentRefs) === 0 || !Schema::hasColumn('purchorderdetails', 'shiptref')) {
            return [];
        }

        $rows = DB::table('purchorderdetails as pod')
            ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'pod.itemcode')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->whereIn('pod.shiptref', $shipmentRefs)
            ->select(
                'pod.*',
                DB::raw('COALESCE(NULLIF(sm.description, ""), pod.itemdescription) as stock_description'),
                DB::raw('COALESCE(NULLIF(sc.categorydescription, ""), sm.categoryid, "Uncategorised") as category_name'),
                DB::raw('COALESCE(NULLIF(sm.units, ""), NULLIF(pod.uom, ""), "each") as stock_units'),
                DB::raw('COALESCE(sm.controlled, 0) as controlled_item')
            )
            ->orderBy('pod.shiptref')
            ->orderBy('pod.orderno')
            ->orderBy('pod.podetailitem')
            ->get();

        return $rows
            ->groupBy('shiptref')
            ->map(function ($lines) {
                return $lines->map(function ($line) {
                    return $this->linePayload($line);
                })->values()->all();
            })
            ->all();
    }

    private function shipmentChargesByReference(array $shipmentRefs): array
    {
        if (count($shipmentRefs) === 0 || !Schema::hasTable('shipmentcharges')) {
            return [];
        }

        return DB::table('shipmentcharges')
            ->whereIn('shiptref', $shipmentRefs)
            ->select(
                'shiptref',
                DB::raw('COUNT(*) as charge_count'),
                DB::raw('COUNT(DISTINCT transno) as transaction_count'),
                DB::raw('COALESCE(SUM(value), 0) as charge_total')
            )
            ->groupBy('shiptref')
            ->get()
            ->keyBy(function ($row) {
                return (int) $row->shiptref;
            })
            ->all();
    }

    private function legacyShipmentPayload(object $row, array $lines, ?object $charges): ?array
    {
        $shipmentRef = (int) $row->shiptref;
        if ($shipmentRef <= 0) {
            return null;
        }

        $orderedQty = array_reduce($lines, fn ($sum, $line) => $sum + (float) ($line['quantityOrdered'] ?? 0), 0.0);
        $receivedQty = array_reduce($lines, fn ($sum, $line) => $sum + (float) ($line['quantityReceived'] ?? 0), 0.0);
        $invoicedQty = array_reduce($lines, fn ($sum, $line) => $sum + (float) ($line['quantityInvoiced'] ?? 0), 0.0);
        $openQty = max(0, $orderedQty - $receivedQty);
        $chargeValue = (float) ($charges->charge_total ?? 0);
        $closed = (bool) $row->closed;
        $etaDate = $this->safeDate((string) ($row->eta ?? ''), Carbon::today()->toDateString());
        $etaDays = $this->signedDaysUntil($etaDate);
        $status = $this->legacyShipmentStatus($row, $etaDays, $openQty, $receivedQty, $invoicedQty, $closed);
        $baseValue = max((float) ($row->accumvalue ?? 0), (float) ($row->order_total ?? 0) + $chargeValue);
        $risk = $this->shipmentRisk($status, $etaDays, $baseValue, $openQty, $receivedQty, $invoicedQty);
        $issue = $this->legacyShipmentIssue($row, $status, $etaDays, $openQty, $receivedQty, $invoicedQty, $chargeValue, $closed);
        $supplierName = html_entity_decode((string) $row->supplier_name);
        $supplierCode = (string) $row->supplierid;
        $orderDate = $this->safeDate((string) ($row->first_order_date ?? ''), $etaDate);
        $orderNumber = (string) ($row->first_order_no ?: $shipmentRef);
        $currency = $this->currency((string) $row->currency_code);

        $order = [
            'id' => 'shipment-' . $shipmentRef,
            'orderNumber' => $orderNumber,
            'realOrderNumber' => 'Shipment ' . $shipmentRef,
            'supplierCode' => $supplierCode,
            'supplierName' => $supplierName,
            'supplierAddress' => html_entity_decode((string) ($row->supplier_address ?? '')),
            'currency' => $currency,
            'exchangeRate' => 1,
            'orderDate' => $orderDate,
            'deliveryDate' => $etaDate,
            'initiatedBy' => 'Legacy shipment register',
            'reviewer' => 'Receiving team',
            'location' => (string) ($row->location_name ?: $row->intostocklocation ?: 'Warehouse'),
            'requisitionNo' => '',
            'paymentTerms' => '',
            'deliveryBy' => trim((string) ($row->vessel ?? '') . ' ' . (string) ($row->voyageref ?? '')),
            'comments' => trim(strip_tags(html_entity_decode((string) ($row->comments ?? '')))),
            'status' => $closed ? 'Completed' : 'Printed',
            'allowPrint' => true,
            'lines' => $lines,
            'events' => [[
                'label' => 'Shipment registered',
                'by' => 'Legacy ERP',
                'at' => $orderDate,
            ]],
            'source' => 'legacy_shipment',
        ];

        return [
            'id' => 'SHP-' . $shipmentRef,
            'legacyShipmentRef' => $shipmentRef,
            'vessel' => (string) ($row->vessel ?? ''),
            'voyageRef' => (string) ($row->voyageref ?? ''),
            'closed' => $closed,
            'order' => $order,
            'orderId' => $order['id'],
            'orderNumber' => $order['orderNumber'],
            'realOrderNumber' => $order['realOrderNumber'],
            'supplierCode' => $supplierCode,
            'supplierName' => $supplierName,
            'location' => $order['location'],
            'currency' => $currency,
            'etaDate' => $etaDate,
            'etaLabel' => $this->etaLabel($etaDays),
            'etaDays' => $etaDays,
            'status' => $status,
            'risk' => $risk,
            'value' => $baseValue,
            'progress' => $this->shipmentProgress($status),
            'containerCount' => 0,
            'issue' => $issue,
            'priority' => $this->shipmentPriority($risk, $etaDays, $baseValue, $openQty, $receivedQty, $invoicedQty, $status),
            'orderedQuantity' => $orderedQty,
            'receivedQuantity' => $receivedQty,
            'invoicedQuantity' => $invoicedQty,
            'openQuantity' => $openQty,
            'shipmentCharges' => $chargeValue,
            'shipmentChargeCount' => (int) ($charges->charge_count ?? 0),
            'orderCount' => (int) ($row->order_count ?? 0),
            'lineCount' => (int) ($row->line_count ?? 0),
            'timeline' => $this->legacyShipmentTimeline($row, $order, $status, $issue, $charges, $closed),
            'source' => 'legacy_shipment',
        ];
    }

    private function legacyShipmentStatus(object $row, int $etaDays, float $openQty, float $receivedQty, float $invoicedQty, bool $closed): string
    {
        if ($closed) {
            return 'Closed';
        }

        if ($this->containsCustomsHold($row)) {
            return 'Customs Hold';
        }

        if ($receivedQty > 0 && $openQty > 0) {
            return 'Partial Receipt';
        }

        if ($receivedQty > 0 && $receivedQty > $invoicedQty) {
            return 'Invoice Match';
        }

        if ($openQty <= 0 && $receivedQty > 0) {
            return 'Invoice Match';
        }

        if ($etaDays <= 0) {
            return 'Warehouse Receiving';
        }

        return 'In Transit';
    }

    private function legacyShipmentIssue(object $row, string $status, int $etaDays, float $openQty, float $receivedQty, float $invoicedQty, float $chargeValue, bool $closed): string
    {
        if ($closed) {
            return 'Shipment closed after receiving and costing workflow';
        }

        if ($status === 'Customs Hold') {
            return 'Customs or clearance reference found on shipment record';
        }

        if ($etaDays < 0 && $openQty > 0) {
            $days = abs($etaDays);
            return 'Shipment ETA missed by ' . $days . ' day' . ($days === 1 ? '' : 's');
        }

        if ($status === 'Partial Receipt') {
            return 'Shipment has received quantity with open purchase order balance';
        }

        if ($receivedQty > $invoicedQty && $receivedQty > 0) {
            return 'Received shipment quantity is awaiting supplier invoice match';
        }

        if ($chargeValue > 0) {
            return 'Shipment charges recorded; confirm landed-cost allocation before close';
        }

        if ($status === 'Warehouse Receiving') {
            return 'Shipment is due for warehouse receiving and GRN posting';
        }

        return 'Shipment is in transit toward receiving operations';
    }

    private function legacyShipmentTimeline(object $row, array $order, string $status, string $issue, ?object $charges, bool $closed): array
    {
        $events = [[
            'time' => $order['orderDate'],
            'label' => 'Shipment registered',
            'detail' => 'Shipment ' . (string) $row->shiptref . ' opened for ' . $order['supplierName'] . '.',
            'tone' => 'neutral',
        ]];

        $vessel = trim((string) ($row->vessel ?? ''));
        $voyage = trim((string) ($row->voyageref ?? ''));
        if ($vessel !== '' || $voyage !== '') {
            $events[] = [
                'time' => $order['orderDate'],
                'label' => 'Carrier details recorded',
                'detail' => trim(($vessel ?: 'Vessel pending') . ($voyage !== '' ? ' / ' . $voyage : '')),
                'tone' => 'neutral',
            ];
        }

        $events[] = [
            'time' => $order['deliveryDate'],
            'label' => 'Shipment ETA',
            'detail' => $issue,
            'tone' => in_array($status, ['Customs Hold', 'Warehouse Receiving', 'Partial Receipt'], true) ? 'warning' : 'neutral',
        ];

        if ((int) ($charges->charge_count ?? 0) > 0) {
            $events[] = [
                'time' => $order['deliveryDate'],
                'label' => 'Shipment charges captured',
                'detail' => (int) ($charges->charge_count ?? 0) . ' charge record' . ((int) ($charges->charge_count ?? 0) === 1 ? '' : 's') . ' linked for landed-cost review.',
                'tone' => 'success',
            ];
        }

        if ($closed) {
            $events[] = [
                'time' => $order['deliveryDate'],
                'label' => 'Shipment closed',
                'detail' => 'Legacy shipment register marks this shipment as closed.',
                'tone' => 'success',
            ];
        }

        usort($events, function ($a, $b) {
            return strcmp((string) $b['time'], (string) $a['time']);
        });

        return array_slice($events, 0, 8);
    }

    private function shipmentStatus(string $rawStatus, int $etaDays, float $openQty, float $receivedQty, float $invoicedQty, object $row, ?object $grnStats): string
    {
        if ($this->containsCustomsHold($row)) {
            return 'Customs Hold';
        }

        if ($receivedQty > 0 && $openQty > 0) {
            return 'Partial Receipt';
        }

        if ($receivedQty > 0 && $receivedQty > $invoicedQty) {
            return 'Invoice Match';
        }

        if ($openQty <= 0 && $receivedQty > 0) {
            return 'Invoice Match';
        }

        $status = strtolower(trim($rawStatus));
        if ($status === 'printed') {
            return $etaDays <= 0 ? 'Warehouse Receiving' : 'In Transit';
        }

        if ((int) ($grnStats->grn_count ?? 0) > 0) {
            return 'Awaiting GRN';
        }

        return 'Ordered';
    }

    private function shipmentRisk(string $status, int $etaDays, float $value, float $openQty, float $receivedQty, float $invoicedQty): string
    {
        if ($status === 'Closed') {
            return 'Low';
        }

        if ($status === 'Customs Hold' || ($etaDays < -1 && $openQty > 0)) {
            return 'High';
        }

        if ($value >= 70000000 && $openQty > 0) {
            return 'High';
        }

        if ($etaDays < 0 || $status === 'Partial Receipt' || ($receivedQty > $invoicedQty && $receivedQty > 0)) {
            return 'Medium';
        }

        return 'Low';
    }

    private function shipmentIssue(string $status, int $etaDays, float $openQty, float $receivedQty, float $invoicedQty): string
    {
        if ($status === 'Closed') {
            return 'Shipment workflow is closed';
        }

        if ($status === 'Customs Hold') {
            return 'Customs or clearance note found on purchase order';
        }

        if ($etaDays < 0 && $openQty > 0) {
            $days = abs($etaDays);
            return 'Delivery date missed by ' . $days . ' day' . ($days === 1 ? '' : 's');
        }

        if ($status === 'Partial Receipt') {
            return 'Open balance remains after receiving';
        }

        if ($receivedQty > $invoicedQty && $receivedQty > 0) {
            return 'Received quantity awaiting invoice match';
        }

        if ($status === 'Warehouse Receiving') {
            return 'Goods due for warehouse receiving and GRN';
        }

        if ($status === 'In Transit') {
            return 'Supplier delivery is in transit';
        }

        return 'Supplier order released, awaiting receiving activity';
    }

    private function shipmentProgress(string $status): int
    {
        return match ($status) {
            'Ordered' => 18,
            'In Transit' => 42,
            'Customs Hold' => 54,
            'Warehouse Receiving' => 72,
            'Partial Receipt' => 82,
            'Awaiting GRN' => 88,
            'Invoice Match' => 96,
            'Closed' => 100,
            default => 18,
        };
    }

    private function shipmentPriority(string $risk, int $etaDays, float $value, float $openQty, float $receivedQty, float $invoicedQty, string $status): int
    {
        $score = $risk === 'High' ? 100 : ($risk === 'Medium' ? 55 : 15);
        $score += max(0, 7 - $etaDays);
        $score += min(30, (int) ceil($value / 10000000));
        if ($status === 'Customs Hold') $score += 30;
        if ($status === 'Warehouse Receiving') $score += 20;
        if ($status === 'Partial Receipt') $score += 15;
        if ($receivedQty > $invoicedQty && $receivedQty > 0) $score += 10;
        if ($openQty <= 0) $score -= 25;
        if ($status === 'Closed') $score -= 70;
        return max(0, $score);
    }

    private function shipmentTimeline(object $row, array $order, string $status, string $issue, ?object $grnStats): array
    {
        $events = [[
            'time' => $order['orderDate'],
            'label' => 'Purchase order created',
            'detail' => 'PO ' . $order['orderNumber'] . ' opened for ' . $order['supplierName'] . '.',
            'tone' => 'neutral',
        ]];

        if ((string) ($row->dateprinted ?? '') !== '' && substr((string) $row->dateprinted, 0, 10) !== '0000-00-00') {
            $events[] = [
                'time' => $this->safeDate((string) $row->dateprinted, $order['orderDate']),
                'label' => 'Purchase order printed',
                'detail' => 'Supplier-facing purchase order was released for fulfilment.',
                'tone' => 'neutral',
            ];
        }

        $events[] = [
            'time' => $order['deliveryDate'],
            'label' => 'Required delivery date',
            'detail' => $issue,
            'tone' => in_array($status, ['Customs Hold', 'Warehouse Receiving', 'Partial Receipt'], true) ? 'warning' : 'neutral',
        ];

        if ($grnStats?->last_grn_date) {
            $events[] = [
                'time' => $this->safeDate((string) $grnStats->last_grn_date, $order['deliveryDate']),
                'label' => 'Goods received note posted',
                'detail' => (int) ($grnStats->grn_count ?? 0) . ' GRN record' . ((int) ($grnStats->grn_count ?? 0) === 1 ? '' : 's') . ' linked to this purchase order.',
                'tone' => 'success',
            ];
        }

        foreach (($order['events'] ?? []) as $event) {
            $label = trim((string) ($event['label'] ?? ''));
            if ($label === '' || $label === 'Purchase order created') {
                continue;
            }

            $events[] = [
                'time' => $this->safeDate((string) ($event['at'] ?? $order['orderDate']), $order['orderDate']),
                'label' => $label,
                'detail' => 'Recorded by ' . (string) ($event['by'] ?? 'System') . '.',
                'tone' => str_contains(strtolower($label), 'reject') ? 'critical' : 'neutral',
            ];
        }

        usort($events, function ($a, $b) {
            return strcmp((string) $b['time'], (string) $a['time']);
        });

        return array_slice($events, 0, 8);
    }

    private function shipmentSummary(array $shipments): array
    {
        return [
            'incoming' => count(array_filter($shipments, fn ($shipment) => ($shipment['status'] ?? '') !== 'Closed')),
            'awaitingGrn' => count(array_filter($shipments, fn ($shipment) => in_array($shipment['status'] ?? '', ['Warehouse Receiving', 'Awaiting GRN'], true))),
            'delayed' => count(array_filter($shipments, fn ($shipment) => (int) ($shipment['etaDays'] ?? 0) < 0 || ($shipment['status'] ?? '') === 'Customs Hold')),
            'partialReceipts' => count(array_filter($shipments, fn ($shipment) => ($shipment['status'] ?? '') === 'Partial Receipt')),
            'customsFlagged' => count(array_filter($shipments, fn ($shipment) => ($shipment['status'] ?? '') === 'Customs Hold')),
            'highRisk' => count(array_filter($shipments, fn ($shipment) => ($shipment['risk'] ?? '') === 'High')),
            'registeredShipments' => count(array_filter($shipments, fn ($shipment) => ($shipment['source'] ?? '') === 'legacy_shipment')),
            'exposure' => array_reduce($shipments, fn ($sum, $shipment) => $sum + (float) ($shipment['value'] ?? 0), 0.0),
        ];
    }

    private function shipmentMeta(): array
    {
        return [
            'source' => Schema::hasTable('shipments') ? 'legacy_shipments_and_purchase_order_receiving' : 'purchase_order_receiving',
            'dedicatedShipmentTable' => Schema::hasTable('shipments'),
            'usesPurchaseOrders' => true,
            'usesGoodsReceivedNotes' => Schema::hasTable('grns'),
            'usesShipmentCharges' => Schema::hasTable('shipmentcharges'),
            'generatedAt' => Carbon::now()->toIso8601String(),
        ];
    }

    private function orderPayload(object $row, array $lines): array
    {
        $orderDate = $this->dateOnly((string) $row->orddate);
        $deliveryDate = $this->safeDate((string) ($row->deliverydate ?? ''), $orderDate);

        return [
            'id' => 'po-' . (string) $row->orderno,
            'orderNumber' => (string) $row->orderno,
            'realOrderNumber' => (string) ($row->realorderno ?: 'PO-' . $row->orderno),
            'supplierCode' => (string) $row->supplierno,
            'supplierName' => html_entity_decode((string) $row->supplier_name),
            'supplierAddress' => html_entity_decode((string) ($row->supplier_address ?? '')),
            'currency' => $this->currency((string) $row->currency_code),
            'exchangeRate' => (float) ($row->rate ?: 1),
            'orderDate' => $orderDate,
            'deliveryDate' => $deliveryDate,
            'initiatedBy' => (string) ($row->initiator ?: 'Unknown'),
            'reviewer' => 'Procurement approver',
            'location' => (string) ($row->intostocklocation ?: $row->location_name),
            'requisitionNo' => (string) ($row->requisitionno ?? ''),
            'paymentTerms' => (string) ($row->paymentterms ?? ''),
            'deliveryBy' => (string) ($row->deliveryby ?? ''),
            'comments' => trim(strip_tags(html_entity_decode((string) ($row->comments ?? '')))),
            'status' => $this->status((string) $row->status),
            'allowPrint' => (bool) $row->allowprint,
            'lines' => $lines,
            'events' => $this->events((string) ($row->stat_comment ?? ''), (string) ($row->initiator ?: 'System'), $orderDate),
            'source' => 'database',
        ];
    }

    private function linePayload(object $line): array
    {
        $quantityOrdered = (float) $line->quantityord;
        $quantityReceived = (float) $line->quantityrecd;

        return [
            'id' => (string) $line->podetailitem,
            'itemCode' => (string) $line->itemcode,
            'supplierItem' => (string) ($line->suppliers_partno ?: $line->itemno ?: $line->itemcode),
            'description' => html_entity_decode((string) ($line->stock_description ?: $line->itemdescription)),
            'category' => html_entity_decode((string) $line->category_name),
            'supplierUnits' => (string) ($line->uom ?: $line->stock_units ?: 'each'),
            'receivingUnits' => (string) ($line->pcunit ?: $line->stock_units ?: $line->uom ?: 'each'),
            'conversionFactor' => (float) ($line->conversionfactor ?: 1),
            'quantityOrdered' => $quantityOrdered,
            'quantityReceived' => $quantityReceived,
            'quantityInvoiced' => (float) $line->qtyinvoiced,
            'deliveryDate' => $this->safeDate((string) $line->deliverydate, Carbon::today()->toDateString()),
            'unitPrice' => (float) $line->unitprice,
            'taxRate' => 0,
            'glCode' => (string) $line->glcode,
            'shipmentReference' => (int) ($line->shiptref ?? 0),
            'controlled' => (bool) $line->controlled_item,
            'completed' => (bool) $line->completed || $quantityReceived >= $quantityOrdered,
        ];
    }

    private function lookups(): array
    {
        return [
            'suppliers' => Schema::hasTable('suppliers')
                ? DB::table('suppliers')->select('supplierid', 'suppname', 'currcode')->orderBy('suppname')->limit(250)->get()->map(function ($row) {
                    return [
                        'value' => (string) $row->supplierid,
                        'label' => html_entity_decode((string) $row->suppname),
                        'currency' => $this->currency((string) $row->currcode),
                    ];
                })->values()
                : [],
            'locations' => Schema::hasTable('locations')
                ? DB::table('locations')->select('loccode', 'locationname')->orderBy('locationname')->get()->map(function ($row) {
                    return [
                        'value' => (string) $row->loccode,
                        'label' => html_entity_decode((string) $row->locationname),
                    ];
                })->values()
                : [],
            'categories' => Schema::hasTable('stockcategory')
                ? DB::table('stockcategory')->select('categoryid', 'categorydescription')->orderBy('categorydescription')->get()->map(function ($row) {
                    return [
                        'value' => (string) $row->categorydescription,
                        'label' => html_entity_decode((string) $row->categorydescription),
                    ];
                })->values()
                : [],
        ];
    }

    private function events(string $raw, string $by, string $fallbackDate): array
    {
        $text = trim(strip_tags(str_replace(['<br />', '<br>', '<br/>'], "\n", html_entity_decode($raw))));
        $lines = array_values(array_filter(array_map('trim', preg_split('/\n+/', $text) ?: [])));

        if (count($lines) === 0) {
            return [[
                'label' => 'Purchase order created',
                'by' => $by,
                'at' => $fallbackDate,
            ]];
        }

        return array_map(function ($line) use ($by, $fallbackDate) {
            return [
                'label' => $line,
                'by' => $by,
                'at' => $fallbackDate,
            ];
        }, array_slice($lines, 0, 8));
    }

    private function status(string $status): string
    {
        $key = strtolower(trim($status));
        if ($key === 'modify') return 'Draft';
        if ($key === 'pending') return 'Pending Review';
        if ($key === 'authorised' || $key === 'authorized') return 'Authorised';
        if ($key === 'printed') return 'Printed';
        if ($key === 'reviewed') return 'Reviewed';
        if ($key === 'completed') return 'Completed';
        if ($key === 'cancelled' || $key === 'canceled') return 'Cancelled';
        if ($key === 'rejected') return 'Rejected';
        return 'Draft';
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

    private function safeDate(string $value, string $fallback): string
    {
        try {
            if ($value === '' || $value === '0000-00-00' || substr($value, 0, 10) === '0000-00-00') {
                return $fallback;
            }

            return Carbon::parse($value)->toDateString();
        } catch (\Throwable $e) {
            return $fallback;
        }
    }

    private function signedDaysUntil(string $value): int
    {
        try {
            $target = Carbon::parse($value)->startOfDay();
            $today = Carbon::today();
            return (int) $today->diffInDays($target, false);
        } catch (\Throwable $e) {
            return 0;
        }
    }

    private function etaLabel(int $etaDays): string
    {
        if ($etaDays < 0) {
            return abs($etaDays) . 'd late';
        }

        if ($etaDays === 0) {
            return 'Today';
        }

        if ($etaDays === 1) {
            return 'Tomorrow';
        }

        return $etaDays . 'd';
    }

    private function containsCustomsHold(object $row): bool
    {
        $text = strtolower(implode(' ', [
            (string) ($row->comments ?? ''),
            (string) ($row->stat_comment ?? ''),
            (string) ($row->deliveryby ?? ''),
            (string) ($row->vessel ?? ''),
            (string) ($row->voyageref ?? ''),
        ]));

        return str_contains($text, 'customs')
            || str_contains($text, 'clearance')
            || str_contains($text, 'port hold')
            || str_contains($text, 'border hold');
    }

    private function currency(string $value): string
    {
        $currency = strtoupper(trim($value));
        return $currency === 'USD' ? 'USD' : 'TZS';
    }

    private function safeLimit($value, int $min, int $max): int
    {
        $limit = (int) $value;
        if ($limit < $min) return $min;
        if ($limit > $max) return $max;
        return $limit;
    }
}
