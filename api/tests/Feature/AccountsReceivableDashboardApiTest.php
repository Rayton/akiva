<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

afterEach(function () {
    Carbon::setTestNow();

    Schema::dropIfExists('custbranch');
    Schema::dropIfExists('paymentterms');
    Schema::dropIfExists('debtortrans');
    Schema::dropIfExists('debtorsmaster');
    Schema::dropIfExists('companies');
});

it('builds a live receivables dashboard from customer ledger rows', function () {
    Carbon::setTestNow(Carbon::parse('2026-05-28 09:15:00'));

    Schema::create('companies', function (Blueprint $table) {
        $table->integer('coycode')->primary();
        $table->string('currencydefault', 3)->default('TZS');
    });

    Schema::create('paymentterms', function (Blueprint $table) {
        $table->string('termsindicator', 10)->primary();
        $table->integer('daysbeforedue')->default(0);
        $table->integer('dayinfollowingmonth')->default(0);
    });

    Schema::create('debtorsmaster', function (Blueprint $table) {
        $table->string('debtorno', 30)->primary();
        $table->string('name');
        $table->string('paymentterms', 10)->nullable();
        $table->decimal('creditlimit', 18, 2)->default(0);
    });

    Schema::create('custbranch', function (Blueprint $table) {
        $table->id();
        $table->string('debtorno', 30);
        $table->string('email')->nullable();
        $table->string('phoneno')->nullable();
    });

    Schema::create('debtortrans', function (Blueprint $table) {
        $table->id();
        $table->integer('type')->default(10);
        $table->integer('transno')->nullable();
        $table->string('reference')->nullable();
        $table->string('debtorno', 30);
        $table->date('trandate');
        $table->decimal('ovamount', 18, 2)->default(0);
        $table->decimal('ovgst', 18, 2)->default(0);
        $table->decimal('ovfreight', 18, 2)->default(0);
        $table->decimal('ovdiscount', 18, 2)->default(0);
        $table->decimal('alloc', 18, 2)->default(0);
    });

    DB::table('companies')->insert(['coycode' => 1, 'currencydefault' => 'TZS']);
    DB::table('paymentterms')->insert(['termsindicator' => '30', 'daysbeforedue' => 30, 'dayinfollowingmonth' => 0]);
    DB::table('debtorsmaster')->insert([
        ['debtorno' => 'CUST1', 'name' => 'Alpha Medical', 'paymentterms' => '30', 'creditlimit' => 1000],
        ['debtorno' => 'CUST2', 'name' => 'Beta Clinic', 'paymentterms' => '30', 'creditlimit' => 1200],
    ]);
    DB::table('custbranch')->insert([
        ['debtorno' => 'CUST1', 'email' => 'alpha@example.test', 'phoneno' => '555-0101'],
        ['debtorno' => 'CUST2', 'email' => null, 'phoneno' => null],
    ]);
    DB::table('debtortrans')->insert([
        [
            'type' => 10,
            'transno' => 1001,
            'reference' => 'INV-1001',
            'debtorno' => 'CUST1',
            'trandate' => '2026-04-01',
            'ovamount' => 700,
            'alloc' => 100,
        ],
        [
            'type' => 10,
            'transno' => 1002,
            'reference' => 'INV-1002',
            'debtorno' => 'CUST1',
            'trandate' => '2026-05-20',
            'ovamount' => 300,
            'alloc' => 0,
        ],
        [
            'type' => 10,
            'transno' => 2001,
            'reference' => 'INV-2001',
            'debtorno' => 'CUST2',
            'trandate' => '2026-01-01',
            'ovamount' => 1000,
            'alloc' => 0,
        ],
        [
            'type' => 10,
            'transno' => 2002,
            'reference' => 'INV-PAID',
            'debtorno' => 'CUST2',
            'trandate' => '2026-05-01',
            'ovamount' => 500,
            'alloc' => 500,
        ],
    ]);

    $dashboard = $this->getJson('/api/receivables/dashboard?limit=5')
        ->assertOk()
        ->assertJsonPath('success', true)
        ->assertJsonPath('data.currency', 'TZS')
        ->assertJsonPath('data.summary.totalReceivables', 1900)
        ->assertJsonPath('data.summary.openInvoices', 3)
        ->assertJsonPath('data.summary.customersWithBalance', 2)
        ->assertJsonPath('data.summary.overdueReceivables', 1600)
        ->assertJsonPath('data.summary.overdueInvoices', 2)
        ->assertJsonPath('data.summary.dueSoonReceivables', 0)
        ->assertJsonCount(5, 'data.aging')
        ->assertJsonCount(2, 'data.topCustomers')
        ->assertJsonCount(3, 'data.priorityInvoices')
        ->json('data');

    $aging = collect($dashboard['aging'])->keyBy('key');
    $customers = collect($dashboard['topCustomers'])->keyBy('debtorNo');
    $invoices = collect($dashboard['priorityInvoices'])->keyBy('reference');
    $actions = collect($dashboard['actionQueue'])->keyBy('id');

    expect($aging['current']['amount'])->toEqual(300.0)
        ->and($aging['days_1_30']['amount'])->toEqual(600.0)
        ->and($aging['days_91_plus']['amount'])->toEqual(1000.0)
        ->and($customers['CUST2']['customerName'])->toEqual('Beta Clinic')
        ->and($customers['CUST2']['overdueBalance'])->toEqual(1000.0)
        ->and($customers['CUST1']['email'])->toEqual('alpha@example.test')
        ->and($invoices['INV-2001']['daysOverdue'])->toBeGreaterThan(90)
        ->and($actions->keys()->all())->toContain('overdue-collection', 'credit-watch', 'missing-contact');
});
