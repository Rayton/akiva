<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailSetting;
use Carbon\Carbon;
use Illuminate\Mail\Message;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class SalesController extends Controller
{
    public function dashboard(Request $request)
    {
        $days = $this->safeLimit($request->query('days', 14), 7, 45);

        try {
            $today = Carbon::today();
            $monthStart = $today->copy()->startOfMonth();
            $previousMonthStart = $today->copy()->subMonthNoOverflow()->startOfMonth();
            $previousMonthEnd = $previousMonthStart->copy()->endOfMonth();

            $todaySales = $this->invoiceSummary($today, $today);
            $monthSales = $this->invoiceSummary($monthStart, $today);
            $previousMonthSales = $this->invoiceSummary($previousMonthStart, $previousMonthEnd);
            $openOrders = $this->openOrderSummary();
            $picking = $this->pickingSummary();
            $receivables = $this->openReceivablesSummary();
            $lowMargin = $this->lowMarginSummary();

            $summary = [
                'todaySales' => round((float) $todaySales['amount'], 2),
                'todayInvoices' => (int) $todaySales['count'],
                'monthSales' => round((float) $monthSales['amount'], 2),
                'monthInvoices' => (int) $monthSales['count'],
                'previousMonthSales' => round((float) $previousMonthSales['amount'], 2),
                'monthGrowthPct' => $this->growthPercent((float) $monthSales['amount'], (float) $previousMonthSales['amount']),
                'averageInvoiceValue' => (int) $monthSales['count'] > 0
                    ? round((float) $monthSales['amount'] / (int) $monthSales['count'], 2)
                    : 0.0,
                'openOrders' => (int) $openOrders['orders'],
                'openOrderLines' => (int) $openOrders['lines'],
                'openOrderValue' => round((float) $openOrders['value'], 2),
                'lateOrders' => (int) $openOrders['lateOrders'],
                'readyToPickOrders' => (int) $picking['orders'],
                'readyToPickQuantity' => round((float) $picking['quantity'], 2),
                'openReceivableValue' => round((float) $receivables['amount'], 2),
                'openReceivableInvoices' => (int) $receivables['count'],
                'lowMarginLines' => (int) $lowMargin['lines'],
                'lowMarginValue' => round((float) $lowMargin['value'], 2),
            ];

            return response()->json([
                'success' => true,
                'data' => [
                    'currency' => $this->companyCurrency(),
                    'asOf' => now()->toIso8601String(),
                    'summary' => $summary,
                    'dailyTrend' => $this->dailySalesTrend($days),
                    'topCustomers' => $this->dashboardTopCustomers($monthStart, $today),
                    'topItems' => $this->dashboardTopItems($monthStart, $today),
                    'actionQueue' => $this->salesActionQueue($summary),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Sales dashboard data could not be loaded.',
            ], 500);
        }
    }

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

    public function orderDetail(Request $request, $orderNo)
    {
        $orderNumber = (int) $orderNo;
        $debtorNo = trim((string) $request->query('debtorNo', ''));

        if ($orderNumber <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'A valid sales order number is required.',
            ], 422);
        }

        try {
            if (!Schema::hasTable('salesorders')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Sales orders are not available.',
                ], 404);
            }

            $hasDebtors = Schema::hasTable('debtorsmaster');
            $hasBranches = Schema::hasTable('custbranch');
            $hasCurrencies = $hasDebtors && Schema::hasTable('currencies');
            $hasSalesTypes = Schema::hasTable('salestypes')
                && Schema::hasColumn('salestypes', 'typeabbrev')
                && Schema::hasColumn('salestypes', 'sales_type');

            $query = DB::table('salesorders as so')
                ->where('so.orderno', $orderNumber)
                ->select(
                    'so.orderno',
                    'so.debtorno',
                    'so.branchcode',
                    'so.customerref',
                    'so.buyername',
                    'so.comments',
                    'so.orddate',
                    'so.ordertype',
                    'so.shipvia',
                    'so.deliverto',
                    'so.deladd1',
                    'so.deladd2',
                    'so.deladd3',
                    'so.deladd4',
                    'so.deladd5',
                    'so.deladd6',
                    'so.contactphone',
                    'so.contactemail',
                    'so.freightcost',
                    'so.fromstkloc',
                    'so.deliverydate'
                );

            if ($debtorNo !== '') {
                $query->where('so.debtorno', $debtorNo);
            }

            if ($hasDebtors) {
                $query
                    ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'so.debtorno')
                    ->addSelect(
                        DB::raw('COALESCE(NULLIF(dm.name, ""), NULLIF(so.deliverto, ""), so.debtorno) as customer_name'),
                        DB::raw('COALESCE(NULLIF(dm.currcode, ""), "' . $this->companyCurrency() . '") as currency_code'),
                        'dm.taxref'
                    );
            } else {
                $query->addSelect(
                    DB::raw('COALESCE(NULLIF(so.deliverto, ""), so.debtorno) as customer_name'),
                    DB::raw('"' . $this->companyCurrency() . '" as currency_code'),
                    DB::raw('NULL as taxref')
                );
            }

            if ($hasBranches) {
                $query
                    ->leftJoin('custbranch as cb', function ($join) {
                        $join
                            ->on('cb.debtorno', '=', 'so.debtorno')
                            ->on('cb.branchcode', '=', 'so.branchcode');
                    })
                    ->addSelect('cb.brname as branch_name');
            } else {
                $query->addSelect(DB::raw('NULL as branch_name'));
            }

            if ($hasCurrencies) {
                $query
                    ->leftJoin('currencies as cur', 'cur.currabrev', '=', 'dm.currcode')
                    ->addSelect(DB::raw('COALESCE(cur.decimalplaces, 2) as currency_decimal_places'));
            } else {
                $query->addSelect(DB::raw('2 as currency_decimal_places'));
            }

            if (Schema::hasTable('shippers') && Schema::hasColumn('shippers', 'shipper_id')) {
                $query
                    ->leftJoin('shippers as sh', 'sh.shipper_id', '=', 'so.shipvia')
                    ->addSelect('sh.shippername as shipper_name');
            } else {
                $query->addSelect(DB::raw('NULL as shipper_name'));
            }

            if (Schema::hasTable('locations') && Schema::hasColumn('locations', 'loccode')) {
                $query
                    ->leftJoin('locations as loc', 'loc.loccode', '=', 'so.fromstkloc')
                    ->addSelect('loc.locationname as location_name');
            } else {
                $query->addSelect(DB::raw('NULL as location_name'));
            }

            if ($hasSalesTypes) {
                $query
                    ->leftJoin('salestypes as st', 'st.typeabbrev', '=', 'so.ordertype')
                    ->addSelect('st.sales_type as sales_type_name');
            } else {
                $query->addSelect(DB::raw('NULL as sales_type_name'));
            }

            $header = $query->first();

            if (!$header) {
                return response()->json([
                    'success' => false,
                    'message' => $debtorNo !== ''
                        ? 'Sales order was not found for this customer.'
                        : 'Sales order was not found.',
                ], 404);
            }

            $lines = $this->salesOrderDetailLines($orderNumber);
            $lineCount = $lines->count();
            $completedLines = $lines->where('completed', true)->count();
            $subTotal = round((float) $lines->sum('lineTotal'), 2);
            $freight = round((float) ($header->freightcost ?? 0), 2);
            $comments = (string) ($header->comments ?? '');

            preg_match_all('/\bInv\s+([0-9]+)/i', $comments, $invoiceMatches);
            $invoiceNumbers = collect($invoiceMatches[1] ?? [])->unique()->values()->all();

            return response()->json([
                'success' => true,
                'data' => [
                    'orderNo' => (string) $header->orderno,
                    'debtorNo' => (string) $header->debtorno,
                    'customerName' => (string) ($header->customer_name ?? ''),
                    'branchCode' => (string) ($header->branchcode ?? ''),
                    'branchName' => (string) ($header->branch_name ?? ''),
                    'customerRef' => (string) ($header->customerref ?? ''),
                    'buyerName' => (string) ($header->buyername ?? ''),
                    'comments' => $comments,
                    'orderDate' => $this->cleanDateValue($header->orddate ?? ''),
                    'deliveryDate' => $this->cleanDateValue($header->deliverydate ?? ''),
                    'orderType' => (string) ($header->ordertype ?? ''),
                    'salesTypeName' => (string) ($header->sales_type_name ?? ''),
                    'shipVia' => (int) ($header->shipvia ?? 0),
                    'shipperName' => (string) ($header->shipper_name ?? ''),
                    'fromStockLocation' => (string) ($header->fromstkloc ?? ''),
                    'fromStockLocationName' => (string) ($header->location_name ?? ''),
                    'deliveryTo' => (string) ($header->deliverto ?? ''),
                    'deliveryAddress' => collect([
                        $header->deladd1 ?? '',
                        $header->deladd2 ?? '',
                        $header->deladd3 ?? '',
                        $header->deladd4 ?? '',
                        $header->deladd5 ?? '',
                        $header->deladd6 ?? '',
                    ])->map(fn ($part) => trim((string) $part))->filter()->values()->all(),
                    'contactPhone' => (string) ($header->contactphone ?? ''),
                    'contactEmail' => (string) ($header->contactemail ?? ''),
                    'currency' => (string) ($header->currency_code ?? $this->companyCurrency()),
                    'decimalPlaces' => (int) ($header->currency_decimal_places ?? 2),
                    'taxReference' => (string) ($header->taxref ?? ''),
                    'invoiceNumbers' => $invoiceNumbers,
                    'lineCount' => $lineCount,
                    'completedLines' => $completedLines,
                    'progressPercent' => $lineCount > 0 ? round(($completedLines / $lineCount) * 100, 1) : 0,
                    'status' => $this->salesOrderStatusLabel($lineCount, $completedLines),
                    'subTotal' => $subTotal,
                    'freight' => $freight,
                    'tax' => 0.0,
                    'total' => round($subTotal + $freight, 2),
                    'totalWeight' => round((float) $lines->sum('lineWeight'), 4),
                    'totalVolume' => round((float) $lines->sum('lineVolume'), 4),
                    'lines' => $lines->values()->all(),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Unable to load sales order details.',
            ], 500);
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
            $hasPaymentTerms = Schema::hasTable('paymentterms')
                && Schema::hasColumn('paymentterms', 'termsindicator')
                && Schema::hasColumn('debtorsmaster', 'paymentterms');
            $hasHoldReasons = Schema::hasTable('holdreasons')
                && Schema::hasColumn('holdreasons', 'reasoncode')
                && Schema::hasColumn('debtorsmaster', 'holdreason');
            $creditLimitExpression = Schema::hasColumn('debtorsmaster', 'creditlimit')
                ? 'COALESCE(dm.creditlimit, 0)'
                : '0';
            $currencyExpression = Schema::hasColumn('debtorsmaster', 'currcode')
                ? 'COALESCE(NULLIF(dm.currcode, ""), "' . $this->companyCurrency() . '")'
                : '"' . $this->companyCurrency() . '"';
            $hasSalesTypeName = Schema::hasTable('salestypes')
                && Schema::hasColumn('salestypes', 'typeabbrev')
                && Schema::hasColumn('salestypes', 'sales_type');
            $hasDebtorType = Schema::hasTable('debtortype')
                && Schema::hasColumn('debtortype', 'typeid')
                && Schema::hasColumn('debtortype', 'typename')
                && Schema::hasColumn('debtorsmaster', 'typeid');

            $query = DB::table('custbranch as cb')
                ->join('debtorsmaster as dm', 'dm.debtorno', '=', 'cb.debtorno')
                ->select(
                    'dm.debtorno',
                    'dm.name as customer_name',
                    'cb.branchcode',
                    'cb.brname',
                    'cb.braddress1',
                    'cb.braddress2',
                    'cb.braddress3',
                    'cb.braddress4',
                    'cb.braddress5',
                    'cb.braddress6',
                    'cb.phoneno',
                    'cb.email',
                    'dm.salestype',
                    'dm.paymentterms',
                    DB::raw($creditLimitExpression . ' as credit_limit'),
                    DB::raw($currencyExpression . ' as currency_code'),
                    'cb.defaultlocation',
                    'cb.defaultshipvia'
                );

            $selectOptionalDebtorColumn = function (string $column, string $alias, string $default = 'NULL') use ($query): void {
                if (Schema::hasColumn('debtorsmaster', $column)) {
                    $query->addSelect("dm.{$column} as {$alias}");
                } else {
                    $query->addSelect(DB::raw($default . ' as ' . $alias));
                }
            };

            foreach (['address1', 'address2', 'address3', 'address4', 'address5', 'address6'] as $addressColumn) {
                $selectOptionalDebtorColumn($addressColumn, 'customer_' . $addressColumn);
            }

            $selectOptionalDebtorColumn('clientsince', 'customer_since');
            $selectOptionalDebtorColumn('discount', 'discount_percent', '0');
            $selectOptionalDebtorColumn('discountcode', 'discount_code');
            $selectOptionalDebtorColumn('pymtdiscount', 'payment_discount_percent', '0');
            $selectOptionalDebtorColumn('taxref', 'tax_reference');
            $selectOptionalDebtorColumn('customerpoline', 'customer_po_line', '0');
            $selectOptionalDebtorColumn('invaddrbranch', 'invoice_addressing_branch', '0');
            $selectOptionalDebtorColumn('language_id', 'language_id');

            if ($hasSalesTypeName) {
                $query
                    ->leftJoin('salestypes as st', 'st.typeabbrev', '=', 'dm.salestype')
                    ->addSelect('st.sales_type as sales_type_name');
            } else {
                $query->addSelect(DB::raw('NULL as sales_type_name'));
            }

            if ($hasDebtorType) {
                $query
                    ->leftJoin('debtortype as dtp', 'dtp.typeid', '=', 'dm.typeid')
                    ->addSelect(
                        'dm.typeid as customer_type_id',
                        'dtp.typename as customer_type_name'
                    );
            } else {
                $query->addSelect(
                    DB::raw('NULL as customer_type_id'),
                    DB::raw('NULL as customer_type_name')
                );
            }

            if ($hasPaymentTerms) {
                $query
                    ->leftJoin('paymentterms as pt', 'pt.termsindicator', '=', 'dm.paymentterms')
                    ->addSelect(
                        'pt.terms as payment_terms_name',
                        'pt.daysbeforedue',
                        'pt.dayinfollowingmonth'
                    );
            } else {
                $query->addSelect(
                    DB::raw('NULL as payment_terms_name'),
                    DB::raw('0 as daysbeforedue'),
                    DB::raw('0 as dayinfollowingmonth')
                );
            }

            if ($hasHoldReasons) {
                $query
                    ->leftJoin('holdreasons as hr', 'hr.reasoncode', '=', 'dm.holdreason')
                    ->addSelect('hr.reasondescription as credit_status_name');
            } else {
                $query->addSelect(DB::raw('NULL as credit_status_name'));
            }

            $query
                ->orderBy('dm.name')
                ->limit($limit);

            if ($search !== '') {
                $like = '%' . $search . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('dm.debtorno', 'like', $like)
                        ->orWhere('dm.name', 'like', $like)
                        ->orWhere('cb.branchcode', 'like', $like)
                        ->orWhere('cb.brname', 'like', $like)
                        ->orWhere('cb.phoneno', 'like', $like)
                        ->orWhere('cb.email', 'like', $like)
                        ->orWhere('cb.braddress1', 'like', $like)
                        ->orWhere('cb.braddress2', 'like', $like)
                        ->orWhere('cb.braddress3', 'like', $like)
                        ->orWhere('cb.braddress4', 'like', $like)
                        ->orWhere('cb.braddress5', 'like', $like)
                        ->orWhere('cb.braddress6', 'like', $like);
                });
            }

            $rows = $query->get();
            $debtorNos = $rows
                ->pluck('debtorno')
                ->map(static fn ($value) => (string) $value)
                ->filter()
                ->unique()
                ->values();
            $contactsByDebtor = collect();

            if ($debtorNos->isNotEmpty() && Schema::hasTable('custcontacts') && Schema::hasColumn('custcontacts', 'debtorno')) {
                $contactQuery = DB::table('custcontacts')
                    ->whereIn('debtorno', $debtorNos)
                    ->select('debtorno');

                foreach ([
                    'contactname' => 'contactname',
                    'role' => 'role',
                    'phoneno' => 'phoneno',
                    'email' => 'email',
                    'notes' => 'notes',
                ] as $column => $alias) {
                    if (Schema::hasColumn('custcontacts', $column)) {
                        $contactQuery->addSelect($column . ' as ' . $alias);
                    } else {
                        $contactQuery->addSelect(DB::raw('NULL as ' . $alias));
                    }
                }

                if (Schema::hasColumn('custcontacts', 'contid')) {
                    $contactQuery->orderBy('contid');
                }

                $contactsByDebtor = $contactQuery->get()->groupBy(static fn ($row) => (string) $row->debtorno);
            }

            return response()->json([
                'success' => true,
                'data' => $rows->map(function ($row) use ($contactsByDebtor) {
                    $address = collect([
                        $row->braddress1 ?? '',
                        $row->braddress2 ?? '',
                        $row->braddress3 ?? '',
                        $row->braddress4 ?? '',
                        $row->braddress5 ?? '',
                        $row->braddress6 ?? '',
                    ])->map(fn ($part) => trim((string) $part))->filter()->implode(', ');

                    return [
                        'debtorNo' => (string) $row->debtorno,
                        'customerName' => (string) $row->customer_name,
                        'branchCode' => (string) $row->branchcode,
                        'branchName' => (string) ($row->brname ?? ''),
                        'phone' => (string) ($row->phoneno ?? ''),
                        'email' => (string) ($row->email ?? ''),
                        'address' => $address,
                        'addressLine1' => (string) ($row->customer_address1 ?? $row->braddress1 ?? ''),
                        'addressLine2' => (string) ($row->customer_address2 ?? $row->braddress2 ?? ''),
                        'addressLine3' => (string) ($row->customer_address3 ?? $row->braddress3 ?? ''),
                        'addressLine4' => (string) ($row->customer_address4 ?? $row->braddress4 ?? ''),
                        'addressLine5' => (string) ($row->customer_address5 ?? $row->braddress5 ?? ''),
                        'addressLine6' => (string) ($row->customer_address6 ?? $row->braddress6 ?? ''),
                        'salesType' => (string) ($row->salestype ?? ''),
                        'salesTypeName' => (string) ($row->sales_type_name ?? ''),
                        'customerType' => (string) ($row->customer_type_name ?? ''),
                        'customerTypeId' => (string) ($row->customer_type_id ?? ''),
                        'customerSince' => (string) ($row->customer_since ?? ''),
                        'paymentTerms' => (string) ($row->paymentterms ?? ''),
                        'paymentTermsName' => (string) ($row->payment_terms_name ?? ''),
                        'daysBeforeDue' => (int) ($row->daysbeforedue ?? 0),
                        'dayInFollowingMonth' => (int) ($row->dayinfollowingmonth ?? 0),
                        'currencyCode' => (string) ($row->currency_code ?? $this->companyCurrency()),
                        'discountPercent' => (float) ($row->discount_percent ?? 0) * 100,
                        'discountCode' => (string) ($row->discount_code ?? ''),
                        'paymentDiscountPercent' => (float) ($row->payment_discount_percent ?? 0) * 100,
                        'creditLimit' => (float) ($row->credit_limit ?? 0),
                        'creditStatus' => (string) ($row->credit_status_name ?? ''),
                        'taxReference' => (string) ($row->tax_reference ?? ''),
                        'customerPoLineRequired' => ((int) ($row->customer_po_line ?? 0)) === 1,
                        'invoiceAddressing' => ((int) ($row->invoice_addressing_branch ?? 0)) === 1 ? 'Address to Branch' : 'Address to HO',
                        'languageId' => (string) ($row->language_id ?? ''),
                        'defaultLocation' => (string) ($row->defaultlocation ?? ''),
                        'defaultShipperId' => (int) ($row->defaultshipvia ?? 0),
                        'contacts' => $contactsByDebtor
                            ->get((string) $row->debtorno, collect())
                            ->map(static function ($contact) {
                                return [
                                    'name' => (string) ($contact->contactname ?? ''),
                                    'role' => (string) ($contact->role ?? ''),
                                    'phone' => (string) ($contact->phoneno ?? ''),
                                    'email' => (string) ($contact->email ?? ''),
                                    'notes' => (string) ($contact->notes ?? ''),
                                ];
                            })
                            ->values(),
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

    public function customerSalesHistory(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 300), 20, 1500);
        $defaultFromDate = Carbon::today()->subMonthsNoOverflow(2)->startOfMonth()->toDateString();
        $defaultToDate = Carbon::today()->toDateString();
        $debtorNo = trim((string) $request->query('debtorNo', ''));
        $searchTerm = trim((string) ($request->query('searchTerm', $request->query('q', ''))));
        $fromDate = $this->requestDateOrDefault($request->query('fromDate'), $defaultFromDate);
        $toDate = $this->requestDateOrDefault($request->query('toDate'), $defaultToDate);
        if ($fromDate > $toDate) {
            [$fromDate, $toDate] = [$toDate, $fromDate];
        }

        $type = strtolower(trim((string) $request->query('type', 'all')));
        if (!in_array($type, ['all', 'invoice', 'credit'], true)) {
            $type = 'all';
        }

        if ($debtorNo === '') {
            return response()->json([
                'success' => false,
                'message' => 'A customer code is required.',
            ], 422);
        }

        try {
            if (!Schema::hasTable('stockmoves')) {
                return response()->json([
                    'success' => true,
                    'data' => $this->emptyCustomerSalesHistoryPayload($debtorNo, $fromDate, $toDate, $type, $searchTerm),
                ]);
            }

            $discountFraction = $this->salesOrderDiscountFractionExpression('sm');
            $quantityExpression = '(-COALESCE(sm.qty, 0))';
            $netUnitPriceExpression = '(COALESCE(sm.price, 0) * (1 - ' . $discountFraction . '))';
            $lineTotalExpression = '(' . $quantityExpression . ' * ' . $netUnitPriceExpression . ')';

            $query = DB::table('stockmoves as sm')
                ->where('sm.debtorno', $debtorNo)
                ->whereDate('sm.trandate', '>=', $fromDate)
                ->whereDate('sm.trandate', '<=', $toDate)
                ->select(
                    'sm.stkmoveno',
                    'sm.stockid',
                    'sm.type',
                    'sm.transno',
                    'sm.loccode',
                    'sm.trandate',
                    'sm.debtorno',
                    'sm.branchcode',
                    'sm.price',
                    'sm.reference',
                    'sm.qty',
                    'sm.discountpercent',
                    'sm.narrative',
                    DB::raw($quantityExpression . ' as display_quantity'),
                    DB::raw($netUnitPriceExpression . ' as net_unit_price'),
                    DB::raw($lineTotalExpression . ' as line_total'),
                    DB::raw('(' . $discountFraction . ' * 100) as discount_percent')
                );

            if (Schema::hasColumn('stockmoves', 'units')) {
                $query->addSelect('sm.units as movement_units');
            } else {
                $query->addSelect(DB::raw('NULL as movement_units'));
            }

            if (Schema::hasTable('stockmaster')) {
                $query
                    ->leftJoin('stockmaster as stk', 'stk.stockid', '=', 'sm.stockid')
                    ->addSelect(
                        DB::raw('COALESCE(NULLIF(stk.description, ""), sm.stockid) as item_description'),
                        DB::raw("COALESCE(NULLIF(stk.units, ''), 'each') as stock_units")
                    );
            } else {
                $query->addSelect(
                    DB::raw('sm.stockid as item_description'),
                    DB::raw("'each' as stock_units")
                );
            }

            if (Schema::hasTable('systypes')) {
                $query
                    ->leftJoin('systypes as st', 'st.typeid', '=', 'sm.type')
                    ->addSelect('st.typename as type_name');
            } else {
                $query->addSelect(DB::raw('NULL as type_name'));
            }

            if (Schema::hasTable('locations')) {
                $query
                    ->leftJoin('locations as loc', 'loc.loccode', '=', 'sm.loccode')
                    ->addSelect('loc.locationname as location_name');
            } else {
                $query->addSelect(DB::raw('NULL as location_name'));
            }

            if (Schema::hasTable('custbranch')) {
                $query
                    ->leftJoin('custbranch as cb', function ($join) {
                        $join
                            ->on('cb.debtorno', '=', 'sm.debtorno')
                            ->on('cb.branchcode', '=', 'sm.branchcode');
                    })
                    ->addSelect('cb.brname as branch_name');
            } else {
                $query->addSelect(DB::raw('NULL as branch_name'));
            }

            if (Schema::hasTable('debtortrans')) {
                $query
                    ->leftJoin('debtortrans as dt', function ($join) {
                        $join
                            ->on('dt.type', '=', 'sm.type')
                            ->on('dt.transno', '=', 'sm.transno')
                            ->on('dt.debtorno', '=', 'sm.debtorno');

                        if (Schema::hasColumn('debtortrans', 'branchcode')) {
                            $join->on('dt.branchcode', '=', 'sm.branchcode');
                        }
                    })
                    ->addSelect(
                        'dt.reference as document_reference',
                        'dt.order_ as order_number'
                    );
            } else {
                $query->addSelect(
                    DB::raw('NULL as document_reference'),
                    DB::raw('NULL as order_number')
                );
            }

            if ($type === 'invoice') {
                $query->where('sm.type', 10);
            } elseif ($type === 'credit') {
                $query->where('sm.type', 11);
            } else {
                $query->whereIn('sm.type', [10, 11]);
            }

            if ($searchTerm !== '') {
                $like = '%' . preg_replace('/\s+/', '%', $searchTerm) . '%';
                $query->where(function ($builder) use ($like) {
                    $builder
                        ->where('sm.stockid', 'like', $like)
                        ->orWhere('sm.transno', 'like', $like)
                        ->orWhere('sm.loccode', 'like', $like)
                        ->orWhere('sm.branchcode', 'like', $like)
                        ->orWhere('sm.reference', 'like', $like)
                        ->orWhere('sm.narrative', 'like', $like);

                    if (Schema::hasTable('stockmaster')) {
                        $builder->orWhere('stk.description', 'like', $like);
                    }

                    if (Schema::hasTable('systypes')) {
                        $builder->orWhere('st.typename', 'like', $like);
                    }

                    if (Schema::hasTable('locations')) {
                        $builder->orWhere('loc.locationname', 'like', $like);
                    }

                    if (Schema::hasTable('custbranch')) {
                        $builder->orWhere('cb.brname', 'like', $like);
                    }

                    if (Schema::hasTable('debtortrans')) {
                        $builder
                            ->orWhere('dt.reference', 'like', $like)
                            ->orWhere('dt.order_', 'like', $like);
                    }
                });
            }

            $rows = $query
                ->orderByDesc('sm.trandate')
                ->orderByDesc('sm.transno')
                ->orderBy('sm.stkmoveno')
                ->limit($limit)
                ->get()
                ->map(function ($row) {
                    $typeId = (int) ($row->type ?? 0);
                    $quantity = round((float) ($row->display_quantity ?? 0), 4);
                    $lineTotal = round((float) ($row->line_total ?? 0), 2);

                    return [
                        'movementId' => (int) ($row->stkmoveno ?? 0),
                        'transactionDate' => $this->cleanDateValue($row->trandate ?? ''),
                        'stockId' => (string) ($row->stockid ?? ''),
                        'description' => (string) ($row->item_description ?? $row->stockid ?? ''),
                        'typeId' => $typeId,
                        'typeName' => (string) ($row->type_name ?? $this->salesTransactionTypeName($typeId)),
                        'transactionNo' => (string) ($row->transno ?? ''),
                        'locationCode' => (string) ($row->loccode ?? ''),
                        'locationName' => (string) ($row->location_name ?? $row->loccode ?? ''),
                        'branchCode' => (string) ($row->branchcode ?? ''),
                        'branchName' => (string) ($row->branch_name ?? ''),
                        'quantity' => $quantity,
                        'units' => (string) ($row->movement_units ?: $row->stock_units ?: 'each'),
                        'unitPrice' => round((float) ($row->price ?? 0), 4),
                        'discountPercent' => round((float) ($row->discount_percent ?? 0), 2),
                        'netUnitPrice' => round((float) ($row->net_unit_price ?? 0), 4),
                        'lineTotal' => $lineTotal,
                        'reference' => (string) ($row->reference ?? ''),
                        'documentReference' => (string) ($row->document_reference ?? ''),
                        'orderNo' => (string) ($row->order_number ?? ''),
                        'narrative' => (string) ($row->narrative ?? ''),
                    ];
                })
                ->values();

            return response()->json([
                'success' => true,
                'data' => [
                    'currency' => $this->companyCurrency(),
                    'filters' => [
                        'debtorNo' => $debtorNo,
                        'fromDate' => $fromDate,
                        'toDate' => $toDate,
                        'type' => $type,
                        'searchTerm' => $searchTerm,
                    ],
                    'rows' => $rows,
                    'summary' => $this->customerSalesHistorySummary($rows),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Unable to load customer sales history.',
            ], 500);
        }
    }

    public function transactionDocument(Request $request)
    {
        $transNo = trim((string) $request->query('transNo', ''));
        $type = (int) $request->query('type', 10);

        if ($transNo === '' || !in_array($type, [10, 11], true)) {
            return response()->json([
                'success' => false,
                'message' => 'A valid invoice or credit note transaction is required.',
            ], 422);
        }

        try {
            if (!Schema::hasTable('debtortrans')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer transactions are not available.',
                ], 404);
            }

            $query = DB::table('debtortrans as dt')
                ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'dt.debtorno')
                ->leftJoin('custbranch as cb', function ($join) {
                    $join->on('cb.debtorno', '=', 'dt.debtorno');
                    if (Schema::hasColumn('debtortrans', 'branchcode')) {
                        $join->on('cb.branchcode', '=', 'dt.branchcode');
                    }
                })
                ->where('dt.type', $type)
                ->where('dt.transno', $transNo)
                ->select(
                    'dt.transno',
                    'dt.type',
                    'dt.debtorno',
                    'dt.trandate',
                    'dt.reference',
                    'dt.order_',
                    'dt.ovamount',
                    'dt.ovdiscount',
                    'dt.ovfreight',
                    'dt.ovgst',
                    'dt.rate',
                    'dm.name as customer_name',
                    'dm.address1',
                    'dm.address2',
                    'dm.address3',
                    'dm.address4',
                    'dm.address5',
                    'dm.address6',
                    'dm.currcode',
                    'dm.taxref',
                    'cb.brname',
                    'cb.braddress1',
                    'cb.braddress2',
                    'cb.braddress3',
                    'cb.braddress4',
                    'cb.braddress5',
                    'cb.braddress6'
                );

            $addSelect = function (string $table, string $alias, string $column, string $selectAlias, string $default = 'NULL') use ($query): void {
                if (Schema::hasColumn($table, $column)) {
                    $query->addSelect($alias . '.' . $column . ' as ' . $selectAlias);
                } else {
                    $query->addSelect(DB::raw($default . ' as ' . $selectAlias));
                }
            };

            $addSelect('debtortrans', 'dt', 'branchcode', 'branchcode');
            $addSelect('debtortrans', 'dt', 'shipvia', 'shipvia');
            $addSelect('debtortrans', 'dt', 'invtext', 'invoice_text');
            $addSelect('debtortrans', 'dt', 'consignment', 'consignment');
            $addSelect('debtorsmaster', 'dm', 'paymentterms', 'paymentterms');
            $addSelect('debtorsmaster', 'dm', 'invaddrbranch', 'invoice_addressing_branch', '0');
            $addSelect('custbranch', 'cb', 'salesman', 'salesman');

            if (Schema::hasTable('paymentterms') && Schema::hasColumn('paymentterms', 'termsindicator')) {
                $query
                    ->leftJoin('paymentterms as pt', 'pt.termsindicator', '=', 'dm.paymentterms')
                    ->addSelect(
                        'pt.terms as payment_terms_name',
                        'pt.dayinfollowingmonth',
                        'pt.daysbeforedue'
                    );
            } else {
                $query->addSelect(
                    DB::raw('NULL as payment_terms_name'),
                    DB::raw('0 as dayinfollowingmonth'),
                    DB::raw('0 as daysbeforedue')
                );
            }

            if (Schema::hasTable('salesorders')) {
                $query
                    ->leftJoin('salesorders as so', 'so.orderno', '=', 'dt.order_')
                    ->addSelect(
                        'so.orderno as order_number',
                        'so.orddate as order_date',
                        'so.deliverto',
                        'so.deladd1',
                        'so.deladd2',
                        'so.deladd3',
                        'so.deladd4',
                        'so.deladd5',
                        'so.deladd6',
                        'so.customerref',
                        'so.fromstkloc'
                    );
            } else {
                $query->addSelect(
                    DB::raw('NULL as order_number'),
                    DB::raw('NULL as order_date'),
                    DB::raw('NULL as deliverto'),
                    DB::raw('NULL as deladd1'),
                    DB::raw('NULL as deladd2'),
                    DB::raw('NULL as deladd3'),
                    DB::raw('NULL as deladd4'),
                    DB::raw('NULL as deladd5'),
                    DB::raw('NULL as deladd6'),
                    DB::raw('NULL as customerref'),
                    DB::raw('NULL as fromstkloc')
                );
            }

            if (Schema::hasTable('shippers') && Schema::hasColumn('debtortrans', 'shipvia')) {
                $query
                    ->leftJoin('shippers as sh', 'sh.shipper_id', '=', 'dt.shipvia')
                    ->addSelect('sh.shippername as shipper_name');
            } else {
                $query->addSelect(DB::raw('NULL as shipper_name'));
            }

            if (Schema::hasTable('locations') && Schema::hasTable('salesorders')) {
                $query
                    ->leftJoin('locations as loc', 'loc.loccode', '=', 'so.fromstkloc')
                    ->addSelect('loc.locationname as location_name');
            } else {
                $query->addSelect(DB::raw('NULL as location_name'));
            }

            if (Schema::hasTable('salesman') && Schema::hasColumn('custbranch', 'salesman')) {
                $query
                    ->leftJoin('salesman as sman', 'sman.salesmancode', '=', 'cb.salesman')
                    ->addSelect('sman.salesmanname as salesman_name');
            } else {
                $query->addSelect(DB::raw('NULL as salesman_name'));
            }

            $header = $query->first();

            if (!$header) {
                return response()->json([
                    'success' => false,
                    'message' => 'Transaction document was not found.',
                ], 404);
            }

            $rate = (float) ($header->rate ?? 1);
            $rate = abs($rate) > 0.0001 ? $rate : 1.0;
            $lines = collect();

            if (Schema::hasTable('stockmoves') && Schema::hasTable('stockmaster')) {
                $quantityExpression = $type === 10
                    ? '-COALESCE(sm.qty, 0)'
                    : 'COALESCE(sm.qty, 0)';
                $netExpression = $type === 10
                    ? '((1 - COALESCE(sm.discountpercent, 0)) * COALESCE(sm.price, 0) * ' . $rate . ' * -COALESCE(sm.qty, 0))'
                    : '((1 - COALESCE(sm.discountpercent, 0)) * COALESCE(sm.price, 0) * ' . $rate . ' * COALESCE(sm.qty, 0))';

                $lineQuery = DB::table('stockmoves as sm')
                    ->leftJoin('stockmaster as stk', 'stk.stockid', '=', 'sm.stockid')
                    ->where('sm.type', $type)
                    ->where('sm.transno', $transNo)
                    ->select(
                        'sm.stockid',
                        'stk.description',
                        'sm.discountpercent',
                        'sm.narrative',
                        'stk.units',
                        DB::raw($quantityExpression . ' as quantity'),
                        DB::raw('(COALESCE(sm.price, 0) * ' . $rate . ') as unit_price'),
                        DB::raw($netExpression . ' as net_amount')
                    );

                if (Schema::hasColumn('stockmoves', 'debtorno')) {
                    $lineQuery->where('sm.debtorno', (string) $header->debtorno);
                }

                if (Schema::hasColumn('stockmoves', 'branchcode') && trim((string) ($header->branchcode ?? '')) !== '') {
                    $lineQuery->where('sm.branchcode', (string) $header->branchcode);
                }

                if (Schema::hasColumn('stockmoves', 'show_on_inv_crds')) {
                    $lineQuery->where('sm.show_on_inv_crds', 1);
                }

                $lines = $lineQuery->orderBy('sm.stkmoveno')->get();
            }

            if ($lines->isEmpty()) {
                $lines = collect([(object) [
                    'stockid' => '',
                    'description' => $type === 10 ? 'Sales Invoice' : 'Credit Note',
                    'quantity' => 1,
                    'discountpercent' => 0,
                    'unit_price' => (float) ($header->ovamount ?? 0),
                    'net_amount' => (float) ($header->ovamount ?? 0),
                    'narrative' => (string) ($header->invoice_text ?? ''),
                    'units' => '',
                ]]);
            }

            $transactionDate = (string) ($header->trandate ?? '');
            $dueDate = '';
            if ($transactionDate !== '') {
                $baseDate = Carbon::parse($transactionDate);
                $dayInFollowingMonth = (int) ($header->dayinfollowingmonth ?? 0);
                $daysBeforeDue = (int) ($header->daysbeforedue ?? 0);
                $due = $dayInFollowingMonth > 0
                    ? $baseDate->copy()->firstOfMonth()->addMonthNoOverflow()->day(min($dayInFollowingMonth, $baseDate->copy()->firstOfMonth()->addMonthNoOverflow()->daysInMonth))
                    : $baseDate->copy()->addDays($daysBeforeDue > 0 ? $daysBeforeDue : 30);
                $dueDate = $due->toDateString();
            }

            $soldTo = collect([
                $header->customer_name ?? '',
                $header->address1 ?? '',
                $header->address2 ?? '',
                $header->address3 ?? '',
                $header->address4 ?? '',
                $header->address5 ?? '',
                $header->address6 ?? '',
            ])->map(fn ($part) => trim((string) $part))->filter()->values();
            $deliveredTo = collect([
                $header->deliverto ?? $header->brname ?? $header->customer_name ?? '',
                $header->deladd1 ?? $header->braddress1 ?? '',
                $header->deladd2 ?? $header->braddress2 ?? '',
                $header->deladd3 ?? $header->braddress3 ?? '',
                $header->deladd4 ?? $header->braddress4 ?? '',
                $header->deladd5 ?? $header->braddress5 ?? '',
                $header->deladd6 ?? $header->braddress6 ?? '',
            ])->map(fn ($part) => trim((string) $part))->filter()->values();

            return response()->json([
                'success' => true,
                'data' => [
                    'company' => $this->salesCompanyProfile(),
                    'transNo' => (string) $header->transno,
                    'transType' => (int) $header->type,
                    'debtorNo' => (string) $header->debtorno,
                    'branchCode' => (string) ($header->branchcode ?? ''),
                    'customerName' => (string) ($header->customer_name ?? ''),
                    'transactionDate' => $transactionDate,
                    'orderNo' => (string) ($header->order_number ?? $header->order_ ?? ''),
                    'orderDate' => (string) ($header->order_date ?? $transactionDate),
                    'customerReference' => (string) ($header->customerref ?? $header->reference ?? ''),
                    'salesPerson' => (string) ($header->salesman_name ?? $header->salesman ?? ''),
                    'dispatchDetail' => (string) ($header->shipper_name ?? ''),
                    'dispatchedFrom' => (string) ($header->location_name ?? $header->fromstkloc ?? ''),
                    'currencyCode' => (string) ($header->currcode ?? $this->companyCurrency()),
                    'paymentTerms' => (string) ($header->payment_terms_name ?? ''),
                    'dueDate' => $dueDate,
                    'taxReference' => (string) ($header->taxref ?? ''),
                    'soldTo' => $soldTo,
                    'deliveredTo' => $deliveredTo,
                    'subTotal' => (float) ($header->ovamount ?? 0),
                    'freight' => (float) ($header->ovfreight ?? 0),
                    'tax' => (float) ($header->ovgst ?? 0),
                    'discount' => (float) ($header->ovdiscount ?? 0),
                    'total' => (float) (($header->ovamount ?? 0) + ($header->ovgst ?? 0) + ($header->ovfreight ?? 0) - ($header->ovdiscount ?? 0)),
                    'lines' => $lines->map(static function ($line) {
                        return [
                            'stockId' => (string) ($line->stockid ?? ''),
                            'description' => (string) ($line->description ?? ''),
                            'quantity' => (float) ($line->quantity ?? 0),
                            'discountPercent' => (float) ($line->discountpercent ?? 0) * 100,
                            'unitPrice' => (float) ($line->unit_price ?? 0),
                            'netAmount' => (float) ($line->net_amount ?? 0),
                            'narrative' => (string) ($line->narrative ?? ''),
                            'units' => (string) ($line->units ?? ''),
                        ];
                    })->values(),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Unable to load transaction document.',
            ], 500);
        }
    }

    public function sendCustomerStatementEmail(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'debtorNo' => ['required', 'string', 'max:10'],
            'branchCode' => ['nullable', 'string', 'max:10'],
            'customerName' => ['required', 'string', 'max:255'],
            'to' => ['required', 'email', 'max:255'],
            'subject' => ['required', 'string', 'max:180'],
            'body' => ['nullable', 'string', 'max:10000'],
            'attachmentName' => ['required', 'string', 'max:180'],
            'attachmentBase64' => ['required', 'string'],
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
            $this->assertStatementCustomerExists(
                (string) $payload['debtorNo'],
                isset($payload['branchCode']) ? (string) $payload['branchCode'] : ''
            );

            $pdf = $this->decodeStatementAttachment((string) $payload['attachmentBase64']);
            $attachmentName = $this->statementAttachmentName((string) $payload['attachmentName']);
            $mailConfig = $this->configureStatementMailer();
            $to = trim((string) $payload['to']);
            $subject = trim((string) $payload['subject']);
            $body = trim((string) ($payload['body'] ?? ''));
            if ($body === '') {
                $body = 'Please find attached your customer statement.';
            }

            Mail::raw($body, function (Message $message) use ($to, $subject, $pdf, $attachmentName, $mailConfig) {
                $message
                    ->to($to)
                    ->from($mailConfig['fromAddress'], $mailConfig['fromName'])
                    ->subject($subject)
                    ->attachData($pdf, $attachmentName, ['mime' => 'application/pdf']);
            });

            return response()->json([
                'success' => true,
                'message' => 'Customer statement email sent.',
                'data' => [
                    'to' => $to,
                    'attachmentName' => $attachmentName,
                    'sentAt' => now()->toIso8601String(),
                    'mailer' => $mailConfig['mailer'],
                ],
            ]);
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Customer statement could not be sent. Check SMTP settings and try again.',
            ], 500);
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

    public function reportCustomerTrend(Request $request)
    {
        $today = Carbon::today();
        $from = $this->safeDate($request->query('from'), $today->copy()->subMonthsNoOverflow(2)->startOfMonth());
        $to = $this->safeDate($request->query('to'), $today);

        if ($from->greaterThan($to)) {
            [$from, $to] = [$to, $from];
        }

        $limit = $this->safeLimit($request->query('limit', 5), 1, 8);

        try {
            if (!Schema::hasTable('debtortrans')) {
                return response()->json([
                    'success' => true,
                    'data' => [
                        'currency' => $this->companyCurrency(),
                        'from' => $from->toDateString(),
                        'to' => $to->toDateString(),
                        'months' => $this->monthBuckets($from, $to),
                        'customers' => [],
                    ],
                ]);
            }

            $amountExpression = $this->debtorTransactionGrossExpression('dt');
            $transactionDate = $this->validDateTextExpression('dt.trandate');
            $topCustomers = DB::table('debtortrans as dt')
                ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'dt.debtorno')
                ->where('dt.type', 10)
                ->whereRaw($transactionDate . ' >= ?', [$from->toDateString()])
                ->whereRaw($transactionDate . ' <= ?', [$to->toDateString()])
                ->select(
                    'dt.debtorno',
                    DB::raw('COALESCE(NULLIF(dm.name, ""), dt.debtorno) as customer_name')
                )
                ->selectRaw('COUNT(*) as invoice_count')
                ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as gross_total')
                ->groupBy('dt.debtorno', 'dm.name')
                ->orderByDesc('gross_total')
                ->limit($limit)
                ->get();

            $debtorNos = $topCustomers->pluck('debtorno')->map(static function ($value) {
                return (string) $value;
            })->values()->all();
            $months = $this->monthBuckets($from, $to);

            $monthlyRows = collect();
            if (count($debtorNos) > 0) {
                $monthExpression = $this->monthKeyExpression($transactionDate);
                $monthlyRows = DB::table('debtortrans as dt')
                    ->where('dt.type', 10)
                    ->whereIn('dt.debtorno', $debtorNos)
                    ->whereRaw($transactionDate . ' >= ?', [$from->toDateString()])
                    ->whereRaw($transactionDate . ' <= ?', [$to->toDateString()])
                    ->select('dt.debtorno')
                    ->selectRaw($monthExpression . ' as month_key')
                    ->selectRaw('COUNT(*) as invoice_count')
                    ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as gross_total')
                    ->groupBy('dt.debtorno')
                    ->groupByRaw($monthExpression)
                    ->get()
                    ->keyBy(function ($row) {
                        return (string) $row->debtorno . '|' . (string) $row->month_key;
                    });
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'currency' => $this->companyCurrency(),
                    'from' => $from->toDateString(),
                    'to' => $to->toDateString(),
                    'months' => $months,
                    'customers' => $topCustomers->map(function ($customer) use ($months, $monthlyRows) {
                        return [
                            'debtorNo' => (string) $customer->debtorno,
                            'customerName' => (string) $customer->customer_name,
                            'invoiceCount' => (int) $customer->invoice_count,
                            'grossTotal' => round((float) $customer->gross_total, 2),
                            'points' => collect($months)->map(function ($month) use ($customer, $monthlyRows) {
                                $row = $monthlyRows->get((string) $customer->debtorno . '|' . $month['month']);

                                return [
                                    'month' => $month['month'],
                                    'invoiceCount' => (int) ($row->invoice_count ?? 0),
                                    'grossTotal' => round((float) ($row->gross_total ?? 0), 2),
                                ];
                            })->values(),
                        ];
                    })->values(),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [
                    'currency' => $this->companyCurrency(),
                    'from' => $from->toDateString(),
                    'to' => $to->toDateString(),
                    'months' => $this->monthBuckets($from, $to),
                    'customers' => [],
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

    public function customerOrderSearch(Request $request)
    {
        $limit = $this->safeLimit($request->query('limit', 160), 20, 600);
        $partLimit = $this->safeLimit($request->query('partLimit', 200), 20, 500);
        $defaultFromDate = Carbon::today()->subMonthsNoOverflow(2)->startOfMonth()->toDateString();
        $defaultToDate = Carbon::today()->toDateString();
        $debtorNo = trim((string) $request->query('debtorNo', ''));
        $orderNo = trim((string) $request->query('orderNo', ''));
        $customerRef = trim((string) $request->query('customerRef', ''));
        $searchTerm = trim((string) $request->query('searchTerm', ''));
        $fromDate = $this->requestDateOrDefault($request->query('fromDate'), $defaultFromDate);
        $toDate = $this->requestDateOrDefault($request->query('toDate'), $defaultToDate);
        if ($fromDate > $toDate) {
            [$fromDate, $toDate] = [$toDate, $fromDate];
        }
        $completedOnly = $this->requestBoolean($request->query('completedOnly', false));
        $status = strtolower(trim((string) $request->query('status', $completedOnly ? 'completed' : 'all')));
        if (!in_array($status, ['all', 'open', 'completed'], true)) {
            $status = 'all';
        }
        $partSearch = $this->requestBoolean($request->query('partSearch', false));
        $selectedStockId = trim((string) $request->query('selectedStockId', ''));
        $stockCategory = trim((string) $request->query('stockCategory', ''));
        $itemSearch = trim((string) $request->query('itemSearch', ''));
        $description = trim((string) $request->query('description', ''));
        $stockCode = trim((string) $request->query('stockCode', ''));

        try {
            $categories = $this->customerOrderStockCategories();
            if ($stockCategory === '' && count($categories) > 0) {
                $stockCategory = (string) $categories[0]['value'];
            }

            $shouldSearchParts = $partSearch || $itemSearch !== '' || $description !== '' || $stockCode !== '';
            $parts = $shouldSearchParts
                ? $this->customerOrderPartRows($stockCategory, $itemSearch, $description, $stockCode, $status === 'completed', $partLimit)
                : [];

            if ($selectedStockId === '' && $itemSearch === '' && count($parts) === 1) {
                $selectedStockId = (string) $parts[0]['stockId'];
            }

            $orders = $this->customerOrderRows(
                $debtorNo,
                $orderNo,
                $customerRef,
                $searchTerm,
                $fromDate,
                $toDate,
                $status,
                $selectedStockId,
                $limit
            );

            return response()->json([
                'success' => true,
                'data' => [
                    'currency' => $this->companyCurrency(),
                    'filters' => [
                        'debtorNo' => $debtorNo,
                        'orderNo' => $orderNo,
                        'customerRef' => $customerRef,
                        'searchTerm' => $searchTerm,
                        'fromDate' => $fromDate,
                        'toDate' => $toDate,
                        'completedOnly' => $status === 'completed',
                        'status' => $status,
                        'selectedStockId' => $selectedStockId,
                        'stockCategory' => $stockCategory,
                        'itemSearch' => $itemSearch,
                        'description' => $description,
                        'stockCode' => $stockCode,
                    ],
                    'categories' => $categories,
                    'parts' => $parts,
                    'orders' => $orders,
                    'summary' => $this->customerOrderSearchSummary($orders, $parts, $selectedStockId),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => true,
                'data' => [
                    'currency' => $this->companyCurrency(),
                    'filters' => [
                        'debtorNo' => $debtorNo,
                        'orderNo' => $orderNo,
                        'customerRef' => $customerRef,
                        'searchTerm' => $searchTerm,
                        'fromDate' => $fromDate,
                        'toDate' => $toDate,
                        'completedOnly' => $status === 'completed',
                        'status' => $status,
                        'selectedStockId' => $selectedStockId,
                        'stockCategory' => $stockCategory,
                        'itemSearch' => $itemSearch,
                        'description' => $description,
                        'stockCode' => $stockCode,
                    ],
                    'categories' => [],
                    'parts' => [],
                    'orders' => [],
                    'summary' => [
                        'orders' => 0,
                        'openOrders' => 0,
                        'completedOrders' => 0,
                        'totalValue' => 0,
                        'selectedStockId' => $selectedStockId,
                        'selectedStockDescription' => '',
                    ],
                ],
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
                    DB::raw('CASE WHEN sod.unitprice = 0 THEN 0 ELSE ROUND(((sod.unitprice - COALESCE(sm.materialcost, 0)) * 100.0 / sod.unitprice), 2) END as gross_margin_pct')
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

    private function invoiceSummary(Carbon $from, Carbon $to): array
    {
        if (!Schema::hasTable('debtortrans')) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $amountExpression = $this->debtorTransactionGrossExpression('dt');
        $row = DB::table('debtortrans as dt')
            ->where('dt.type', 10)
            ->whereDate('dt.trandate', '>=', $from->toDateString())
            ->whereDate('dt.trandate', '<=', $to->toDateString())
            ->selectRaw('COUNT(*) as invoice_count')
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as gross_total')
            ->first();

        return [
            'amount' => (float) ($row->gross_total ?? 0),
            'count' => (int) ($row->invoice_count ?? 0),
        ];
    }

    private function openOrderSummary(): array
    {
        if (!Schema::hasTable('salesorders') || !Schema::hasTable('salesorderdetails')) {
            return ['orders' => 0, 'lines' => 0, 'value' => 0.0, 'lateOrders' => 0];
        }

        $remainingQuantity = $this->remainingSalesQuantityExpression();
        $remainingValue = $this->remainingSalesValueExpression();
        $deliveryDate = $this->validDateTextExpression('so.deliverydate');
        $today = Carbon::today()->toDateString();
        $query = DB::table('salesorders as so')
            ->join('salesorderdetails as sod', 'sod.orderno', '=', 'so.orderno')
            ->whereRaw($remainingQuantity . ' > 0');

        if (Schema::hasColumn('salesorders', 'quotation')) {
            $query->where('so.quotation', 0);
        }

        $row = $query
            ->selectRaw('COUNT(DISTINCT so.orderno) as open_orders')
            ->selectRaw('COUNT(*) as open_lines')
            ->selectRaw('COALESCE(SUM(' . $remainingValue . '), 0) as open_value')
            ->selectRaw(
                "COUNT(DISTINCT CASE WHEN $deliveryDate IS NOT NULL AND $deliveryDate < ? THEN so.orderno END) as late_orders",
                [$today],
            )
            ->first();

        return [
            'orders' => (int) ($row->open_orders ?? 0),
            'lines' => (int) ($row->open_lines ?? 0),
            'value' => (float) ($row->open_value ?? 0),
            'lateOrders' => (int) ($row->late_orders ?? 0),
        ];
    }

    private function pickingSummary(): array
    {
        if (!Schema::hasTable('salesorders') || !Schema::hasTable('salesorderdetails')) {
            return ['orders' => 0, 'quantity' => 0.0];
        }

        $remainingQuantity = $this->remainingSalesQuantityExpression();
        $itemDueDate = $this->validDateTextExpression('sod.itemdue');
        $deliveryDate = $this->validDateTextExpression('so.deliverydate');
        $dueDateExpression = "COALESCE($itemDueDate, $deliveryDate)";
        $today = Carbon::today()->toDateString();
        $query = DB::table('salesorders as so')
            ->join('salesorderdetails as sod', 'sod.orderno', '=', 'so.orderno')
            ->whereRaw($remainingQuantity . ' > 0')
            ->whereRaw($dueDateExpression . ' <= ?', [$today]);

        if (Schema::hasColumn('salesorders', 'quotation')) {
            $query->where('so.quotation', 0);
        }

        $row = $query
            ->selectRaw('COUNT(DISTINCT so.orderno) as pick_orders')
            ->selectRaw('COALESCE(SUM(' . $remainingQuantity . '), 0) as pick_quantity')
            ->first();

        return [
            'orders' => (int) ($row->pick_orders ?? 0),
            'quantity' => (float) ($row->pick_quantity ?? 0),
        ];
    }

    private function openReceivablesSummary(): array
    {
        if (!Schema::hasTable('debtortrans')) {
            return ['amount' => 0.0, 'count' => 0];
        }

        $amountExpression = $this->debtorTransactionOpenExpression('dt');
        $query = DB::table('debtortrans as dt')
            ->where('dt.type', 10)
            ->whereRaw($amountExpression . ' > 0.004');

        if (Schema::hasColumn('debtortrans', 'settled')) {
            $query->where('dt.settled', 0);
        }

        $row = $query
            ->selectRaw('COUNT(*) as open_invoices')
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as open_amount')
            ->first();

        return [
            'amount' => (float) ($row->open_amount ?? 0),
            'count' => (int) ($row->open_invoices ?? 0),
        ];
    }

    private function lowMarginSummary(float $threshold = 20.0): array
    {
        if (!Schema::hasTable('salesorderdetails') || !Schema::hasTable('stockmaster')) {
            return ['lines' => 0, 'value' => 0.0];
        }

        $lineValue = $this->salesLineValueExpression();
        $unitCost = $this->stockUnitCostExpression('sm');
        $marginExpression = 'CASE WHEN COALESCE(sod.unitprice, 0) <= 0 THEN 0 ELSE ROUND(((COALESCE(sod.unitprice, 0) - (' . $unitCost . ')) * 100.0 / COALESCE(sod.unitprice, 1)), 2) END';

        $row = DB::table('salesorderdetails as sod')
            ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'sod.stkcode')
            ->where('sod.quantity', '>', 0)
            ->whereRaw($marginExpression . ' < CAST(? AS DECIMAL(18,4))', [$threshold])
            ->selectRaw('COUNT(*) as low_margin_lines')
            ->selectRaw('COALESCE(SUM(' . $lineValue . '), 0) as low_margin_value')
            ->first();

        return [
            'lines' => (int) ($row->low_margin_lines ?? 0),
            'value' => (float) ($row->low_margin_value ?? 0),
        ];
    }

    private function dailySalesTrend(int $days): array
    {
        if (!Schema::hasTable('debtortrans')) {
            return [];
        }

        $start = Carbon::today()->subDays($days - 1);
        $amountExpression = $this->debtorTransactionGrossExpression('dt');
        $rows = DB::table('debtortrans as dt')
            ->where('dt.type', 10)
            ->whereDate('dt.trandate', '>=', $start->toDateString())
            ->selectRaw('DATE(dt.trandate) as day_key')
            ->selectRaw('COUNT(*) as invoice_count')
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as gross_total')
            ->groupBy('day_key')
            ->get()
            ->keyBy('day_key');

        return collect(range(0, $days - 1))
            ->map(function (int $offset) use ($start, $rows) {
                $day = $start->copy()->addDays($offset)->toDateString();
                $row = $rows->get($day);

                return [
                    'day' => $day,
                    'invoiceCount' => (int) ($row->invoice_count ?? 0),
                    'grossTotal' => round((float) ($row->gross_total ?? 0), 2),
                ];
            })
            ->all();
    }

    private function dashboardTopCustomers(Carbon $from, Carbon $to): array
    {
        if (!Schema::hasTable('debtortrans')) {
            return [];
        }

        $amountExpression = $this->debtorTransactionGrossExpression('dt');

        return DB::table('debtortrans as dt')
            ->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'dt.debtorno')
            ->where('dt.type', 10)
            ->whereDate('dt.trandate', '>=', $from->toDateString())
            ->whereDate('dt.trandate', '<=', $to->toDateString())
            ->select(
                'dt.debtorno',
                DB::raw('COALESCE(NULLIF(dm.name, ""), dt.debtorno) as customer_name'),
            )
            ->selectRaw('COUNT(*) as invoice_count')
            ->selectRaw('COALESCE(SUM(' . $amountExpression . '), 0) as gross_total')
            ->groupBy('dt.debtorno', 'dm.name')
            ->orderByDesc('gross_total')
            ->limit(5)
            ->get()
            ->map(function ($row) {
                return [
                    'debtorNo' => (string) $row->debtorno,
                    'customerName' => (string) $row->customer_name,
                    'invoiceCount' => (int) $row->invoice_count,
                    'grossTotal' => round((float) $row->gross_total, 2),
                ];
            })
            ->all();
    }

    private function dashboardTopItems(Carbon $from, Carbon $to): array
    {
        if (!Schema::hasTable('salesorders') || !Schema::hasTable('salesorderdetails')) {
            return [];
        }

        $lineValue = $this->salesLineValueExpression();

        return DB::table('salesorderdetails as sod')
            ->join('salesorders as so', 'so.orderno', '=', 'sod.orderno')
            ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'sod.stkcode')
            ->whereDate('so.orddate', '>=', $from->toDateString())
            ->whereDate('so.orddate', '<=', $to->toDateString())
            ->select(
                'sod.stkcode',
                DB::raw('COALESCE(NULLIF(sm.description, ""), sod.stkcode) as description'),
            )
            ->selectRaw('COALESCE(SUM(sod.quantity), 0) as total_qty')
            ->selectRaw('COALESCE(SUM(' . $lineValue . '), 0) as gross_total')
            ->groupBy('sod.stkcode', 'sm.description')
            ->havingRaw('COALESCE(SUM(sod.quantity), 0) > 0')
            ->orderByDesc('gross_total')
            ->limit(5)
            ->get()
            ->map(function ($row) {
                return [
                    'stockId' => (string) $row->stkcode,
                    'description' => (string) $row->description,
                    'quantity' => round((float) $row->total_qty, 2),
                    'grossTotal' => round((float) $row->gross_total, 2),
                ];
            })
            ->all();
    }

    private function salesActionQueue(array $summary): array
    {
        $currency = $this->companyCurrency();
        $actions = [];

        if ((int) $summary['lateOrders'] > 0) {
            $actions[] = $this->salesAction(
                'late-orders',
                1,
                'Clear late deliveries first',
                (int) $summary['lateOrders'] . ' open orders are past their delivery date.',
                'danger',
                (float) $summary['openOrderValue'],
                $currency,
                'Open late orders',
                'order-delivery-differences-report',
            );
        }

        if ((int) $summary['readyToPickOrders'] > 0) {
            $actions[] = $this->salesAction(
                'ready-to-pick',
                2,
                'Print picking lists for due orders',
                (int) $summary['readyToPickOrders'] . ' orders have open quantity due now.',
                'pending',
                (float) $summary['readyToPickQuantity'],
                '',
                'Open picking queue',
                'print-picking-lists',
            );
        }

        if ((int) $summary['openReceivableInvoices'] > 0) {
            $actions[] = $this->salesAction(
                'receivables-follow-up',
                3,
                'Follow up open customer invoices',
                (int) $summary['openReceivableInvoices'] . ' invoices are still unpaid.',
                'warning',
                (float) $summary['openReceivableValue'],
                $currency,
                'Open invoiced sales',
                'orders-invoiced-reports',
            );
        }

        if ((int) $summary['lowMarginLines'] > 0) {
            $actions[] = $this->salesAction(
                'low-margin-review',
                4,
                'Review low-margin sales lines',
                (int) $summary['lowMarginLines'] . ' lines are below the gross margin threshold.',
                'danger',
                (float) $summary['lowMarginValue'],
                $currency,
                'Open margin report',
                'sales-with-low-gross-profit-report',
            );
        }

        if ((float) $summary['monthGrowthPct'] < 0) {
            $actions[] = $this->salesAction(
                'month-sales-down',
                5,
                'Investigate month-on-month sales drop',
                'This month is tracking below the previous month.',
                'info',
                abs((float) $summary['monthGrowthPct']),
                '%',
                'Open sales analysis',
                'daily-sales-inquiry',
            );
        }

        if (count($actions) === 0) {
            $actions[] = [
                'id' => 'sales-clear',
                'priority' => 1,
                'title' => 'No urgent sales exceptions',
                'detail' => 'Revenue, fulfilment, margin, and collection signals are below escalation thresholds.',
                'tone' => 'success',
                'value' => 0,
                'valueLabel' => 'Clear',
                'actionLabel' => 'Review trend',
                'drawerKey' => 'daily-sales-inquiry',
            ];
        }

        return collect($actions)
            ->sortBy('priority')
            ->values()
            ->take(5)
            ->all();
    }

    private function salesAction(string $id, int $priority, string $title, string $detail, string $tone, float $value, string $currency, string $actionLabel, string $drawerKey): array
    {
        return [
            'id' => $id,
            'priority' => $priority,
            'title' => $title,
            'detail' => $detail,
            'tone' => $tone,
            'value' => round($value, 2),
            'valueLabel' => $currency === '%'
                ? number_format($value, 1) . '%'
                : ($currency !== '' ? $currency . ' ' . number_format($value, 0) : number_format($value, 2)),
            'actionLabel' => $actionLabel,
            'drawerKey' => $drawerKey,
        ];
    }

    private function debtorTransactionGrossExpression(string $alias): string
    {
        return '('
            . 'COALESCE(' . $alias . '.ovamount, 0) + '
            . 'COALESCE(' . $alias . '.ovgst, 0) + '
            . 'COALESCE(' . $alias . '.ovfreight, 0) - '
            . 'COALESCE(' . $alias . '.ovdiscount, 0)'
            . ')';
    }

    private function debtorTransactionOpenExpression(string $alias): string
    {
        return '(' . $this->debtorTransactionGrossExpression($alias) . ' - COALESCE(' . $alias . '.alloc, 0))';
    }

    private function remainingSalesQuantityExpression(): string
    {
        return '(CASE WHEN COALESCE(sod.quantity, 0) - COALESCE(sod.qtyinvoiced, 0) > 0 THEN COALESCE(sod.quantity, 0) - COALESCE(sod.qtyinvoiced, 0) ELSE 0 END)';
    }

    private function salesLineValueExpression(): string
    {
        return $this->salesOrderLineValueExpression('sod');
    }

    private function remainingSalesValueExpression(): string
    {
        return '(' . $this->remainingSalesQuantityExpression() . ' * COALESCE(sod.unitprice, 0) * (1 - ' . $this->salesOrderDiscountFractionExpression('sod') . '))';
    }

    private function stockUnitCostExpression(string $alias): string
    {
        $parts = [];

        foreach (['materialcost', 'labourcost', 'overheadcost'] as $column) {
            if (Schema::hasColumn('stockmaster', $column)) {
                $parts[] = 'COALESCE(' . $alias . '.' . $column . ', 0)';
            }
        }

        return count($parts) > 0 ? '(' . implode(' + ', $parts) . ')' : '0';
    }

    private function validDateTextExpression(string $column): string
    {
        return "NULLIF(CAST($column AS CHAR), '0000-00-00')";
    }

    private function monthKeyExpression(string $column): string
    {
        return DB::connection()->getDriverName() === 'sqlite'
            ? "strftime('%Y-%m', $column)"
            : "DATE_FORMAT($column, '%Y-%m')";
    }

    private function safeDate($value, Carbon $fallback): Carbon
    {
        try {
            $raw = trim((string) $value);
            if ($raw === '') {
                return $fallback->copy();
            }

            return Carbon::parse($raw);
        } catch (\Throwable) {
            return $fallback->copy();
        }
    }

    private function monthBuckets(Carbon $from, Carbon $to): array
    {
        $cursor = $from->copy()->startOfMonth();
        $end = $to->copy()->startOfMonth();
        $months = [];

        while ($cursor->lessThanOrEqualTo($end)) {
            $months[] = [
                'month' => $cursor->format('Y-m'),
                'label' => $cursor->format('M Y'),
            ];
            $cursor->addMonthNoOverflow();
        }

        return $months;
    }

    private function growthPercent(float $current, float $previous): float
    {
        if (abs($previous) < 0.0001) {
            return $current > 0 ? 100.0 : 0.0;
        }

        return round((($current - $previous) / abs($previous)) * 100, 1);
    }

    private function assertStatementCustomerExists(string $debtorNo, string $branchCode): void
    {
        if (!Schema::hasTable('debtorsmaster')) {
            throw new \InvalidArgumentException('Customer records are not available.');
        }

        $customerExists = DB::table('debtorsmaster')
            ->where('debtorno', $debtorNo)
            ->exists();

        if (!$customerExists) {
            throw new \InvalidArgumentException('Selected customer was not found.');
        }

        if ($branchCode === '' || !Schema::hasTable('custbranch')) {
            return;
        }

        $branchExists = DB::table('custbranch')
            ->where('debtorno', $debtorNo)
            ->where('branchcode', $branchCode)
            ->exists();

        if (!$branchExists) {
            throw new \InvalidArgumentException('Selected customer branch was not found.');
        }
    }

    private function decodeStatementAttachment(string $attachmentBase64): string
    {
        $normalized = preg_replace('/\s+/', '', trim($attachmentBase64)) ?? '';
        if (str_starts_with($normalized, 'data:') && str_contains($normalized, ',')) {
            $normalized = substr($normalized, strpos($normalized, ',') + 1);
        }

        $pdf = base64_decode($normalized, true);
        if ($pdf === false || substr($pdf, 0, 4) !== '%PDF') {
            throw new \InvalidArgumentException('Statement attachment must be a valid PDF.');
        }

        if (strlen($pdf) > 10 * 1024 * 1024) {
            throw new \InvalidArgumentException('Statement PDF is too large to email.');
        }

        return $pdf;
    }

    private function statementAttachmentName(string $attachmentName): string
    {
        $baseName = basename(str_replace('\\', '/', $attachmentName));
        $safeName = preg_replace('/[^A-Za-z0-9._-]+/', '-', $baseName) ?? '';
        $safeName = trim($safeName, '.-');
        if ($safeName === '') {
            $safeName = 'customer-statement.pdf';
        }

        if (!str_ends_with(strtolower($safeName), '.pdf')) {
            $safeName .= '.pdf';
        }

        return $safeName;
    }

    /**
     * @return array{mailer: string, fromAddress: string, fromName: string}
     */
    private function configureStatementMailer(): array
    {
        $company = $this->salesCompanyProfile();
        $companyEmail = trim((string) ($company['email'] ?? ''));
        $defaultFromAddress = trim((string) config('mail.from.address', ''));
        $defaultFromName = trim((string) config('mail.from.name', ''));

        if ($this->smtpMailEnabled()) {
            $setting = $this->mailSetting();
            if (!$setting || trim((string) $setting->host) === '') {
                throw new \InvalidArgumentException('SMTP mail is enabled but server settings are incomplete.');
            }

            $fromAddress = trim((string) ($setting->from_address ?? '')) ?: $companyEmail ?: $defaultFromAddress;
            if (!filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) {
                throw new \InvalidArgumentException('A valid SMTP from address is required before sending customer statements.');
            }

            $fromName = trim((string) ($setting->from_name ?? '')) ?: (string) ($company['name'] ?? '') ?: $defaultFromName ?: 'Akiva';
            $encryption = strtolower(trim((string) ($setting->encryption ?? 'none')));
            $scheme = $encryption === 'ssl' ? 'smtps' : 'smtp';
            $usesAuth = (bool) ($setting->auth ?? false);
            $heloAddress = trim((string) ($setting->heloaddress ?? ''));

            config([
                'mail.default' => 'smtp',
                'mail.mailers.smtp.transport' => 'smtp',
                'mail.mailers.smtp.scheme' => $scheme,
                'mail.mailers.smtp.host' => trim((string) $setting->host),
                'mail.mailers.smtp.port' => (int) ($setting->port ?: 25),
                'mail.mailers.smtp.username' => $usesAuth ? trim((string) $setting->username) : null,
                'mail.mailers.smtp.password' => $usesAuth ? (string) $setting->password : null,
                'mail.mailers.smtp.timeout' => (int) ($setting->timeout ?: 10),
                'mail.mailers.smtp.auto_tls' => $encryption !== 'none',
                'mail.mailers.smtp.require_tls' => $encryption === 'tls',
                'mail.mailers.smtp.local_domain' => $heloAddress !== '' ? $heloAddress : config('mail.mailers.smtp.local_domain'),
                'mail.from.address' => $fromAddress,
                'mail.from.name' => $fromName,
            ]);

            Mail::purge('smtp');
            Mail::setDefaultDriver('smtp');

            return [
                'mailer' => 'smtp',
                'fromAddress' => $fromAddress,
                'fromName' => $fromName,
            ];
        }

        $mailer = (string) config('mail.default', 'log');
        if (in_array($mailer, ['array', 'log'], true)) {
            throw new \InvalidArgumentException('SMTP mail is not enabled. Turn on SMTP mail before sending customer statements.');
        }

        $fromAddress = $companyEmail ?: $defaultFromAddress;
        if (!filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('A valid from address is required before sending customer statements.');
        }

        $fromName = (string) ($company['name'] ?? '') ?: $defaultFromName ?: 'Akiva';
        config([
            'mail.from.address' => $fromAddress,
            'mail.from.name' => $fromName,
        ]);
        Mail::purge($mailer);
        Mail::setDefaultDriver($mailer);

        return [
            'mailer' => $mailer,
            'fromAddress' => $fromAddress,
            'fromName' => $fromName,
        ];
    }

    private function smtpMailEnabled(): bool
    {
        if (!Schema::hasTable('config')) {
            return false;
        }

        return (string) DB::table('config')->where('confname', 'SmtpSetting')->value('confvalue') === '1';
    }

    private function mailSetting(): ?EmailSetting
    {
        if (!Schema::hasTable('emailsettings')) {
            return null;
        }

        return EmailSetting::query()->orderBy('id')->first();
    }

    private function companyCurrency(): string
    {
        if (!Schema::hasTable('companies')) {
            return 'TZS';
        }

        $currency = strtoupper(trim((string) DB::table('companies')->where('coycode', 1)->value('currencydefault')));

        return preg_match('/^[A-Z]{3}$/', $currency) ? $currency : 'TZS';
    }

    private function customerOrderStockCategories(): array
    {
        if (!Schema::hasTable('stockcategory')) {
            return [];
        }

        return DB::table('stockcategory')
            ->select('categoryid', 'categorydescription')
            ->orderBy('categorydescription')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->categoryid,
                'label' => (string) ($row->categorydescription ?: $row->categoryid),
                'code' => (string) $row->categoryid,
            ])
            ->values()
            ->all();
    }

    private function customerOrderPartRows(
        string $stockCategory,
        string $itemSearch,
        string $description,
        string $stockCode,
        bool $completedOnly,
        int $limit
    ): array {
        if (!Schema::hasTable('stockmaster')) {
            return [];
        }

        $query = DB::table('stockmaster as sm')
            ->select(
                'sm.stockid',
                'sm.description',
                DB::raw("COALESCE(NULLIF(sm.units, ''), 'each') as units"),
                DB::raw('COALESCE(sm.decimalplaces, 0) as decimalplaces')
            );

        if (Schema::hasTable('locstock')) {
            $onHand = DB::table('locstock')
                ->select('stockid')
                ->selectRaw('COALESCE(SUM(quantity), 0) as on_hand')
                ->groupBy('stockid');

            $query
                ->leftJoinSub($onHand, 'qoh', 'qoh.stockid', '=', 'sm.stockid')
                ->addSelect(DB::raw('COALESCE(qoh.on_hand, 0) as on_hand'));
        } else {
            $query->addSelect(DB::raw('0 as on_hand'));
        }

        if (
            Schema::hasTable('purchorderdetails')
            && Schema::hasColumn('purchorderdetails', 'itemcode')
        ) {
            $purchaseOrders = DB::table('purchorderdetails')
                ->select('itemcode')
                ->selectRaw('COALESCE(SUM(GREATEST(COALESCE(quantityord, 0) - COALESCE(quantityrecd, 0), 0)), 0) as purchase_orders')
                ->groupBy('itemcode');

            $query
                ->leftJoinSub($purchaseOrders, 'qoo', 'qoo.itemcode', '=', 'sm.stockid')
                ->addSelect(DB::raw('COALESCE(qoo.purchase_orders, 0) as purchase_orders'));
        } else {
            $query->addSelect(DB::raw('0 as purchase_orders'));
        }

        if (Schema::hasTable('salesorderdetails')) {
            $salesOrders = DB::table('salesorderdetails')
                ->select('stkcode')
                ->selectRaw('COALESCE(SUM(GREATEST(COALESCE(quantity, 0) - COALESCE(qtyinvoiced, 0), 0)), 0) as sales_orders')
                ->groupBy('stkcode');

            if ($completedOnly && Schema::hasColumn('salesorderdetails', 'completed')) {
                $salesOrders->where('completed', 1);
            }

            $query
                ->leftJoinSub($salesOrders, 'qdem', 'qdem.stkcode', '=', 'sm.stockid')
                ->addSelect(DB::raw('COALESCE(qdem.sales_orders, 0) as sales_orders'));
        } else {
            $query->addSelect(DB::raw('0 as sales_orders'));
        }

        if ($stockCategory !== '' && Schema::hasColumn('stockmaster', 'categoryid')) {
            $query->where('sm.categoryid', $stockCategory);
        }

        if ($itemSearch !== '') {
            $like = '%' . preg_replace('/\s+/', '%', trim($itemSearch)) . '%';
            $query->where(function ($builder) use ($like) {
                $builder
                    ->where('sm.stockid', 'like', $like)
                    ->orWhere('sm.description', 'like', $like);
            });
        } elseif ($description !== '') {
            $keywords = '%' . preg_replace('/\s+/', '%', trim($description)) . '%';
            $query->where('sm.description', 'like', $keywords);
        } elseif ($stockCode !== '') {
            $query->where('sm.stockid', 'like', '%' . $stockCode . '%');
        }

        return $query
            ->orderBy('sm.stockid')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'stockId' => (string) $row->stockid,
                'description' => (string) ($row->description ?? $row->stockid),
                'onHand' => round((float) $row->on_hand, 4),
                'purchaseOrders' => round((float) $row->purchase_orders, 4),
                'salesOrders' => round((float) $row->sales_orders, 4),
                'units' => (string) ($row->units ?? 'each'),
                'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
            ])
            ->values()
            ->all();
    }

    private function customerOrderRows(
        string $debtorNo,
        string $orderNo,
        string $customerRef,
        string $searchTerm,
        string $fromDate,
        string $toDate,
        string $status,
        string $selectedStockId,
        int $limit
    ): array {
        if (!Schema::hasTable('salesorders') || !Schema::hasTable('salesorderdetails')) {
            return [];
        }

        $hasDebtors = Schema::hasTable('debtorsmaster');
        $hasBranches = Schema::hasTable('custbranch');
        $customerNameExpression = $hasDebtors
            ? 'COALESCE(NULLIF(dm.name, ""), NULLIF(so.deliverto, ""), so.debtorno)'
            : 'COALESCE(NULLIF(so.deliverto, ""), so.debtorno)';
        $branchNameExpression = $hasBranches
            ? 'COALESCE(NULLIF(cb.brname, ""), so.branchcode, "")'
            : 'COALESCE(so.branchcode, "")';
        $deliveryToExpression = $hasBranches
            ? 'COALESCE(NULLIF(so.deliverto, ""), NULLIF(cb.brname, ""), "")'
            : 'COALESCE(NULLIF(so.deliverto, ""), "")';

        $query = DB::table('salesorders as so')
            ->leftJoin('salesorderdetails as sod', 'sod.orderno', '=', 'so.orderno');

        if ($hasDebtors) {
            $query->leftJoin('debtorsmaster as dm', 'dm.debtorno', '=', 'so.debtorno');
        }

        if ($hasBranches) {
            $query->leftJoin('custbranch as cb', function ($join) {
                $join
                    ->on('cb.debtorno', '=', 'so.debtorno')
                    ->on('cb.branchcode', '=', 'so.branchcode');
            });
        }

        $query
            ->select(
                'so.orderno',
                'so.debtorno',
                'so.branchcode',
                'so.customerref',
                'so.orddate',
                'so.deliverydate',
                DB::raw($customerNameExpression . ' as customer_name'),
                DB::raw($branchNameExpression . ' as branch_name'),
                DB::raw($deliveryToExpression . ' as delivery_to'),
                DB::raw('COUNT(sod.stkcode) as line_count'),
                DB::raw('COALESCE(SUM(CASE WHEN sod.completed = 1 OR sod.qtyinvoiced >= sod.quantity THEN 1 ELSE 0 END), 0) as completed_lines'),
                DB::raw('COALESCE(SUM(' . $this->salesOrderLineValueExpression('sod') . '), 0) as gross_total')
            );

        if (Schema::hasColumn('salesorders', 'quotation')) {
            $query->where('so.quotation', 0);
        }

        if ($debtorNo !== '') {
            $query->where('so.debtorno', $debtorNo);
        }

        if ($orderNo !== '') {
            $query->where('so.orderno', $orderNo);
        } elseif ($customerRef !== '') {
            $query->where('so.customerref', 'like', '%' . $customerRef . '%');
        } else {
            $query->whereDate('so.orddate', '>=', $fromDate);
            $query->whereDate('so.orddate', '<=', $toDate);

            if ($searchTerm !== '') {
                $like = '%' . $searchTerm . '%';
                $query->where(function ($builder) use ($like, $hasDebtors, $hasBranches) {
                    $builder
                        ->where('so.orderno', 'like', $like)
                        ->orWhere('so.customerref', 'like', $like)
                        ->orWhere('so.debtorno', 'like', $like)
                        ->orWhere('so.deliverto', 'like', $like)
                        ->orWhere('so.branchcode', 'like', $like);

                    if ($hasDebtors) {
                        $builder->orWhere('dm.name', 'like', $like);
                    }

                    if ($hasBranches) {
                        $builder->orWhere('cb.brname', 'like', $like);
                    }
                });
            }

            if ($selectedStockId !== '') {
                $query->whereExists(function ($subQuery) use ($selectedStockId) {
                    $subQuery
                        ->select(DB::raw(1))
                        ->from('salesorderdetails as matched_sod')
                        ->whereColumn('matched_sod.orderno', 'so.orderno')
                        ->where('matched_sod.stkcode', $selectedStockId);
                });
            }
        }

        $groupBy = [
            'so.orderno',
            'so.debtorno',
            'so.branchcode',
            'so.customerref',
            'so.orddate',
            'so.deliverydate',
            'so.deliverto',
        ];

        if ($hasDebtors) {
            $groupBy[] = 'dm.name';
        }

        if ($hasBranches) {
            $groupBy[] = 'cb.brname';
        }

        $query->groupBy(...$groupBy);

        if ($status === 'completed') {
            $query->havingRaw('line_count > 0 AND completed_lines >= line_count');
        } elseif ($status === 'open') {
            $query->havingRaw('line_count = 0 OR completed_lines < line_count');
        }

        return $query
            ->orderByDesc('so.orderno')
            ->limit($limit)
            ->get()
            ->map(function ($row) {
                $lineCount = (int) $row->line_count;
                $completedLines = (int) $row->completed_lines;
                $status = 'Open';

                if ($lineCount > 0 && $completedLines >= $lineCount) {
                    $status = 'Completed';
                } elseif ($completedLines > 0) {
                    $status = 'Partially complete';
                }

                return [
                    'orderNo' => (string) $row->orderno,
                    'debtorNo' => (string) $row->debtorno,
                    'customerName' => (string) $row->customer_name,
                    'branchCode' => (string) ($row->branchcode ?? ''),
                    'branchName' => (string) $row->branch_name,
                    'customerRef' => (string) ($row->customerref ?? ''),
                    'orderDate' => (string) $row->orddate,
                    'deliveryDate' => (string) $row->deliverydate,
                    'deliveryTo' => (string) $row->delivery_to,
                    'lineCount' => $lineCount,
                    'completedLines' => $completedLines,
                    'progressPercent' => $lineCount > 0 ? round(($completedLines / $lineCount) * 100, 1) : 0,
                    'grossTotal' => round((float) $row->gross_total, 2),
                    'status' => $status,
                ];
            })
            ->values()
            ->all();
    }

    private function salesOrderDetailLines(int $orderNumber)
    {
        if (!Schema::hasTable('salesorderdetails')) {
            return collect();
        }

        $discountFraction = $this->salesOrderDiscountFractionExpression('sod');
        $lineTotalExpression = $this->salesOrderLineValueExpression('sod');
        $hasStockMaster = Schema::hasTable('stockmaster');

        $query = DB::table('salesorderdetails as sod')
            ->where('sod.orderno', $orderNumber)
            ->select(
                'sod.orderlineno',
                'sod.stkcode',
                'sod.qtyinvoiced',
                'sod.unitprice',
                'sod.quantity',
                'sod.discountpercent',
                'sod.actualdispatchdate',
                'sod.completed',
                'sod.narrative',
                'sod.itemdue',
                'sod.poline',
                DB::raw($lineTotalExpression . ' as line_total'),
                DB::raw('(' . $discountFraction . ' * 100) as discount_percent')
            );

        if ($hasStockMaster) {
            $query
                ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'sod.stkcode')
                ->addSelect(
                    DB::raw('COALESCE(NULLIF(sm.description, ""), sod.stkcode) as item_description'),
                    DB::raw("COALESCE(NULLIF(sod.units, ''), NULLIF(sm.units, ''), 'each') as line_units"),
                    DB::raw('COALESCE(sod.decimalplaces, sm.decimalplaces, 0) as line_decimal_places'),
                    DB::raw('COALESCE(sm.volume, 0) as item_volume'),
                    DB::raw('COALESCE(sm.grossweight, 0) as item_weight')
                );
        } else {
            $query->addSelect(
                DB::raw('sod.stkcode as item_description'),
                DB::raw("COALESCE(NULLIF(sod.units, ''), 'each') as line_units"),
                DB::raw('COALESCE(sod.decimalplaces, 0) as line_decimal_places'),
                DB::raw('0 as item_volume'),
                DB::raw('0 as item_weight')
            );
        }

        return $query
            ->orderBy('sod.orderlineno')
            ->get()
            ->map(function ($line) {
                $quantity = (float) ($line->quantity ?? 0);
                $qtyInvoiced = (float) ($line->qtyinvoiced ?? 0);
                $completed = (int) ($line->completed ?? 0) === 1 || $qtyInvoiced >= $quantity;
                $status = $completed ? 'Completed' : ($qtyInvoiced > 0 ? 'Partially invoiced' : 'Open');

                return [
                    'lineNo' => (int) ($line->orderlineno ?? 0),
                    'stockId' => (string) ($line->stkcode ?? ''),
                    'description' => (string) ($line->item_description ?? $line->stkcode ?? ''),
                    'quantity' => $quantity,
                    'qtyInvoiced' => $qtyInvoiced,
                    'outstandingQty' => max(round($quantity - $qtyInvoiced, 4), 0),
                    'unitPrice' => round((float) ($line->unitprice ?? 0), 4),
                    'discountPercent' => round((float) ($line->discount_percent ?? 0), 2),
                    'lineTotal' => round((float) ($line->line_total ?? 0), 2),
                    'units' => (string) ($line->line_units ?? 'each'),
                    'decimalPlaces' => (int) ($line->line_decimal_places ?? 0),
                    'poLine' => (string) ($line->poline ?? ''),
                    'narrative' => (string) ($line->narrative ?? ''),
                    'actualDispatchDate' => $this->cleanDateValue($line->actualdispatchdate ?? ''),
                    'dueDate' => $this->cleanDateValue($line->itemdue ?? ''),
                    'completed' => $completed,
                    'status' => $status,
                    'lineWeight' => round($quantity * (float) ($line->item_weight ?? 0), 4),
                    'lineVolume' => round($quantity * (float) ($line->item_volume ?? 0), 4),
                ];
            });
    }

    private function salesOrderDiscountFractionExpression(string $alias): string
    {
        $raw = 'COALESCE(' . $alias . '.discountpercent, 0)';

        return '(CASE WHEN ' . $raw . ' > 1 THEN LEAST(' . $raw . ' / 100, 1) ELSE GREATEST(' . $raw . ', 0) END)';
    }

    private function salesOrderLineValueExpression(string $alias): string
    {
        return '(COALESCE(' . $alias . '.quantity, 0) * COALESCE(' . $alias . '.unitprice, 0) * (1 - ' . $this->salesOrderDiscountFractionExpression($alias) . '))';
    }

    private function salesOrderStatusLabel(int $lineCount, int $completedLines): string
    {
        if ($lineCount > 0 && $completedLines >= $lineCount) {
            return 'Completed';
        }

        if ($completedLines > 0) {
            return 'Partially complete';
        }

        return 'Open';
    }

    private function emptyCustomerSalesHistoryPayload(string $debtorNo, string $fromDate, string $toDate, string $type, string $searchTerm): array
    {
        return [
            'currency' => $this->companyCurrency(),
            'filters' => [
                'debtorNo' => $debtorNo,
                'fromDate' => $fromDate,
                'toDate' => $toDate,
                'type' => $type,
                'searchTerm' => $searchTerm,
            ],
            'rows' => [],
            'summary' => [
                'lineCount' => 0,
                'invoiceCount' => 0,
                'creditCount' => 0,
                'uniqueItems' => 0,
                'quantity' => 0,
                'invoiceValue' => 0,
                'creditValue' => 0,
                'netSales' => 0,
                'averageLineValue' => 0,
                'topItems' => [],
            ],
        ];
    }

    private function customerSalesHistorySummary($rows): array
    {
        $rowCollection = collect($rows);
        $invoiceValue = round((float) $rowCollection->where('typeId', 10)->sum('lineTotal'), 2);
        $creditValue = round(abs((float) $rowCollection->where('typeId', 11)->sum('lineTotal')), 2);
        $netSales = round((float) $rowCollection->sum('lineTotal'), 2);
        $lineCount = $rowCollection->count();

        $topItems = $rowCollection
            ->groupBy('stockId')
            ->map(function ($itemRows, $stockId) {
                $first = $itemRows->first();
                return [
                    'stockId' => (string) $stockId,
                    'description' => (string) ($first['description'] ?? $stockId),
                    'quantity' => round((float) $itemRows->sum('quantity'), 4),
                    'value' => round((float) $itemRows->sum('lineTotal'), 2),
                    'lineCount' => $itemRows->count(),
                ];
            })
            ->sortByDesc('value')
            ->values()
            ->take(5)
            ->all();

        return [
            'lineCount' => $lineCount,
            'invoiceCount' => $rowCollection
                ->where('typeId', 10)
                ->map(fn ($row) => (string) ($row['transactionNo'] ?? ''))
                ->filter()
                ->unique()
                ->count(),
            'creditCount' => $rowCollection
                ->where('typeId', 11)
                ->map(fn ($row) => (string) ($row['transactionNo'] ?? ''))
                ->filter()
                ->unique()
                ->count(),
            'uniqueItems' => $rowCollection->pluck('stockId')->filter()->unique()->count(),
            'quantity' => round((float) $rowCollection->sum('quantity'), 4),
            'invoiceValue' => $invoiceValue,
            'creditValue' => $creditValue,
            'netSales' => $netSales,
            'averageLineValue' => $lineCount > 0 ? round($netSales / $lineCount, 2) : 0,
            'topItems' => $topItems,
        ];
    }

    private function salesTransactionTypeName(int $type): string
    {
        if ($type === 10) {
            return 'Sales Invoice';
        }

        if ($type === 11) {
            return 'Credit Note';
        }

        if ($type === 12) {
            return 'Receipt';
        }

        return 'Type ' . $type;
    }

    private function customerOrderSearchSummary(array $orders, array $parts, string $selectedStockId): array
    {
        $orderRows = collect($orders);
        $selectedPart = $selectedStockId !== ''
            ? collect($parts)->firstWhere('stockId', $selectedStockId)
            : null;

        return [
            'orders' => $orderRows->count(),
            'openOrders' => $orderRows->where('status', '!=', 'Completed')->count(),
            'completedOrders' => $orderRows->where('status', 'Completed')->count(),
            'totalValue' => round((float) $orderRows->sum('grossTotal'), 2),
            'selectedStockId' => $selectedStockId,
            'selectedStockDescription' => is_array($selectedPart) ? (string) ($selectedPart['description'] ?? '') : '',
        ];
    }

    private function requestDateOrDefault($value, string $default): string
    {
        $raw = trim((string) $value);
        if ($raw === '') {
            return $default;
        }

        try {
            return Carbon::parse($raw)->toDateString();
        } catch (\Throwable) {
            return $default;
        }
    }

    private function requestBoolean($value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false;
    }

    private function cleanDateValue($value): string
    {
        $raw = trim((string) $value);
        if ($raw === '' || str_starts_with($raw, '0000-00-00')) {
            return '';
        }

        try {
            return Carbon::parse($raw)->toDateString();
        } catch (\Throwable) {
            return $raw;
        }
    }

    private function salesCompanyProfile(): array
    {
        $company = Schema::hasTable('companies')
            ? DB::table('companies')->where('coycode', 1)->first()
            : null;

        return [
            'name' => html_entity_decode((string) ($company->coyname ?? 'Akiva')),
            'address' => collect([
                $company->regoffice1 ?? '',
                $company->regoffice2 ?? '',
                $company->regoffice3 ?? '',
                $company->regoffice4 ?? '',
                $company->regoffice5 ?? '',
                $company->regoffice6 ?? '',
            ])->map(fn ($part) => trim((string) $part))->filter()->values(),
            'phone' => (string) ($company->telephone ?? ''),
            'fax' => (string) ($company->fax ?? ''),
            'email' => (string) ($company->email ?? ''),
            'taxReference' => (string) ($company->gstno ?? ''),
        ];
    }

    private function safeLimit($value, int $min, int $max): int
    {
        return max($min, min((int) $value, $max));
    }
}
