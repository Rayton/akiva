<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

afterEach(function () {
    Carbon::setTestNow();

    Schema::dropIfExists('debtortrans');
    Schema::dropIfExists('banktrans');
    Schema::dropIfExists('purchorderdetails');
    Schema::dropIfExists('purchorders');
    Schema::dropIfExists('suppliers');
    Schema::dropIfExists('locstock');
    Schema::dropIfExists('stockmaster');
    Schema::dropIfExists('ap_bills');
    Schema::dropIfExists('ap_suppliers');
});

it('builds dashboard cash flow forecast rows from backend tables', function () {
    Carbon::setTestNow(Carbon::parse('2026-05-27 12:00:00'));

    Schema::dropIfExists('debtortrans');
    Schema::dropIfExists('banktrans');
    Schema::dropIfExists('purchorderdetails');
    Schema::dropIfExists('purchorders');
    Schema::dropIfExists('suppliers');
    Schema::dropIfExists('locstock');
    Schema::dropIfExists('stockmaster');
    Schema::dropIfExists('ap_bills');
    Schema::dropIfExists('ap_suppliers');

    Schema::create('banktrans', function (Blueprint $table) {
        $table->id('banktransid');
        $table->date('transdate');
        $table->decimal('amount', 18, 2);
    });

    Schema::create('ap_suppliers', function (Blueprint $table) {
        $table->id();
        $table->string('supplier_code', 30)->unique();
        $table->string('name');
        $table->timestamps();
        $table->softDeletes();
    });

    Schema::create('ap_bills', function (Blueprint $table) {
        $table->id();
        $table->unsignedBigInteger('supplier_id');
        $table->string('bill_number', 50);
        $table->date('bill_date');
        $table->date('due_date');
        $table->string('status', 20)->default('draft');
        $table->decimal('subtotal', 18, 2)->default(0);
        $table->decimal('tax_total', 18, 2)->default(0);
        $table->decimal('total', 18, 2)->default(0);
        $table->decimal('amount_paid', 18, 2)->default(0);
        $table->decimal('amount_due', 18, 2)->default(0);
        $table->string('matching_status', 30)->default('pending');
        $table->timestamps();
        $table->softDeletes();
    });

    Schema::create('purchorders', function (Blueprint $table) {
        $table->id('orderno');
        $table->string('supplierno', 30)->nullable();
        $table->string('status', 20);
        $table->dateTime('orddate')->nullable();
    });

    Schema::create('purchorderdetails', function (Blueprint $table) {
        $table->id('podetailitem');
        $table->unsignedBigInteger('orderno');
        $table->decimal('quantityord', 18, 4)->default(0);
        $table->decimal('quantityrecd', 18, 4)->default(0);
        $table->decimal('unitprice', 18, 2)->default(0);
        $table->date('deliverydate')->nullable();
    });

    Schema::create('suppliers', function (Blueprint $table) {
        $table->string('supplierid', 30)->primary();
        $table->string('suppname');
    });

    Schema::create('stockmaster', function (Blueprint $table) {
        $table->string('stockid', 30)->primary();
        $table->string('mbflag', 1)->default('B');
        $table->decimal('materialcost', 18, 2)->default(0);
        $table->decimal('labourcost', 18, 2)->default(0);
        $table->decimal('overheadcost', 18, 2)->default(0);
    });

    Schema::create('locstock', function (Blueprint $table) {
        $table->id();
        $table->string('stockid', 30);
        $table->string('loccode', 10);
        $table->decimal('quantity', 18, 4)->default(0);
        $table->decimal('reorderlevel', 18, 4)->default(0);
    });

    Schema::create('debtortrans', function (Blueprint $table) {
        $table->id();
        $table->integer('type')->default(10);
        $table->date('trandate');
        $table->tinyInteger('settled')->default(0);
        $table->decimal('ovamount', 18, 2)->default(0);
        $table->decimal('ovgst', 18, 2)->default(0);
        $table->decimal('ovfreight', 18, 2)->default(0);
        $table->decimal('ovdiscount', 18, 2)->default(0);
        $table->decimal('alloc', 18, 2)->default(0);
    });

    DB::table('banktrans')->insert([
        ['transdate' => '2026-04-15', 'amount' => 1000],
        ['transdate' => '2026-05-10', 'amount' => 500],
        ['transdate' => '2026-05-20', 'amount' => -200],
    ]);

    $supplierId = DB::table('ap_suppliers')->insertGetId([
        'supplier_code' => 'SUP-DASH',
        'name' => 'Dashboard Supplier',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    DB::table('ap_bills')->insert([
        [
            'supplier_id' => $supplierId,
            'bill_number' => 'MAY-DUE',
            'bill_date' => '2026-05-01',
            'due_date' => '2026-05-30',
            'status' => 'approved',
            'subtotal' => 100,
            'total' => 100,
            'amount_due' => 100,
            'matching_status' => 'matched',
            'created_at' => now(),
            'updated_at' => now(),
        ],
        [
            'supplier_id' => $supplierId,
            'bill_number' => 'JUN-DUE',
            'bill_date' => '2026-05-15',
            'due_date' => '2026-06-10',
            'status' => 'approved',
            'subtotal' => 300,
            'total' => 300,
            'amount_due' => 300,
            'matching_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ],
    ]);

    DB::table('suppliers')->insert([
        'supplierid' => 'SUP-LEG',
        'suppname' => 'Legacy Medical',
    ]);

    DB::table('purchorders')->insert([
        ['orderno' => 101, 'supplierno' => 'SUP-LEG', 'status' => 'Pending', 'orddate' => '2026-05-20 00:00:00'],
        ['orderno' => 102, 'supplierno' => 'SUP-LEG', 'status' => 'Printed', 'orddate' => '2026-05-10 00:00:00'],
        ['orderno' => 103, 'supplierno' => 'SUP-LEG', 'status' => 'Completed', 'orddate' => '2026-05-01 00:00:00'],
    ]);

    DB::table('purchorderdetails')->insert([
        ['orderno' => 101, 'quantityord' => 2, 'quantityrecd' => 0, 'unitprice' => 125, 'deliverydate' => '2026-06-15'],
        ['orderno' => 102, 'quantityord' => 10, 'quantityrecd' => 4, 'unitprice' => 20, 'deliverydate' => '2026-05-20'],
        ['orderno' => 103, 'quantityord' => 8, 'quantityrecd' => 2, 'unitprice' => 50, 'deliverydate' => '2026-05-20'],
    ]);

    DB::table('stockmaster')->insert([
        ['stockid' => 'MED-001', 'mbflag' => 'B', 'materialcost' => 10, 'labourcost' => 2, 'overheadcost' => 3],
        ['stockid' => 'MED-002', 'mbflag' => 'B', 'materialcost' => 5, 'labourcost' => 0, 'overheadcost' => 0],
        ['stockid' => 'MED-003', 'mbflag' => 'B', 'materialcost' => 7, 'labourcost' => 0, 'overheadcost' => 0],
    ]);

    DB::table('locstock')->insert([
        ['stockid' => 'MED-001', 'loccode' => 'MAIN', 'quantity' => 2, 'reorderlevel' => 3],
        ['stockid' => 'MED-002', 'loccode' => 'MAIN', 'quantity' => 0, 'reorderlevel' => 5],
        ['stockid' => 'MED-003', 'loccode' => 'MAIN', 'quantity' => 10, 'reorderlevel' => 0],
    ]);

    DB::table('debtortrans')->insert([
        [
            'type' => 10,
            'trandate' => '2026-05-12',
            'settled' => 1,
            'ovamount' => 500,
            'alloc' => 500,
        ],
        [
            'type' => 10,
            'trandate' => '2026-06-05',
            'settled' => 0,
            'ovamount' => 800,
            'alloc' => 100,
        ],
    ]);

    $data = $this->getJson('/api/dashboard')
        ->assertOk()
        ->assertJsonPath('data.cashFlowForecast.forecastStartMonth', '2026-05')
        ->assertJsonCount(11, 'data.cashFlowForecast.rows')
        ->assertJsonCount(4, 'data.workflowBottlenecks')
        ->assertJsonCount(1, 'data.supplierExposure.rows')
        ->assertJsonCount(4, 'data.modulePulse')
        ->assertJsonCount(4, 'data.aiInsights')
        ->json('data');

    $forecast = $data['cashFlowForecast'];
    $rowsByMonth = collect($forecast['rows'])->keyBy('month');
    $workflowRows = collect($data['workflowBottlenecks'])->keyBy('id');
    $supplierRows = collect($data['supplierExposure']['rows'])->keyBy('supplier');
    $moduleRows = collect($data['modulePulse'])->keyBy('id');
    $aiInsights = collect($data['aiInsights'])->keyBy('id');

    expect($rowsByMonth['2026-04']['cash'])->toEqual(1000.0)
        ->and($rowsByMonth['2026-05']['cash'])->toEqual(1300.0)
        ->and($rowsByMonth['2026-05']['forecastCash'])->toEqual(1300.0)
        ->and($rowsByMonth['2026-05']['payables'])->toEqual(100.0)
        ->and($rowsByMonth['2026-06']['receivables'])->toEqual(700.0)
        ->and($rowsByMonth['2026-06']['payables'])->toEqual(300.0)
        ->and($rowsByMonth['2026-06']['forecastCash'])->toEqual(1600.0)
        ->and($forecast['minimumReserve'])->toEqual(400.0)
        ->and($forecast['summary']['projectedReceivables'])->toEqual(700.0)
        ->and($forecast['summary']['projectedPayables'])->toEqual(400.0)
        ->and($workflowRows['poApproval']['count'])->toEqual(1)
        ->and($workflowRows['poApproval']['value'])->toEqual(250.0)
        ->and($workflowRows['grnPosting']['count'])->toEqual(1)
        ->and($workflowRows['grnPosting']['value'])->toEqual(120.0)
        ->and($workflowRows['invoiceMatch']['count'])->toEqual(1)
        ->and($workflowRows['invoiceMatch']['value'])->toEqual(300.0)
        ->and($workflowRows['paymentRun']['count'])->toEqual(2)
        ->and($workflowRows['paymentRun']['value'])->toEqual(400.0)
        ->and($data['supplierExposure']['totalExposure'])->toEqual(370.0)
        ->and($data['supplierExposure']['exposureLimit'])->toEqual(92.5)
        ->and($supplierRows['Legacy Medical']['value'])->toEqual(370.0)
        ->and($supplierRows['Legacy Medical']['orders'])->toEqual(2)
        ->and($supplierRows['Legacy Medical']['overdueOrders'])->toEqual(1)
        ->and($supplierRows['Legacy Medical']['approvalAging'])->toEqual(1)
        ->and($supplierRows['Legacy Medical']['shareLabel'])->toEqual('100%')
        ->and($moduleRows['sales']['postedValue'])->toEqual(500.0)
        ->and($moduleRows['sales']['open'])->toEqual(1)
        ->and($moduleRows['sales']['risk'])->toEqual(0)
        ->and($moduleRows['inventory']['postedValue'])->toEqual(100.0)
        ->and($moduleRows['inventory']['open'])->toEqual(2)
        ->and($moduleRows['inventory']['risk'])->toEqual(2)
        ->and($moduleRows['payables']['postedValue'])->toEqual(400.0)
        ->and($moduleRows['payables']['open'])->toEqual(2)
        ->and($moduleRows['payables']['risk'])->toEqual(2)
        ->and($moduleRows['glClose']['postedType'])->toEqual('percent')
        ->and($moduleRows['glClose']['postedValue'])->toEqual(100.0)
        ->and($aiInsights->has('cash-sequencing'))->toBeTrue()
        ->and($aiInsights->has('approval-expedite'))->toBeTrue()
        ->and($aiInsights->has('supplier-concentration'))->toBeTrue()
        ->and($aiInsights->has('stock-rebalance'))->toBeTrue()
        ->and($aiInsights['cash-sequencing']['financialImpact'])->toEqual(400.0)
        ->and($aiInsights['approval-expedite']['affectedRecords'])->toEqual('1 approval item')
        ->and($aiInsights['supplier-concentration']['affectedRecords'])->toEqual('Legacy Medical');
});
