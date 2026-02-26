<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class SalesController extends Controller
{
    public function orders(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 250), 20, 1000);
        $search = trim((string) $request->query('q', ''));

        try {
            $query = DB::table('salesorders as so')
                ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'so.debtorno')
                ->leftJoin('salesorderdetails as sod', 'sod.orderno', '=', 'so.orderno')
                ->select(
                    'so.orderno',
                    'so.debtorno',
                    DB::raw('COALESCE(NULLIF(dm.name, ""), so.deliverto) as customer_name'),
                    'so.customerref',
                    'so.orddate',
                    'so.deliverydate',
                    DB::raw(
                        'COALESCE(SUM((sod.quantity * sod.unitprice) * (1 - (sod.discountpercent / 100))), 0) as gross_total'
                    ),
                    DB::raw(
                        'COUNT(DISTINCT CONCAT(sod.orderno, "-", sod.orderlineno, "-", COALESCE(sod.stkcode, ""))) as line_count'
                    )
                )
                ->groupBy(
                    'so.orderno',
                    'so.debtorno',
                    'dm.name',
                    'so.deliverto',
                    'so.customerref',
                    'so.orddate',
                    'so.deliverydate'
                )
                ->orderByDesc('so.orderno')
                ->limit($limit);

            if ($search !== '') {
                $this->applyOrderSearch($query, $search);
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'orderNo' => (string) $row->orderno,
                        'debtorNo' => (string) $row->debtorno,
                        'customerName' => (string) $row->customer_name,
                        'customerRef' => (string) ($row->customerref ?? ''),
                        'orderDate' => (string) $row->orddate,
                        'deliveryDate' => (string) $row->deliverydate,
                        'grossTotal' => (float) $row->gross_total,
                        'lineCount' => (int) $row->line_count,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function storeOrder(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'debtorNo' => ['required', 'string', 'max:10'],
            'branchCode' => ['nullable', 'string', 'max:10'],
            'customerRef' => ['nullable', 'string', 'max:50'],
            'buyerName' => ['nullable', 'string', 'max:50'],
            'comments' => ['nullable', 'string'],
            'orderDate' => ['nullable', 'date'],
            'deliveryDate' => ['nullable', 'date'],
            'orderType' => ['nullable', 'string', 'size:2'],
            'shipVia' => ['nullable', 'integer', 'min:1'],
            'fromStockLoc' => ['nullable', 'string', 'max:5'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.stockId' => ['required', 'string', 'max:20'],
            'lines.*.quantity' => ['required', 'numeric', 'gt:0'],
            'lines.*.unitPrice' => ['required', 'numeric', 'min:0'],
            'lines.*.discountPercent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lines.*.narrative' => ['nullable', 'string'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();

        try {
            $result = DB::transaction(function () use ($payload) {
                $debtorNo = (string) $payload['debtorNo'];
                $branchCode = isset($payload['branchCode']) ? (string) $payload['branchCode'] : null;
                $branch = $this->resolveBranchForDebtor($debtorNo, $branchCode);

                if (!$branch) {
                    throw new \RuntimeException('No branch found for selected customer.');
                }

                $debtor = DB::table('debtorsmaster')
                    ->where('debtorno', $debtorNo)
                    ->select('debtorno', 'name', 'salestype')
                    ->first();

                if (!$debtor) {
                    throw new \RuntimeException('Customer not found.');
                }

                $orderNo = $this->nextTypeNumber(30, 'Sales Order');
                $today = Carbon::today()->toDateString();
                $orderDate = isset($payload['orderDate']) ? Carbon::parse($payload['orderDate'])->toDateString() : $today;
                $deliveryDate = isset($payload['deliveryDate'])
                    ? Carbon::parse($payload['deliveryDate'])->toDateString()
                    : $orderDate;

                $preferredShipper = isset($payload['shipVia']) ? (int) $payload['shipVia'] : (int) $branch->defaultshipvia;
                $shipperId = $this->resolveShipperId($preferredShipper);
                $preferredLoc = isset($payload['fromStockLoc']) ? (string) $payload['fromStockLoc'] : (string) $branch->defaultlocation;
                $fromStockLoc = $this->resolveLocationCode($preferredLoc);
                $orderType = isset($payload['orderType']) && $payload['orderType'] !== ''
                    ? strtoupper((string) $payload['orderType'])
                    : (string) ($debtor->salestype ?: 'RE');

                DB::table('salesorders')->insert([
                    'orderno' => $orderNo,
                    'debtorno' => $debtorNo,
                    'branchcode' => (string) $branch->branchcode,
                    'customerref' => (string) ($payload['customerRef'] ?? ''),
                    'buyername' => ($payload['buyerName'] ?? null) ?: null,
                    'comments' => (string) ($payload['comments'] ?? ''),
                    'orddate' => $orderDate,
                    'ordertype' => $orderType,
                    'shipvia' => $shipperId,
                    'deladd1' => (string) ($branch->braddress1 ?? ''),
                    'deladd2' => (string) ($branch->braddress2 ?? ''),
                    'deladd3' => (string) ($branch->braddress3 ?? ''),
                    'deladd4' => (string) ($branch->braddress4 ?? ''),
                    'deladd5' => (string) ($branch->braddress5 ?? ''),
                    'deladd6' => (string) ($branch->braddress6 ?? ''),
                    'contactphone' => (string) ($branch->phoneno ?? ''),
                    'contactemail' => (string) ($branch->email ?? ''),
                    'deliverto' => (string) ($branch->brname ?? $debtor->name),
                    'deliverblind' => (int) ($branch->deliverblind ?? 1),
                    'freightcost' => 0,
                    'fromstkloc' => $fromStockLoc,
                    'deliverydate' => $deliveryDate,
                    'confirmeddate' => $orderDate,
                    'printedpackingslip' => 0,
                    'datepackingslipprinted' => '0000-00-00',
                    'quotation' => 0,
                    'quotedate' => $orderDate,
                    'poplaced' => 0,
                    'salesperson' => ($branch->salesman ?? null) ?: null,
                    'internalcomment' => null,
                ]);

                $lines = $payload['lines'];
                $stockIds = array_values(array_unique(array_map(static function ($line) {
                    return (string) $line['stockId'];
                }, $lines)));

                $stockRows = DB::table('stockmaster')
                    ->whereIn('stockid', $stockIds)
                    ->select('stockid', 'units', 'decimalplaces')
                    ->get()
                    ->keyBy('stockid');

                foreach ($lines as $index => $line) {
                    $stockId = (string) $line['stockId'];
                    if (!$stockRows->has($stockId)) {
                        throw new \RuntimeException('Stock item not found: ' . $stockId);
                    }
                    $stock = $stockRows->get($stockId);

                    DB::table('salesorderdetails')->insert([
                        'orderlineno' => $index,
                        'orderno' => $orderNo,
                        'stkcode' => $stockId,
                        'qtyinvoiced' => 0,
                        'unitprice' => (float) $line['unitPrice'],
                        'units' => (string) ($stock->units ?: 'each'),
                        'conversionfactor' => 1,
                        'decimalplaces' => (int) ($stock->decimalplaces ?? 0),
                        'pricedecimals' => 2,
                        'quantity' => (float) $line['quantity'],
                        'estimate' => 0,
                        'discountpercent' => (float) ($line['discountPercent'] ?? 0),
                        'actualdispatchdate' => '0000-00-00 00:00:00',
                        'completed' => 0,
                        'narrative' => (string) ($line['narrative'] ?? ''),
                        'itemdue' => $deliveryDate,
                        'poline' => '',
                        'commissionrate' => 0,
                        'commissionearned' => 0,
                    ]);
                }

                return [
                    'orderNo' => $orderNo,
                    'debtorNo' => $debtorNo,
                    'branchCode' => (string) $branch->branchcode,
                    'deliveryDate' => $deliveryDate,
                ];
            }, 5);

            return response()->json([
                'success' => true,
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function customers(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 50), 10, 200);
        $search = trim((string) $request->query('q', ''));

        try {
            $query = DB::table('custbranch as cb')
                ->join('debtorsmaster as dm', 'dm.debtorno', '=', 'cb.debtorno')
                ->select(
                    'dm.debtorno',
                    'dm.name as customer_name',
                    'cb.branchcode',
                    'cb.brname',
                    'cb.phoneno',
                    'cb.email',
                    'dm.salestype',
                    'dm.paymentterms',
                    'cb.defaultlocation',
                    'cb.defaultshipvia'
                )
                ->orderBy('dm.name')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('dm.debtorno', 'like', $like)
                        ->orWhere('dm.name', 'like', $like)
                        ->orWhere('cb.branchcode', 'like', $like)
                        ->orWhere('cb.brname', 'like', $like);
                });
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'debtorNo' => (string) $row->debtorno,
                        'customerName' => (string) $row->customer_name,
                        'branchCode' => (string) $row->branchcode,
                        'branchName' => (string) ($row->brname ?? ''),
                        'phone' => (string) ($row->phoneno ?? ''),
                        'email' => (string) ($row->email ?? ''),
                        'salesType' => (string) ($row->salestype ?? ''),
                        'paymentTerms' => (string) ($row->paymentterms ?? ''),
                        'defaultLocation' => (string) ($row->defaultlocation ?? ''),
                        'defaultShipperId' => (int) ($row->defaultshipvia ?? 0),
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function items(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 80), 20, 300);
        $search = trim((string) $request->query('q', ''));
        $salesType = trim((string) $request->query('salesType', ''));

        try {
            $query = DB::table('stockmaster as sm')
                ->leftJoin('prices as p', function ($join) use ($salesType) {
                    $join->on('p.stockid', '=', 'sm.stockid')
                        ->where('p.debtorno', '=', '')
                        ->whereDate('p.startdate', '<=', DB::raw('CURDATE()'))
                        ->whereDate('p.enddate', '>=', DB::raw('CURDATE()'));

                    if ($salesType !== '') {
                        $join->where('p.typeabbrev', '=', strtoupper($salesType));
                    }
                })
                ->select(
                    'sm.stockid',
                    'sm.description',
                    'sm.units',
                    'sm.materialcost',
                    'sm.lastcost',
                    DB::raw('COALESCE(MAX(p.typeabbrev), "RE") as sales_type'),
                    DB::raw('COALESCE(MAX(p.price), sm.materialcost, sm.lastcost, 0) as unit_price')
                )
                ->groupBy('sm.stockid', 'sm.description', 'sm.units', 'sm.materialcost', 'sm.lastcost')
                ->orderBy('sm.stockid')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('sm.stockid', 'like', $like)
                        ->orWhere('sm.description', 'like', $like);
                });
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'stockId' => (string) $row->stockid,
                        'description' => (string) ($row->description ?? $row->stockid),
                        'units' => (string) ($row->units ?? 'each'),
                        'salesType' => (string) ($row->sales_type ?? 'RE'),
                        'price' => (float) $row->unit_price,
                        'materialCost' => (float) ($row->materialcost ?? 0),
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function transactions(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 250), 20, 1000);
        $search = trim((string) $request->query('q', ''));

        try {
            $query = DB::table('debtortrans as dt')
                ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'dt.debtorno')
                ->select(
                    'dt.transno',
                    'dt.type',
                    'dt.debtorno',
                    DB::raw('COALESCE(NULLIF(dm.name, ""), dt.debtorno) as customer_name'),
                    'dt.reference',
                    'dt.order_',
                    'dt.trandate',
                    'dt.settled',
                    DB::raw('(dt.ovamount + dt.ovgst + dt.ovfreight - dt.ovdiscount) as gross_total')
                )
                ->orderByDesc('dt.trandate')
                ->orderByDesc('dt.transno')
                ->limit($limit);

            if ($search !== '') {
                $query->where(function ($builder) use ($search) {
                    $like = '%' . $search . '%';
                    $builder
                        ->where('dt.debtorno', 'like', $like)
                        ->orWhere('dm.name', 'like', $like)
                        ->orWhere('dt.reference', 'like', $like)
                        ->orWhere('dt.order_', 'like', $like)
                        ->orWhere('dt.transno', 'like', $like);
                });
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'transNo' => (string) $row->transno,
                        'transType' => (int) $row->type,
                        'debtorNo' => (string) $row->debtorno,
                        'customerName' => (string) $row->customer_name,
                        'reference' => (string) ($row->reference ?? ''),
                        'orderNo' => (string) ($row->order_ ?? ''),
                        'transactionDate' => (string) $row->trandate,
                        'grossTotal' => (float) $row->gross_total,
                        'settled' => (int) $row->settled === 1,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function outstandingOrders(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 120), 20, 500);
        $search = trim((string) $request->query('q', ''));

        try {
            $query = DB::table('salesorders as so')
                ->join('salesorderdetails as sod', 'sod.orderno', '=', 'so.orderno')
                ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'so.debtorno')
                ->select(
                    'so.orderno',
                    'so.debtorno',
                    DB::raw('COALESCE(NULLIF(dm.name, ""), so.deliverto) as customer_name'),
                    'so.orddate',
                    'so.deliverydate',
                    DB::raw('COUNT(*) as line_count'),
                    DB::raw('SUM(CASE WHEN sod.completed = 0 OR sod.qtyinvoiced < sod.quantity THEN 1 ELSE 0 END) as outstanding_lines'),
                    DB::raw('SUM(GREATEST(sod.quantity - sod.qtyinvoiced, 0)) as outstanding_qty'),
                    DB::raw('SUM((sod.quantity * sod.unitprice) * (1 - (sod.discountpercent / 100))) as gross_total')
                )
                ->groupBy('so.orderno', 'so.debtorno', 'dm.name', 'so.deliverto', 'so.orddate', 'so.deliverydate')
                ->havingRaw('outstanding_lines > 0')
                ->orderByDesc('so.orderno')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('so.orderno', 'like', $like)
                        ->orWhere('so.debtorno', 'like', $like)
                        ->orWhere('dm.name', 'like', $like)
                        ->orWhere('so.deliverto', 'like', $like);
                });
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'orderNo' => (string) $row->orderno,
                        'debtorNo' => (string) $row->debtorno,
                        'customerName' => (string) $row->customer_name,
                        'orderDate' => (string) $row->orddate,
                        'deliveryDate' => (string) $row->deliverydate,
                        'lineCount' => (int) $row->line_count,
                        'outstandingLines' => (int) $row->outstanding_lines,
                        'outstandingQty' => (float) $row->outstanding_qty,
                        'grossTotal' => (float) $row->gross_total,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function pickingLists(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 120), 20, 500);
        $search = trim((string) $request->query('q', ''));

        try {
            $query = DB::table('salesorders as so')
                ->join('salesorderdetails as sod', 'sod.orderno', '=', 'so.orderno')
                ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'so.debtorno')
                ->select(
                    'so.orderno',
                    'so.debtorno',
                    DB::raw('COALESCE(NULLIF(dm.name, ""), so.deliverto) as customer_name'),
                    'so.fromstkloc',
                    'so.orddate',
                    DB::raw('COALESCE(MIN(sod.itemdue), so.deliverydate) as due_date'),
                    DB::raw('SUM(GREATEST(sod.quantity - sod.qtyinvoiced, 0)) as open_qty')
                )
                ->groupBy('so.orderno', 'so.debtorno', 'dm.name', 'so.deliverto', 'so.fromstkloc', 'so.orddate', 'so.deliverydate')
                ->havingRaw('open_qty > 0')
                ->orderBy('due_date')
                ->orderByDesc('so.orderno')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('so.orderno', 'like', $like)
                        ->orWhere('so.debtorno', 'like', $like)
                        ->orWhere('dm.name', 'like', $like)
                        ->orWhere('so.fromstkloc', 'like', $like);
                });
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'orderNo' => (string) $row->orderno,
                        'debtorNo' => (string) $row->debtorno,
                        'customerName' => (string) $row->customer_name,
                        'locationCode' => (string) ($row->fromstkloc ?? ''),
                        'orderDate' => (string) $row->orddate,
                        'dueDate' => (string) ($row->due_date ?? $row->orddate),
                        'openQty' => (float) $row->open_qty,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function recurringTemplates(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 120), 20, 500);
        $search = trim((string) $request->query('q', ''));

        try {
            $query = DB::table('recurringsalesorders as rso')
                ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'rso.debtorno')
                ->leftJoin('recurrsalesorderdetails as rsod', 'rsod.recurrorderno', '=', 'rso.recurrorderno')
                ->select(
                    'rso.recurrorderno',
                    'rso.debtorno',
                    DB::raw('COALESCE(NULLIF(dm.name, ""), rso.deliverto) as customer_name'),
                    'rso.branchcode',
                    'rso.orddate',
                    'rso.lastrecurrence',
                    'rso.stopdate',
                    'rso.frequency',
                    'rso.autoinvoice',
                    DB::raw('COUNT(rsod.stkcode) as line_count')
                )
                ->groupBy(
                    'rso.recurrorderno',
                    'rso.debtorno',
                    'dm.name',
                    'rso.deliverto',
                    'rso.branchcode',
                    'rso.orddate',
                    'rso.lastrecurrence',
                    'rso.stopdate',
                    'rso.frequency',
                    'rso.autoinvoice'
                )
                ->orderBy('rso.recurrorderno')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('rso.recurrorderno', 'like', $like)
                        ->orWhere('rso.debtorno', 'like', $like)
                        ->orWhere('dm.name', 'like', $like)
                        ->orWhere('rso.branchcode', 'like', $like);
                });
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'recurringOrderNo' => (int) $row->recurrorderno,
                        'debtorNo' => (string) $row->debtorno,
                        'customerName' => (string) $row->customer_name,
                        'branchCode' => (string) $row->branchcode,
                        'orderDate' => (string) $row->orddate,
                        'lastRecurrence' => (string) $row->lastrecurrence,
                        'stopDate' => (string) $row->stopdate,
                        'frequencyDays' => (int) $row->frequency,
                        'autoInvoice' => (int) $row->autoinvoice === 1,
                        'lineCount' => (int) $row->line_count,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function processRecurring(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'templateIds' => ['nullable', 'array'],
            'templateIds.*' => ['integer', 'min:1'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $templateIds = $request->input('templateIds', []);
        $today = Carbon::today()->toDateString();

        try {
            $templatesQuery = DB::table('recurringsalesorders as rso')
                ->where(function ($builder) use ($today) {
                    $builder
                        ->where('rso.stopdate', '=', '0000-00-00')
                        ->orWhere('rso.stopdate', '>=', $today);
                })
                ->whereRaw('DATE_ADD(rso.lastrecurrence, INTERVAL rso.frequency DAY) <= ?', [$today]);

            if (is_array($templateIds) && count($templateIds) > 0) {
                $templatesQuery->whereIn('rso.recurrorderno', $templateIds);
            }

            $templates = $templatesQuery->get();
            $createdOrders = [];
            $skippedTemplates = [];

            foreach ($templates as $template) {
                $details = DB::table('recurrsalesorderdetails')
                    ->where('recurrorderno', $template->recurrorderno)
                    ->orderBy('stkcode')
                    ->get();

                if ($details->isEmpty()) {
                    $skippedTemplates[] = (int) $template->recurrorderno;
                    continue;
                }

                try {
                    $orderNo = DB::transaction(function () use ($template, $details, $today) {
                        $createdOrderNo = $this->createSalesOrderFromRecurring($template, $details, $today);

                        DB::table('recurringsalesorders')
                            ->where('recurrorderno', $template->recurrorderno)
                            ->update(['lastrecurrence' => $today]);

                        return $createdOrderNo;
                    }, 5);

                    $createdOrders[] = $orderNo;
                } catch (\Throwable $templateError) {
                    report($templateError);
                    $skippedTemplates[] = (int) $template->recurrorderno;
                }
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'createdOrders' => $createdOrders,
                    'skippedTemplates' => array_values(array_unique($skippedTemplates)),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function reportSummary(Request $request)
    {
        $months = $this->safeLimit($request->query('months', 12), 1, 36);

        try {
            $monthlyRows = DB::table('debtortrans')
                ->select(
                    DB::raw("DATE_FORMAT(trandate, '%Y-%m') as month_key"),
                    DB::raw('COUNT(*) as invoice_count'),
                    DB::raw('SUM(ovamount + ovgst + ovfreight - ovdiscount) as gross_total')
                )
                ->where('type', 10)
                ->whereRaw('trandate >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)', [$months])
                ->groupBy('month_key')
                ->orderBy('month_key', 'desc')
                ->get();

            $topCustomers = DB::table('debtortrans as dt')
                ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'dt.debtorno')
                ->select(
                    'dt.debtorno',
                    DB::raw('COALESCE(NULLIF(dm.name, ""), dt.debtorno) as customer_name'),
                    DB::raw('COUNT(*) as invoice_count'),
                    DB::raw('SUM(dt.ovamount + dt.ovgst + dt.ovfreight - dt.ovdiscount) as gross_total')
                )
                ->where('dt.type', 10)
                ->whereRaw('dt.trandate >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)', [$months])
                ->groupBy('dt.debtorno', 'dm.name')
                ->orderByDesc('gross_total')
                ->limit(10)
                ->get();

            return response()->json([
                'success' => true,
                'data' => [
                    'monthly' => $monthlyRows->map(function ($row) {
                        return [
                            'month' => (string) $row->month_key,
                            'invoiceCount' => (int) $row->invoice_count,
                            'grossTotal' => (float) $row->gross_total,
                        ];
                    }),
                    'topCustomers' => $topCustomers->map(function ($row) {
                        return [
                            'debtorNo' => (string) $row->debtorno,
                            'customerName' => (string) $row->customer_name,
                            'invoiceCount' => (int) $row->invoice_count,
                            'grossTotal' => (float) $row->gross_total,
                        ];
                    }),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [
                    'monthly' => [],
                    'topCustomers' => [],
                ],
            ]);
        }
    }

    public function reportPriceList(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 200), 20, 600);

        try {
            $rows = DB::table('prices as p')
                ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'p.stockid')
                ->select(
                    'p.stockid',
                    DB::raw('COALESCE(NULLIF(sm.description, ""), p.stockid) as description'),
                    'p.typeabbrev',
                    'p.currabrev',
                    DB::raw('MAX(p.price) as unit_price'),
                    DB::raw('MAX(p.units) as units')
                )
                ->whereDate('p.startdate', '<=', DB::raw('CURDATE()'))
                ->whereDate('p.enddate', '>=', DB::raw('CURDATE()'))
                ->groupBy('p.stockid', 'sm.description', 'p.typeabbrev', 'p.currabrev')
                ->orderBy('p.stockid')
                ->limit($limit)
                ->get();

            if ($rows->isEmpty()) {
                $rows = DB::table('stockmaster as sm')
                    ->select(
                        'sm.stockid',
                        'sm.description',
                        DB::raw('"RE" as typeabbrev'),
                        DB::raw('"TZS" as currabrev'),
                        DB::raw('COALESCE(sm.materialcost, sm.lastcost, 0) as unit_price'),
                        DB::raw('COALESCE(NULLIF(sm.units, ""), "each") as units')
                    )
                    ->orderBy('sm.stockid')
                    ->limit($limit)
                    ->get();
            }

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'stockId' => (string) $row->stockid,
                        'description' => (string) ($row->description ?? $row->stockid),
                        'salesType' => (string) ($row->typeabbrev ?? 'RE'),
                        'currency' => (string) ($row->currabrev ?? 'TZS'),
                        'unitPrice' => (float) $row->unit_price,
                        'units' => (string) ($row->units ?? 'each'),
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function reportOrderStatus(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 120), 20, 600);
        $search = trim((string) $request->query('q', ''));

        try {
            $query = DB::table('salesorders as so')
                ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'so.debtorno')
                ->leftJoin('salesorderdetails as sod', 'sod.orderno', '=', 'so.orderno')
                ->select(
                    'so.orderno',
                    'so.debtorno',
                    DB::raw('COALESCE(NULLIF(dm.name, ""), so.deliverto) as customer_name'),
                    'so.orddate',
                    'so.deliverydate',
                    DB::raw('COUNT(sod.stkcode) as line_count'),
                    DB::raw('SUM(CASE WHEN sod.completed = 1 OR sod.qtyinvoiced >= sod.quantity THEN 1 ELSE 0 END) as completed_lines'),
                    DB::raw('COALESCE(SUM((sod.quantity * sod.unitprice) * (1 - (sod.discountpercent / 100))), 0) as gross_total')
                )
                ->groupBy('so.orderno', 'so.debtorno', 'dm.name', 'so.deliverto', 'so.orddate', 'so.deliverydate')
                ->orderByDesc('so.orderno')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('so.orderno', 'like', $like)
                        ->orWhere('so.debtorno', 'like', $like)
                        ->orWhere('dm.name', 'like', $like)
                        ->orWhere('so.deliverto', 'like', $like);
                });
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'orderNo' => (string) $row->orderno,
                        'debtorNo' => (string) $row->debtorno,
                        'customerName' => (string) $row->customer_name,
                        'orderDate' => (string) $row->orddate,
                        'deliveryDate' => (string) $row->deliverydate,
                        'lineCount' => (int) $row->line_count,
                        'completedLines' => (int) $row->completed_lines,
                        'grossTotal' => (float) $row->gross_total,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function reportDailyInquiry(Request $request)
    {
        $days = $this->safeLimit($request->query('days', 30), 1, 365);

        try {
            $rows = DB::table('debtortrans')
                ->select(
                    DB::raw('DATE(trandate) as day_key'),
                    DB::raw('COUNT(*) as invoice_count'),
                    DB::raw('SUM(ovamount + ovgst + ovfreight - ovdiscount) as gross_total')
                )
                ->where('type', 10)
                ->whereRaw('trandate >= DATE_SUB(CURDATE(), INTERVAL ? DAY)', [$days])
                ->groupBy('day_key')
                ->orderBy('day_key', 'desc')
                ->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'day' => (string) $row->day_key,
                        'invoiceCount' => (int) $row->invoice_count,
                        'grossTotal' => (float) $row->gross_total,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function reportTopItems(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 20), 5, 200);

        try {
            $rows = DB::table('salesorderdetails as sod')
                ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'sod.stkcode')
                ->select(
                    'sod.stkcode',
                    DB::raw('COALESCE(NULLIF(sm.description, ""), sod.stkcode) as description'),
                    DB::raw('SUM(sod.quantity) as total_qty'),
                    DB::raw('SUM((sod.quantity * sod.unitprice) * (1 - (sod.discountpercent / 100))) as gross_total')
                )
                ->groupBy('sod.stkcode', 'sm.description')
                ->havingRaw('SUM(sod.quantity) > 0')
                ->orderByDesc('gross_total')
                ->limit($limit)
                ->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'stockId' => (string) $row->stkcode,
                        'description' => (string) $row->description,
                        'quantity' => (float) $row->total_qty,
                        'grossTotal' => (float) $row->gross_total,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function reportLowGross(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 20), 5, 200);

        try {
            $rows = DB::table('salesorderdetails as sod')
                ->join('salesorders as so', 'so.orderno', '=', 'sod.orderno')
                ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'sod.stkcode')
                ->select(
                    'so.orderno',
                    'sod.stkcode',
                    DB::raw('COALESCE(NULLIF(sm.description, ""), sod.stkcode) as description'),
                    'sod.unitprice',
                    DB::raw('COALESCE(sm.materialcost, 0) as material_cost'),
                    DB::raw('CASE WHEN sod.unitprice = 0 THEN 0 ELSE ROUND(((sod.unitprice - COALESCE(sm.materialcost, 0)) / sod.unitprice) * 100, 2) END as gross_margin_pct')
                )
                ->where('sod.quantity', '>', 0)
                ->orderBy('gross_margin_pct')
                ->limit($limit)
                ->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    return [
                        'orderNo' => (string) $row->orderno,
                        'stockId' => (string) $row->stkcode,
                        'description' => (string) $row->description,
                        'unitPrice' => (float) $row->unitprice,
                        'materialCost' => (float) $row->material_cost,
                        'grossMarginPct' => (float) $row->gross_margin_pct,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function contractLookups()
    {
        try {
            $customers = DB::table('custbranch as cb')
                ->join('debtorsmaster as dm', 'dm.debtorno', '=', 'cb.debtorno')
                ->select(
                    'dm.debtorno',
                    'dm.name as customer_name',
                    'dm.currcode',
                    'cb.branchcode',
                    'cb.brname',
                    'cb.defaultlocation',
                    'cb.defaultshipvia'
                )
                ->orderBy('dm.name')
                ->orderBy('cb.branchcode')
                ->limit(400)
                ->get();

            $categories = DB::table('stockcategory')
                ->select('categoryid', 'categorydescription')
                ->orderBy('categoryid')
                ->get();

            $locations = DB::table('locations')
                ->select('loccode', 'locationname')
                ->orderBy('loccode')
                ->get();

            $workCentres = DB::table('workcentres')
                ->select('code', 'location', 'description')
                ->orderBy('location')
                ->orderBy('code')
                ->get();

            return response()->json([
                'success' => true,
                'data' => [
                    'customers' => $customers->map(function ($row) {
                        return [
                            'debtorNo' => (string) $row->debtorno,
                            'customerName' => (string) ($row->customer_name ?? ''),
                            'currencyCode' => (string) ($row->currcode ?? ''),
                            'branchCode' => (string) $row->branchcode,
                            'branchName' => (string) ($row->brname ?? ''),
                            'defaultLocation' => (string) ($row->defaultlocation ?? ''),
                            'defaultShipperId' => (int) ($row->defaultshipvia ?? 0),
                        ];
                    }),
                    'categories' => $categories->map(function ($row) {
                        return [
                            'categoryId' => (string) $row->categoryid,
                            'categoryDescription' => (string) ($row->categorydescription ?? $row->categoryid),
                        ];
                    }),
                    'locations' => $locations->map(function ($row) {
                        return [
                            'locationCode' => (string) $row->loccode,
                            'locationName' => (string) ($row->locationname ?? $row->loccode),
                        ];
                    }),
                    'workCentres' => $workCentres->map(function ($row) {
                        return [
                            'workCentreCode' => (string) $row->code,
                            'locationCode' => (string) $row->location,
                            'description' => (string) ($row->description ?? $row->code),
                        ];
                    }),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [
                    'customers' => [],
                    'categories' => [],
                    'locations' => [],
                    'workCentres' => [],
                ],
            ]);
        }
    }

    public function contracts(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 200), 20, 800);
        $status = trim((string) $request->query('status', '4'));
        $search = trim((string) $request->query('q', ''));
        $debtorNo = trim((string) $request->query('debtorNo', ''));

        try {
            $query = DB::table('contracts as c')
                ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'c.debtorno')
                ->leftJoin('custbranch as cb', function ($join) {
                    $join
                        ->on('cb.debtorno', '=', 'c.debtorno')
                        ->on('cb.branchcode', '=', 'c.branchcode');
                })
                ->leftJoin('locations as l', 'l.loccode', '=', 'c.loccode')
                ->select(
                    'c.contractref',
                    'c.contractdescription',
                    'c.debtorno',
                    'c.branchcode',
                    DB::raw('COALESCE(NULLIF(dm.name, ""), c.debtorno) as customer_name'),
                    DB::raw('COALESCE(cb.brname, c.branchcode) as branch_name'),
                    'c.loccode',
                    DB::raw('COALESCE(l.locationname, c.loccode) as location_name'),
                    'c.status',
                    'c.orderno',
                    'c.wo',
                    'c.margin',
                    'c.requireddate',
                    'c.customerref',
                    'c.exrate',
                    DB::raw(
                        '(SELECT COALESCE(SUM((sm.materialcost + sm.labourcost + sm.overheadcost) * bom.quantity), 0)
                            FROM contractbom bom
                            INNER JOIN stockmaster sm ON sm.stockid = bom.stockid
                            WHERE bom.contractref = c.contractref) as bom_cost'
                    ),
                    DB::raw(
                        '(SELECT COALESCE(SUM(req.quantity * req.costperunit), 0)
                            FROM contractreqts req
                            WHERE req.contractref = c.contractref) as req_cost'
                    )
                )
                ->orderByDesc('c.requireddate')
                ->orderByDesc('c.contractref')
                ->limit($limit);

            if ($status !== '' && $status !== '4') {
                $query->where('c.status', (int) $status);
            }

            if ($debtorNo !== '') {
                $query->where('c.debtorno', $debtorNo);
            }

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('c.contractref', 'like', $like)
                        ->orWhere('c.contractdescription', 'like', $like)
                        ->orWhere('c.debtorno', 'like', $like)
                        ->orWhere('dm.name', 'like', $like)
                        ->orWhere('c.customerref', 'like', $like)
                        ->orWhere('c.orderno', 'like', $like)
                        ->orWhere('c.wo', 'like', $like);
                });
            }

            $rows = $query->get();

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) {
                    $bomCost = (float) ($row->bom_cost ?? 0);
                    $reqCost = (float) ($row->req_cost ?? 0);
                    $totalCost = $bomCost + $reqCost;
                    $margin = (float) ($row->margin ?? 0);
                    $quotedPrice = $margin >= 100 ? $totalCost : $totalCost / max(0.0001, (1 - ($margin / 100)));

                    return [
                        'contractRef' => (string) $row->contractref,
                        'contractDescription' => (string) ($row->contractdescription ?? ''),
                        'debtorNo' => (string) $row->debtorno,
                        'branchCode' => (string) $row->branchcode,
                        'customerName' => (string) $row->customer_name,
                        'branchName' => (string) $row->branch_name,
                        'locationCode' => (string) $row->loccode,
                        'locationName' => (string) $row->location_name,
                        'status' => (int) $row->status,
                        'statusLabel' => $this->contractStatusLabel((int) $row->status),
                        'orderNo' => (int) ($row->orderno ?? 0),
                        'workOrderNo' => (int) ($row->wo ?? 0),
                        'margin' => $margin,
                        'requiredDate' => (string) $row->requireddate,
                        'customerRef' => (string) ($row->customerref ?? ''),
                        'exchangeRate' => (float) ($row->exrate ?? 1),
                        'bomCost' => $bomCost,
                        'requirementsCost' => $reqCost,
                        'totalCost' => $totalCost,
                        'quotedPrice' => $quotedPrice,
                    ];
                }),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    public function contractDetail(string $contractRef)
    {
        try {
            $contract = $this->loadContractDetail($contractRef);
            if (!$contract) {
                return response()->json([
                    'success' => false,
                    'message' => 'Contract not found.',
                ], 404);
            }

            return response()->json([
                'success' => true,
                'data' => $contract,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function createContract(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'contractRef' => ['required', 'string', 'max:20', 'regex:/^[A-Za-z0-9_-]+$/'],
            'contractDescription' => ['required', 'string', 'min:5'],
            'debtorNo' => ['required', 'string', 'max:10'],
            'branchCode' => ['required', 'string', 'max:10'],
            'categoryId' => ['required', 'string', 'max:6'],
            'locationCode' => ['required', 'string', 'max:5'],
            'requiredDate' => ['required', 'date'],
            'margin' => ['required', 'numeric', 'min:0', 'max:99.99'],
            'customerRef' => ['nullable', 'string', 'max:20'],
            'exchangeRate' => ['nullable', 'numeric', 'gt:0'],
            'defaultWorkCentre' => ['nullable', 'string', 'max:5'],
            'bomLines' => ['nullable', 'array'],
            'bomLines.*.stockId' => ['required', 'string', 'max:20'],
            'bomLines.*.quantity' => ['required', 'numeric', 'gt:0'],
            'bomLines.*.workCentreCode' => ['nullable', 'string', 'max:5'],
            'requirementLines' => ['nullable', 'array'],
            'requirementLines.*.requirement' => ['required', 'string', 'max:40'],
            'requirementLines.*.quantity' => ['required', 'numeric', 'gt:0'],
            'requirementLines.*.costPerUnit' => ['required', 'numeric', 'min:0'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();

        try {
            $contractRef = DB::transaction(function () use ($payload) {
                $contractRef = trim((string) $payload['contractRef']);
                $existing = DB::table('contracts')->where('contractref', $contractRef)->exists();
                if ($existing) {
                    throw new \RuntimeException('Contract reference already exists.');
                }

                $stockConflict = DB::table('stockmaster')->where('stockid', $contractRef)->exists();
                if ($stockConflict) {
                    throw new \RuntimeException(
                        'Contract reference conflicts with an existing stock item code.'
                    );
                }

                $this->assertContractParentRowsExist(
                    (string) $payload['debtorNo'],
                    (string) $payload['branchCode'],
                    (string) $payload['categoryId'],
                    (string) $payload['locationCode']
                );

                $exchangeRate = isset($payload['exchangeRate'])
                    ? (float) $payload['exchangeRate']
                    : $this->resolveCustomerExchangeRate((string) $payload['debtorNo']);

                DB::table('contracts')->insert([
                    'contractref' => $contractRef,
                    'contractdescription' => (string) $payload['contractDescription'],
                    'debtorno' => (string) $payload['debtorNo'],
                    'branchcode' => (string) $payload['branchCode'],
                    'loccode' => (string) $payload['locationCode'],
                    'status' => 0,
                    'categoryid' => (string) $payload['categoryId'],
                    'orderno' => 0,
                    'customerref' => (string) ($payload['customerRef'] ?? ''),
                    'margin' => (float) $payload['margin'],
                    'wo' => 0,
                    'requireddate' => Carbon::parse((string) $payload['requiredDate'])->toDateString(),
                    'drawing' => '',
                    'exrate' => $exchangeRate,
                ]);

                $this->replaceContractLines(
                    $contractRef,
                    is_array($payload['bomLines'] ?? null) ? $payload['bomLines'] : [],
                    is_array($payload['requirementLines'] ?? null) ? $payload['requirementLines'] : [],
                    (string) $payload['locationCode'],
                    (string) ($payload['defaultWorkCentre'] ?? '')
                );

                return $contractRef;
            }, 5);

            return response()->json([
                'success' => true,
                'data' => $this->loadContractDetail($contractRef),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function updateContract(Request $request, string $contractRef)
    {
        $validator = Validator::make($request->all(), [
            'contractDescription' => ['required', 'string', 'min:5'],
            'debtorNo' => ['required', 'string', 'max:10'],
            'branchCode' => ['required', 'string', 'max:10'],
            'categoryId' => ['required', 'string', 'max:6'],
            'locationCode' => ['required', 'string', 'max:5'],
            'requiredDate' => ['required', 'date'],
            'margin' => ['required', 'numeric', 'min:0', 'max:99.99'],
            'customerRef' => ['nullable', 'string', 'max:20'],
            'exchangeRate' => ['nullable', 'numeric', 'gt:0'],
            'defaultWorkCentre' => ['nullable', 'string', 'max:5'],
            'bomLines' => ['nullable', 'array'],
            'bomLines.*.stockId' => ['required', 'string', 'max:20'],
            'bomLines.*.quantity' => ['required', 'numeric', 'gt:0'],
            'bomLines.*.workCentreCode' => ['nullable', 'string', 'max:5'],
            'requirementLines' => ['nullable', 'array'],
            'requirementLines.*.requirement' => ['required', 'string', 'max:40'],
            'requirementLines.*.quantity' => ['required', 'numeric', 'gt:0'],
            'requirementLines.*.costPerUnit' => ['required', 'numeric', 'min:0'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();
        $normalizedRef = trim($contractRef);

        try {
            DB::transaction(function () use ($normalizedRef, $payload) {
                $contract = DB::table('contracts')->where('contractref', $normalizedRef)->lockForUpdate()->first();
                if (!$contract) {
                    throw new \RuntimeException('Contract not found.');
                }

                if ((int) $contract->status >= 2) {
                    throw new \RuntimeException('Ordered or completed contracts cannot be modified.');
                }

                $this->assertContractParentRowsExist(
                    (string) $payload['debtorNo'],
                    (string) $payload['branchCode'],
                    (string) $payload['categoryId'],
                    (string) $payload['locationCode']
                );

                $exchangeRate = isset($payload['exchangeRate'])
                    ? (float) $payload['exchangeRate']
                    : $this->resolveCustomerExchangeRate((string) $payload['debtorNo']);

                DB::table('contracts')
                    ->where('contractref', $normalizedRef)
                    ->update([
                        'contractdescription' => (string) $payload['contractDescription'],
                        'debtorno' => (string) $payload['debtorNo'],
                        'branchcode' => (string) $payload['branchCode'],
                        'loccode' => (string) $payload['locationCode'],
                        'categoryid' => (string) $payload['categoryId'],
                        'customerref' => (string) ($payload['customerRef'] ?? ''),
                        'margin' => (float) $payload['margin'],
                        'requireddate' => Carbon::parse((string) $payload['requiredDate'])->toDateString(),
                        'exrate' => $exchangeRate,
                    ]);

                $this->replaceContractLines(
                    $normalizedRef,
                    is_array($payload['bomLines'] ?? null) ? $payload['bomLines'] : [],
                    is_array($payload['requirementLines'] ?? null) ? $payload['requirementLines'] : [],
                    (string) $payload['locationCode'],
                    (string) ($payload['defaultWorkCentre'] ?? '')
                );
            }, 5);

            return response()->json([
                'success' => true,
                'data' => $this->loadContractDetail($normalizedRef),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function createContractQuotation(string $contractRef)
    {
        $normalizedRef = trim($contractRef);

        try {
            $result = DB::transaction(function () use ($normalizedRef) {
                $contract = DB::table('contracts')->where('contractref', $normalizedRef)->lockForUpdate()->first();
                if (!$contract) {
                    throw new \RuntimeException('Contract not found.');
                }

                if ((int) $contract->status >= 2) {
                    throw new \RuntimeException('Contract is already ordered/completed and cannot be quoted.');
                }

                if ((int) $contract->status === 1 && (int) $contract->orderno > 0) {
                    return [
                        'contractRef' => $normalizedRef,
                        'orderNo' => (int) $contract->orderno,
                        'alreadyQuoted' => true,
                    ];
                }

                $costs = $this->contractCosts($normalizedRef, (float) $contract->margin);
                $this->upsertContractStockItem(
                    $normalizedRef,
                    (string) $contract->contractdescription,
                    (string) $contract->categoryid,
                    (float) $costs['totalCost']
                );
                $this->ensureLocStockForContractItem($normalizedRef);

                $branch = DB::table('custbranch')
                    ->join('debtorsmaster', 'debtorsmaster.debtorno', '=', 'custbranch.debtorno')
                    ->where('custbranch.debtorno', $contract->debtorno)
                    ->where('custbranch.branchcode', $contract->branchcode)
                    ->select(
                        'custbranch.defaultshipvia',
                        'custbranch.brname',
                        'custbranch.braddress1',
                        'custbranch.braddress2',
                        'custbranch.braddress3',
                        'custbranch.braddress4',
                        'custbranch.braddress5',
                        'custbranch.braddress6',
                        'custbranch.phoneno',
                        'custbranch.email',
                        'custbranch.defaultlocation',
                        'debtorsmaster.salestype'
                    )
                    ->first();

                if (!$branch) {
                    throw new \RuntimeException('Customer branch not found for contract quotation.');
                }

                $shipperId = $this->resolveShipperId((int) ($branch->defaultshipvia ?? 0));
                $orderNo = $this->nextTypeNumber(30, 'Sales Order');
                $today = Carbon::today()->toDateString();
                $requiredDate = Carbon::parse((string) $contract->requireddate)->toDateString();
                $unitPrice = (float) $costs['quotedPrice'] * (float) ($contract->exrate ?? 1);
                $fromStockLoc = $this->resolveLocationCode((string) ($contract->loccode ?: $branch->defaultlocation));

                DB::table('salesorders')->insert([
                    'orderno' => $orderNo,
                    'debtorno' => (string) $contract->debtorno,
                    'branchcode' => (string) $contract->branchcode,
                    'customerref' => (string) ($contract->customerref ?? ''),
                    'buyername' => null,
                    'comments' => '',
                    'orddate' => $today,
                    'ordertype' => (string) ($branch->salestype ?: 'RE'),
                    'shipvia' => $shipperId,
                    'deladd1' => (string) ($branch->braddress1 ?? ''),
                    'deladd2' => (string) ($branch->braddress2 ?? ''),
                    'deladd3' => (string) ($branch->braddress3 ?? ''),
                    'deladd4' => (string) ($branch->braddress4 ?? ''),
                    'deladd5' => (string) ($branch->braddress5 ?? ''),
                    'deladd6' => (string) ($branch->braddress6 ?? ''),
                    'contactphone' => (string) ($branch->phoneno ?? ''),
                    'contactemail' => (string) ($branch->email ?? ''),
                    'deliverto' => (string) ($branch->brname ?? ''),
                    'deliverblind' => 1,
                    'freightcost' => 0,
                    'fromstkloc' => $fromStockLoc,
                    'deliverydate' => $requiredDate,
                    'confirmeddate' => $today,
                    'printedpackingslip' => 0,
                    'datepackingslipprinted' => '0000-00-00',
                    'quotation' => 1,
                    'quotedate' => $today,
                    'poplaced' => 0,
                    'salesperson' => null,
                    'internalcomment' => null,
                ]);

                DB::table('salesorderdetails')->insert([
                    'orderlineno' => 0,
                    'orderno' => $orderNo,
                    'stkcode' => $normalizedRef,
                    'qtyinvoiced' => 0,
                    'unitprice' => $unitPrice,
                    'units' => 'each',
                    'conversionfactor' => 1,
                    'decimalplaces' => 0,
                    'pricedecimals' => 2,
                    'quantity' => 1,
                    'estimate' => 0,
                    'discountpercent' => 0,
                    'actualdispatchdate' => '0000-00-00 00:00:00',
                    'completed' => 0,
                    'narrative' => '',
                    'itemdue' => $requiredDate,
                    'poline' => (string) ($contract->customerref ?? ''),
                    'commissionrate' => 0,
                    'commissionearned' => 0,
                ]);

                DB::table('contracts')
                    ->where('contractref', $normalizedRef)
                    ->update([
                        'status' => 1,
                        'orderno' => $orderNo,
                    ]);

                return [
                    'contractRef' => $normalizedRef,
                    'orderNo' => $orderNo,
                    'alreadyQuoted' => false,
                ];
            }, 5);

            return response()->json([
                'success' => true,
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function cancelContract(string $contractRef)
    {
        $normalizedRef = trim($contractRef);

        try {
            $result = DB::transaction(function () use ($normalizedRef) {
                $contract = DB::table('contracts')->where('contractref', $normalizedRef)->lockForUpdate()->first();
                if (!$contract) {
                    throw new \RuntimeException('Contract not found.');
                }

                if ((int) $contract->status === 2) {
                    throw new \RuntimeException('Contract has already been ordered and cannot be cancelled.');
                }

                DB::table('contractbom')->where('contractref', $normalizedRef)->delete();
                DB::table('contractreqts')->where('contractref', $normalizedRef)->delete();

                if ((int) $contract->status === 1 && (int) $contract->orderno > 0) {
                    DB::table('salesorderdetails')->where('orderno', (int) $contract->orderno)->delete();
                    DB::table('salesorders')->where('orderno', (int) $contract->orderno)->where('quotation', 1)->delete();
                }

                DB::table('contracts')->where('contractref', $normalizedRef)->delete();

                return [
                    'contractRef' => $normalizedRef,
                    'cancelled' => true,
                ];
            }, 5);

            return response()->json([
                'success' => true,
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function settings()
    {
        try {
            $salesTypes = DB::table('salestypes')
                ->select('typeabbrev as code', 'sales_type as name')
                ->orderBy('typeabbrev')
                ->get();

            $paymentTerms = DB::table('paymentterms')
                ->select('termsindicator as code', 'terms as name')
                ->orderBy('termsindicator')
                ->get();

            $holdReasons = DB::table('holdreasons')
                ->select('reasoncode as code', 'reasondescription as name', 'dissallowinvoices')
                ->orderBy('reasoncode')
                ->get();

            $salesPeople = DB::table('salesman')
                ->select('salesmancode as code', 'salesmanname as name', 'current')
                ->orderBy('salesmancode')
                ->get();

            return response()->json([
                'success' => true,
                'data' => [
                    'salesTypes' => $salesTypes,
                    'paymentTerms' => $paymentTerms,
                    'holdReasons' => $holdReasons->map(function ($row) {
                        return [
                            'code' => (string) $row->code,
                            'name' => (string) $row->name,
                            'blocksInvoicing' => ((int) $row->dissallowinvoices) === 1,
                        ];
                    }),
                    'salesPeople' => $salesPeople->map(function ($row) {
                        return [
                            'code' => (string) $row->code,
                            'name' => (string) $row->name,
                            'current' => ((int) $row->current) === 1,
                        ];
                    }),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [
                    'salesTypes' => [],
                    'paymentTerms' => [],
                    'holdReasons' => [],
                    'salesPeople' => [],
                ],
            ]);
        }
    }

    private function contractStatusLabel(int $status): string
    {
        if ($status === 0) {
            return 'Not Yet Quoted';
        }
        if ($status === 1) {
            return 'Quoted - No Order Placed';
        }
        if ($status === 2) {
            return 'Order Placed';
        }
        if ($status === 3) {
            return 'Completed';
        }
        return 'Unknown';
    }

    private function loadContractDetail(string $contractRef): ?array
    {
        $header = DB::table('contracts as c')
            ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'c.debtorno')
            ->leftJoin('custbranch as cb', function ($join) {
                $join
                    ->on('cb.debtorno', '=', 'c.debtorno')
                    ->on('cb.branchcode', '=', 'c.branchcode');
            })
            ->leftJoin('locations as l', 'l.loccode', '=', 'c.loccode')
            ->select(
                'c.contractref',
                'c.contractdescription',
                'c.debtorno',
                'c.branchcode',
                DB::raw('COALESCE(NULLIF(dm.name, ""), c.debtorno) as customer_name'),
                DB::raw('COALESCE(cb.brname, c.branchcode) as branch_name'),
                'c.loccode',
                DB::raw('COALESCE(l.locationname, c.loccode) as location_name'),
                'c.status',
                'c.categoryid',
                'c.orderno',
                'c.customerref',
                'c.margin',
                'c.wo',
                'c.requireddate',
                'c.drawing',
                'c.exrate',
                DB::raw('COALESCE(dm.currcode, "") as currency_code')
            )
            ->where('c.contractref', $contractRef)
            ->first();

        if (!$header) {
            return null;
        }

        $bomLines = DB::table('contractbom as cb')
            ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'cb.stockid')
            ->select(
                'cb.stockid',
                'cb.workcentreadded',
                'cb.quantity',
                DB::raw('COALESCE(NULLIF(sm.description, ""), cb.stockid) as description'),
                DB::raw('COALESCE(sm.units, "each") as units'),
                DB::raw('COALESCE((sm.materialcost + sm.labourcost + sm.overheadcost), 0) as item_cost')
            )
            ->where('cb.contractref', $contractRef)
            ->orderBy('cb.stockid')
            ->get();

        $requirementLines = DB::table('contractreqts')
            ->select('contractreqid', 'requirement', 'quantity', 'costperunit')
            ->where('contractref', $contractRef)
            ->orderBy('contractreqid')
            ->get();

        $costs = $this->contractCosts($contractRef, (float) $header->margin);

        return [
            'contractRef' => (string) $header->contractref,
            'contractDescription' => (string) ($header->contractdescription ?? ''),
            'debtorNo' => (string) $header->debtorno,
            'branchCode' => (string) $header->branchcode,
            'customerName' => (string) $header->customer_name,
            'branchName' => (string) $header->branch_name,
            'locationCode' => (string) $header->loccode,
            'locationName' => (string) $header->location_name,
            'status' => (int) $header->status,
            'statusLabel' => $this->contractStatusLabel((int) $header->status),
            'categoryId' => (string) $header->categoryid,
            'orderNo' => (int) ($header->orderno ?? 0),
            'workOrderNo' => (int) ($header->wo ?? 0),
            'customerRef' => (string) ($header->customerref ?? ''),
            'margin' => (float) $header->margin,
            'requiredDate' => (string) $header->requireddate,
            'drawing' => (string) ($header->drawing ?? ''),
            'exchangeRate' => (float) ($header->exrate ?? 1),
            'currencyCode' => (string) ($header->currency_code ?? ''),
            'bomCost' => $costs['bomCost'],
            'requirementsCost' => $costs['requirementsCost'],
            'totalCost' => $costs['totalCost'],
            'quotedPrice' => $costs['quotedPrice'],
            'bomLines' => $bomLines->map(function ($row) {
                return [
                    'stockId' => (string) $row->stockid,
                    'description' => (string) ($row->description ?? $row->stockid),
                    'workCentreCode' => (string) ($row->workcentreadded ?? ''),
                    'quantity' => (float) $row->quantity,
                    'units' => (string) ($row->units ?? 'each'),
                    'itemCost' => (float) ($row->item_cost ?? 0),
                ];
            })->values(),
            'requirementLines' => $requirementLines->map(function ($row) {
                return [
                    'id' => (int) $row->contractreqid,
                    'requirement' => (string) ($row->requirement ?? ''),
                    'quantity' => (float) $row->quantity,
                    'costPerUnit' => (float) $row->costperunit,
                ];
            })->values(),
        ];
    }

    private function contractCosts(string $contractRef, float $margin): array
    {
        $bomCost = (float) (DB::table('contractbom as cb')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'cb.stockid')
            ->where('cb.contractref', $contractRef)
            ->selectRaw('COALESCE(SUM((sm.materialcost + sm.labourcost + sm.overheadcost) * cb.quantity), 0) as total')
            ->value('total') ?? 0);

        $requirementsCost = (float) (DB::table('contractreqts')
            ->where('contractref', $contractRef)
            ->selectRaw('COALESCE(SUM(quantity * costperunit), 0) as total')
            ->value('total') ?? 0);

        $totalCost = $bomCost + $requirementsCost;
        $quotedPrice = $margin >= 100 ? $totalCost : $totalCost / max(0.0001, (1 - ($margin / 100)));

        return [
            'bomCost' => $bomCost,
            'requirementsCost' => $requirementsCost,
            'totalCost' => $totalCost,
            'quotedPrice' => $quotedPrice,
        ];
    }

    private function assertContractParentRowsExist(
        string $debtorNo,
        string $branchCode,
        string $categoryId,
        string $locationCode
    ): void {
        $branchExists = DB::table('custbranch')
            ->where('debtorno', $debtorNo)
            ->where('branchcode', $branchCode)
            ->exists();
        if (!$branchExists) {
            throw new \RuntimeException('Customer branch does not exist.');
        }

        $categoryExists = DB::table('stockcategory')->where('categoryid', $categoryId)->exists();
        if (!$categoryExists) {
            throw new \RuntimeException('Stock category does not exist.');
        }

        $locationExists = DB::table('locations')->where('loccode', $locationCode)->exists();
        if (!$locationExists) {
            throw new \RuntimeException('Location does not exist.');
        }
    }

    private function resolveCustomerExchangeRate(string $debtorNo): float
    {
        $currencyCode = DB::table('debtorsmaster')->where('debtorno', $debtorNo)->value('currcode');
        if ($currencyCode === null || $currencyCode === '') {
            return 1.0;
        }

        $rate = DB::table('currencies')->where('currabrev', $currencyCode)->value('rate');
        return $rate !== null ? (float) $rate : 1.0;
    }

    private function replaceContractLines(
        string $contractRef,
        array $bomLines,
        array $requirementLines,
        string $locationCode,
        string $defaultWorkCentre
    ): void {
        DB::table('contractbom')->where('contractref', $contractRef)->delete();
        DB::table('contractreqts')->where('contractref', $contractRef)->delete();

        foreach ($bomLines as $line) {
            $stockId = (string) $line['stockId'];
            $stockExists = DB::table('stockmaster')->where('stockid', $stockId)->exists();
            if (!$stockExists) {
                throw new \RuntimeException('Contract BOM item not found: ' . $stockId);
            }

            $workCentre = isset($line['workCentreCode']) && $line['workCentreCode'] !== ''
                ? $this->resolveWorkCentreCode($locationCode, (string) $line['workCentreCode'])
                : $this->resolveWorkCentreCode($locationCode, $defaultWorkCentre);

            DB::table('contractbom')->insert([
                'contractref' => $contractRef,
                'stockid' => $stockId,
                'workcentreadded' => $workCentre,
                'quantity' => (float) $line['quantity'],
            ]);
        }

        foreach ($requirementLines as $line) {
            DB::table('contractreqts')->insert([
                'contractref' => $contractRef,
                'requirement' => (string) $line['requirement'],
                'quantity' => (float) $line['quantity'],
                'costperunit' => (float) $line['costPerUnit'],
            ]);
        }
    }

    private function resolveWorkCentreCode(string $locationCode, string $preferredCode = ''): string
    {
        $preferredCode = trim($preferredCode);
        if ($preferredCode !== '') {
            $exists = DB::table('workcentres')->where('code', $preferredCode)->exists();
            if ($exists) {
                return $preferredCode;
            }
        }

        $byLocation = DB::table('workcentres')
            ->where('location', $locationCode)
            ->orderBy('code')
            ->value('code');
        if ($byLocation !== null) {
            return (string) $byLocation;
        }

        $base = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $locationCode), 0, 5));
        if ($base === '') {
            $base = 'WC001';
        }
        $candidate = str_pad($base, 5, '0');
        $i = 1;
        while (DB::table('workcentres')->where('code', $candidate)->exists()) {
            $suffix = (string) $i;
            $candidate = substr($base, 0, max(0, 5 - strlen($suffix))) . $suffix;
            $i += 1;
            if ($i > 9999) {
                throw new \RuntimeException('Unable to allocate default work centre code.');
            }
        }

        DB::table('workcentres')->insert([
            'code' => $candidate,
            'location' => $locationCode,
            'description' => substr('Default ' . $locationCode, 0, 20),
            'capacity' => 1,
            'overheadperhour' => 0,
            'overheadrecoveryact' => '1',
            'setuphrs' => 0,
        ]);

        return $candidate;
    }

    private function upsertContractStockItem(
        string $contractRef,
        string $description,
        string $categoryId,
        float $contractCost
    ): void {
        $exists = DB::table('stockmaster')->where('stockid', $contractRef)->exists();
        if (!$exists) {
            DB::table('stockmaster')->insert([
                'stockid' => $contractRef,
                'categoryid' => $categoryId,
                'lastcategoryupdate' => Carbon::today()->toDateString(),
                'description' => mb_substr($description, 0, 50),
                'longdescription' => $description,
                'units' => 'each',
                'mbflag' => 'M',
                'lastcurcostdate' => '1800-01-01',
                'actualcost' => 0,
                'lastcost' => 0,
                'materialcost' => $contractCost,
                'labourcost' => 0,
                'overheadcost' => 0,
                'lowestlevel' => 0,
                'discontinued' => 0,
                'controlled' => 0,
                'eoq' => 0,
                'volume' => 0,
                'grossweight' => 0,
                'kgs' => 0,
                'barcode' => '',
                'discountcategory' => '',
                'taxcatid' => 1,
                'serialised' => 0,
                'appendfile' => null,
                'perishable' => 0,
                'decimalplaces' => 0,
                'pansize' => 0,
                'shrinkfactor' => 0,
                'nextserialno' => 0,
                'netweight' => 0,
                'lastcostupdate' => Carbon::today()->toDateString(),
            ]);
            return;
        }

        DB::table('stockmaster')
            ->where('stockid', $contractRef)
            ->update([
                'description' => mb_substr($description, 0, 50),
                'longdescription' => $description,
                'categoryid' => $categoryId,
                'materialcost' => $contractCost,
            ]);
    }

    private function ensureLocStockForContractItem(string $contractRef): void
    {
        $locations = DB::table('locations')->select('loccode')->get();

        foreach ($locations as $location) {
            DB::table('locstock')->updateOrInsert(
                [
                    'loccode' => (string) $location->loccode,
                    'stockid' => $contractRef,
                ],
                [
                    'quantity' => 0,
                    'reorderlevel' => 0,
                    'bin' => null,
                ]
            );
        }
    }

    private function createSalesOrderFromRecurring(object $template, $details, string $runDate): int
    {
        $orderNo = $this->nextTypeNumber(30, 'Sales Order');
        $shipperId = $this->resolveShipperId((int) ($template->shipvia ?? 0));
        $locationCode = $this->resolveLocationCode((string) ($template->fromstkloc ?? ''));

        DB::table('salesorders')->insert([
            'orderno' => $orderNo,
            'debtorno' => (string) $template->debtorno,
            'branchcode' => (string) $template->branchcode,
            'customerref' => (string) ($template->customerref ?? ''),
            'buyername' => ($template->buyername ?? null) ?: null,
            'comments' => (string) ($template->comments ?? ''),
            'orddate' => $runDate,
            'ordertype' => (string) ($template->ordertype ?: 'RE'),
            'shipvia' => $shipperId,
            'deladd1' => (string) ($template->deladd1 ?? ''),
            'deladd2' => (string) ($template->deladd2 ?? ''),
            'deladd3' => (string) ($template->deladd3 ?? ''),
            'deladd4' => (string) ($template->deladd4 ?? ''),
            'deladd5' => (string) ($template->deladd5 ?? ''),
            'deladd6' => (string) ($template->deladd6 ?? ''),
            'contactphone' => (string) ($template->contactphone ?? ''),
            'contactemail' => (string) ($template->contactemail ?? ''),
            'deliverto' => (string) ($template->deliverto ?? ''),
            'deliverblind' => 1,
            'freightcost' => (float) ($template->freightcost ?? 0),
            'fromstkloc' => $locationCode,
            'deliverydate' => $runDate,
            'confirmeddate' => $runDate,
            'printedpackingslip' => 0,
            'datepackingslipprinted' => '0000-00-00',
            'quotation' => 0,
            'quotedate' => $runDate,
            'poplaced' => 0,
            'salesperson' => null,
            'internalcomment' => null,
        ]);

        $stockIds = $details->pluck('stkcode')->map(static function ($value) {
            return (string) $value;
        })->unique()->values()->all();

        $stockRows = DB::table('stockmaster')
            ->whereIn('stockid', $stockIds)
            ->select('stockid', 'units', 'decimalplaces')
            ->get()
            ->keyBy('stockid');

        foreach ($details as $index => $line) {
            $stockId = (string) $line->stkcode;
            if (!$stockRows->has($stockId)) {
                throw new \RuntimeException('Recurring template references missing stock item: ' . $stockId);
            }
            $stock = $stockRows->get($stockId);

            DB::table('salesorderdetails')->insert([
                'orderlineno' => $index,
                'orderno' => $orderNo,
                'stkcode' => $stockId,
                'qtyinvoiced' => 0,
                'unitprice' => (float) $line->unitprice,
                'units' => (string) ($stock->units ?: 'each'),
                'conversionfactor' => 1,
                'decimalplaces' => (int) ($stock->decimalplaces ?? 0),
                'pricedecimals' => 2,
                'quantity' => (float) $line->quantity,
                'estimate' => 0,
                'discountpercent' => (float) ($line->discountpercent ?? 0),
                'actualdispatchdate' => '0000-00-00 00:00:00',
                'completed' => 0,
                'narrative' => (string) ($line->narrative ?? ''),
                'itemdue' => $runDate,
                'poline' => '',
                'commissionrate' => 0,
                'commissionearned' => 0,
            ]);
        }

        return $orderNo;
    }

    private function resolveBranchForDebtor(string $debtorNo, ?string $branchCode)
    {
        if ($branchCode !== null && $branchCode !== '') {
            $exact = DB::table('custbranch')
                ->where('debtorno', $debtorNo)
                ->where('branchcode', $branchCode)
                ->first();

            if ($exact) {
                return $exact;
            }
        }

        return DB::table('custbranch')
            ->where('debtorno', $debtorNo)
            ->orderBy('branchcode')
            ->first();
    }

    private function resolveShipperId(int $preferred): int
    {
        if ($preferred > 0) {
            $exists = DB::table('shippers')->where('shipper_id', $preferred)->exists();
            if ($exists) {
                return $preferred;
            }
        }

        $fallback = DB::table('shippers')->orderBy('shipper_id')->value('shipper_id');
        if ($fallback !== null) {
            return (int) $fallback;
        }

        throw new \RuntimeException('No shipper exists in shippers table.');
    }

    private function resolveLocationCode(string $preferred): string
    {
        if ($preferred !== '') {
            $exists = DB::table('locations')->where('loccode', $preferred)->exists();
            if ($exists) {
                return $preferred;
            }
        }

        $fallback = DB::table('locations')->orderBy('loccode')->value('loccode');
        if ($fallback !== null) {
            return (string) $fallback;
        }

        throw new \RuntimeException('No stock location exists in locations table.');
    }

    private function nextTypeNumber(int $typeId, string $typeName): int
    {
        $row = DB::table('systypes')->where('typeid', $typeId)->lockForUpdate()->first();

        if (!$row) {
            $maxOrderNo = (int) (DB::table('salesorders')->max('orderno') ?? 0);
            $next = max(1, $maxOrderNo + 1);

            DB::table('systypes')->insert([
                'typeid' => $typeId,
                'typename' => $typeName,
                'typeno' => $next,
            ]);

            return $next;
        }

        $maxOrderNo = (int) (DB::table('salesorders')->max('orderno') ?? 0);
        $next = max(((int) $row->typeno) + 1, $maxOrderNo + 1);

        DB::table('systypes')
            ->where('typeid', $typeId)
            ->update(['typeno' => $next]);

        return $next;
    }

    private function applyOrderSearch($query, string $search): void
    {
        $like = '%' . $search . '%';
        $query->where(function ($builder) use ($like) {
            $builder
                ->where('so.debtorno', 'like', $like)
                ->orWhere('dm.name', 'like', $like)
                ->orWhere('so.customerref', 'like', $like)
                ->orWhere('so.deliverto', 'like', $like)
                ->orWhere('so.orderno', 'like', $like);
        });
    }

    private function safeLimit($value, int $min, int $max): int
    {
        return max($min, min((int) $value, $max));
    }
}
