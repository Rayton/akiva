<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

afterEach(function () {
    Carbon::setTestNow();

    Schema::dropIfExists('salesorderdetails');
    Schema::dropIfExists('salesorders');
    Schema::dropIfExists('stockmaster');
    Schema::dropIfExists('debtortrans');
    Schema::dropIfExists('debtorsmaster');
    Schema::dropIfExists('companies');
});

it('builds a live sales dashboard from ERP sales tables', function () {
    Carbon::setTestNow(Carbon::parse('2026-05-28 10:30:00'));

    Schema::dropIfExists('salesorderdetails');
    Schema::dropIfExists('salesorders');
    Schema::dropIfExists('stockmaster');
    Schema::dropIfExists('debtortrans');
    Schema::dropIfExists('debtorsmaster');
    Schema::dropIfExists('companies');

    Schema::create('companies', function (Blueprint $table) {
        $table->integer('coycode')->primary();
        $table->string('currencydefault', 3)->default('TZS');
    });

    Schema::create('debtorsmaster', function (Blueprint $table) {
        $table->string('debtorno', 30)->primary();
        $table->string('name');
    });

    Schema::create('debtortrans', function (Blueprint $table) {
        $table->id();
        $table->integer('type')->default(10);
        $table->string('debtorno', 30);
        $table->date('trandate');
        $table->tinyInteger('settled')->default(0);
        $table->decimal('ovamount', 18, 2)->default(0);
        $table->decimal('ovgst', 18, 2)->default(0);
        $table->decimal('ovfreight', 18, 2)->default(0);
        $table->decimal('ovdiscount', 18, 2)->default(0);
        $table->decimal('alloc', 18, 2)->default(0);
    });

    Schema::create('salesorders', function (Blueprint $table) {
        $table->integer('orderno')->primary();
        $table->string('debtorno', 30);
        $table->date('orddate');
        $table->date('deliverydate')->nullable();
        $table->tinyInteger('quotation')->default(0);
    });

    Schema::create('salesorderdetails', function (Blueprint $table) {
        $table->id('orderlineno');
        $table->integer('orderno');
        $table->string('stkcode', 30);
        $table->decimal('quantity', 18, 4)->default(0);
        $table->decimal('qtyinvoiced', 18, 4)->default(0);
        $table->decimal('unitprice', 18, 2)->default(0);
        $table->decimal('discountpercent', 8, 4)->default(0);
        $table->tinyInteger('completed')->default(0);
        $table->date('itemdue')->nullable();
    });

    Schema::create('stockmaster', function (Blueprint $table) {
        $table->string('stockid', 30)->primary();
        $table->string('description');
        $table->decimal('materialcost', 18, 2)->default(0);
        $table->decimal('labourcost', 18, 2)->default(0);
        $table->decimal('overheadcost', 18, 2)->default(0);
    });

    DB::table('companies')->insert([
        'coycode' => 1,
        'currencydefault' => 'TZS',
    ]);

    DB::table('debtorsmaster')->insert([
        ['debtorno' => 'CUST1', 'name' => 'Alpha Medical'],
        ['debtorno' => 'CUST2', 'name' => 'Beta Clinic'],
    ]);

    DB::table('debtortrans')->insert([
        [
            'type' => 10,
            'debtorno' => 'CUST1',
            'trandate' => '2026-05-28',
            'settled' => 0,
            'ovamount' => 1000,
            'alloc' => 200,
        ],
        [
            'type' => 10,
            'debtorno' => 'CUST2',
            'trandate' => '2026-05-20',
            'settled' => 1,
            'ovamount' => 500,
            'alloc' => 500,
        ],
        [
            'type' => 10,
            'debtorno' => 'CUST1',
            'trandate' => '2026-04-20',
            'settled' => 1,
            'ovamount' => 800,
            'alloc' => 800,
        ],
        [
            'type' => 10,
            'debtorno' => 'CUST2',
            'trandate' => '2021-11-15',
            'settled' => 1,
            'ovamount' => 300,
            'alloc' => 300,
        ],
    ]);

    DB::table('salesorders')->insert([
        ['orderno' => 100, 'debtorno' => 'CUST1', 'orddate' => '2026-05-01', 'deliverydate' => '2026-05-20', 'quotation' => 0],
        ['orderno' => 101, 'debtorno' => 'CUST2', 'orddate' => '2026-05-25', 'deliverydate' => '2026-05-28', 'quotation' => 0],
    ]);

    DB::table('salesorderdetails')->insert([
        [
            'orderno' => 100,
            'stkcode' => 'KIT-A',
            'quantity' => 10,
            'qtyinvoiced' => 4,
            'unitprice' => 100,
            'discountpercent' => 0,
            'completed' => 0,
            'itemdue' => '2026-05-20',
        ],
        [
            'orderno' => 101,
            'stkcode' => 'KIT-B',
            'quantity' => 5,
            'qtyinvoiced' => 0,
            'unitprice' => 80,
            'discountpercent' => 0,
            'completed' => 0,
            'itemdue' => '2026-05-28',
        ],
    ]);

    DB::table('stockmaster')->insert([
        ['stockid' => 'KIT-A', 'description' => 'Emergency Kit A', 'materialcost' => 95, 'labourcost' => 0, 'overheadcost' => 0],
        ['stockid' => 'KIT-B', 'description' => 'Emergency Kit B', 'materialcost' => 20, 'labourcost' => 0, 'overheadcost' => 0],
    ]);

    $data = $this->getJson('/api/sales/dashboard?days=7')
        ->assertOk()
        ->assertJsonPath('success', true)
        ->assertJsonPath('data.currency', 'TZS')
        ->assertJsonPath('data.summary.todaySales', 1000)
        ->assertJsonPath('data.summary.todayInvoices', 1)
        ->assertJsonPath('data.summary.monthSales', 1500)
        ->assertJsonPath('data.summary.previousMonthSales', 800)
        ->assertJsonPath('data.summary.monthGrowthPct', 87.5)
        ->assertJsonPath('data.summary.openOrders', 2)
        ->assertJsonPath('data.summary.openOrderLines', 2)
        ->assertJsonPath('data.summary.openOrderValue', 1000)
        ->assertJsonPath('data.summary.lateOrders', 1)
        ->assertJsonPath('data.summary.readyToPickOrders', 2)
        ->assertJsonPath('data.summary.readyToPickQuantity', 11)
        ->assertJsonPath('data.summary.openReceivableValue', 800)
        ->assertJsonPath('data.summary.openReceivableInvoices', 1)
        ->assertJsonPath('data.summary.lowMarginLines', 1)
        ->assertJsonPath('data.summary.lowMarginValue', 1000)
        ->assertJsonCount(7, 'data.dailyTrend')
        ->assertJsonCount(2, 'data.topCustomers')
        ->assertJsonCount(2, 'data.topItems')
        ->json('data');

    $trendByDay = collect($data['dailyTrend'])->keyBy('day');
    $topCustomers = collect($data['topCustomers'])->keyBy('debtorNo');
    $topItems = collect($data['topItems'])->keyBy('stockId');
    $actions = collect($data['actionQueue'])->keyBy('id');

    expect($trendByDay['2026-05-28']['grossTotal'])->toEqual(1000.0)
        ->and($topCustomers['CUST1']['customerName'])->toEqual('Alpha Medical')
        ->and($topCustomers['CUST1']['grossTotal'])->toEqual(1000.0)
        ->and($topItems['KIT-A']['grossTotal'])->toEqual(1000.0)
        ->and($actions->keys()->all())->toContain('late-orders', 'ready-to-pick', 'receivables-follow-up', 'low-margin-review')
        ->and($actions['late-orders']['drawerKey'])->toEqual('order-delivery-differences-report')
        ->and($actions['ready-to-pick']['drawerKey'])->toEqual('print-picking-lists');

    $customerTrend = $this->getJson('/api/sales/reports/customer-trend?from=2026-04-01&to=2026-05-28&limit=5')
        ->assertOk()
        ->assertJsonPath('success', true)
        ->assertJsonCount(2, 'data.months')
        ->assertJsonCount(2, 'data.customers')
        ->json('data');

    $trendCustomers = collect($customerTrend['customers'])->keyBy('debtorNo');
    $alphaPoints = collect($trendCustomers['CUST1']['points'])->keyBy('month');

    expect($customerTrend['months'][0]['month'])->toEqual('2026-04')
        ->and($customerTrend['months'][1]['month'])->toEqual('2026-05')
        ->and($trendCustomers['CUST1']['grossTotal'])->toEqual(1800.0)
        ->and($alphaPoints['2026-04']['grossTotal'])->toEqual(800.0)
        ->and($alphaPoints['2026-05']['grossTotal'])->toEqual(1000.0);

    $longRangeTrend = $this->getJson('/api/sales/reports/customer-trend?from=2020-11-01&to=2025-12-31&limit=5')
        ->assertOk()
        ->assertJsonPath('success', true)
        ->assertJsonCount(62, 'data.months')
        ->assertJsonCount(1, 'data.customers')
        ->json('data');

    $betaPoints = collect($longRangeTrend['customers'][0]['points'])->keyBy('month');

    expect($longRangeTrend['from'])->toEqual('2020-11-01')
        ->and($longRangeTrend['to'])->toEqual('2025-12-31')
        ->and($longRangeTrend['months'][0]['month'])->toEqual('2020-11')
        ->and($longRangeTrend['months'][61]['month'])->toEqual('2025-12')
        ->and($longRangeTrend['customers'][0]['debtorNo'])->toEqual('CUST2')
        ->and($longRangeTrend['customers'][0]['grossTotal'])->toEqual(300.0)
        ->and($betaPoints['2021-11']['grossTotal'])->toEqual(300.0);
});
