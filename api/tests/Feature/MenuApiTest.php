<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

afterEach(function () {
    Schema::dropIfExists('usermenurights');
    Schema::dropIfExists('menu');
});

it('returns only the menu branches assigned to the signed in user', function () {
    Schema::create('menu', function (Blueprint $table) {
        $table->integer('id')->primary();
        $table->string('caption');
        $table->integer('parent');
        $table->string('href')->default('#');
    });

    Schema::create('usermenurights', function (Blueprint $table) {
        $table->string('userid', 20);
        $table->integer('menuid');
        $table->tinyInteger('access')->default(1);
        $table->primary(['userid', 'menuid']);
    });

    DB::table('menu')->insert([
        ['id' => 1, 'caption' => 'Sales', 'parent' => -1, 'href' => '#'],
        ['id' => 2, 'caption' => 'Transactions', 'parent' => 1, 'href' => '#'],
        ['id' => 3, 'caption' => 'Enter Order', 'parent' => 2, 'href' => 'SelectOrderItems.php?'],
        ['id' => 4, 'caption' => 'Counter Sales', 'parent' => 2, 'href' => 'CounterSales.php?'],
        ['id' => 5, 'caption' => 'Configuration', 'parent' => -1, 'href' => '#'],
        ['id' => 6, 'caption' => 'System Parameters', 'parent' => 5, 'href' => 'SystemParameters.php?'],
    ]);

    DB::table('usermenurights')->insert([
        ['userid' => 'demo', 'menuid' => 3, 'access' => 1],
        ['userid' => 'demo', 'menuid' => 6, 'access' => 0],
        ['userid' => 'other', 'menuid' => 4, 'access' => 1],
    ]);

    $response = $this->withHeader('X-User-Id', 'demo')
        ->getJson('/api/menu')
        ->assertOk()
        ->assertJsonPath('success', true)
        ->json();

    expect(collect($response['flat'])->pluck('id')->all())->toBe([1, 2, 3])
        ->and($response['data'])->toHaveCount(1)
        ->and($response['data'][0]['caption'])->toBe('Sales')
        ->and($response['data'][0]['children'][0]['caption'])->toBe('Transactions')
        ->and($response['data'][0]['children'][0]['children'])->toHaveCount(1)
        ->and($response['data'][0]['children'][0]['children'][0]['caption'])->toBe('Enter Order');

    $this->withHeader('X-User-Id', 'demo')
        ->getJson('/api/menu/categories')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.caption', 'Sales');

    $this->withHeader('X-User-Id', 'demo')
        ->getJson('/api/menu/parent/2')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.caption', 'Enter Order');
});

it('returns no menu modules when the signed in user has no menu assignments', function () {
    Schema::create('menu', function (Blueprint $table) {
        $table->integer('id')->primary();
        $table->string('caption');
        $table->integer('parent');
        $table->string('href')->default('#');
    });

    Schema::create('usermenurights', function (Blueprint $table) {
        $table->string('userid', 20);
        $table->integer('menuid');
        $table->tinyInteger('access')->default(1);
        $table->primary(['userid', 'menuid']);
    });

    DB::table('menu')->insert([
        ['id' => 1, 'caption' => 'Sales', 'parent' => -1, 'href' => '#'],
        ['id' => 2, 'caption' => 'Transactions', 'parent' => 1, 'href' => '#'],
    ]);

    $this->withHeader('X-User-Id', 'demo')
        ->getJson('/api/menu')
        ->assertOk()
        ->assertJsonPath('success', true)
        ->assertJsonCount(0, 'data')
        ->assertJsonCount(0, 'flat');
});
