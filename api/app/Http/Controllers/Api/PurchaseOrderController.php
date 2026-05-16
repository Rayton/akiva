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
