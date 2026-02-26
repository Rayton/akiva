<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\MenuController;
use App\Http\Controllers\Api\SalesController;

Route::get('/menu', [MenuController::class, 'index']);
Route::get('/menu/categories', [MenuController::class, 'categories']);
Route::get('/menu/parent/{parentId}', [MenuController::class, 'byParent']);

Route::prefix('sales')->group(function () {
    Route::get('/orders', [SalesController::class, 'orders']);
    Route::post('/orders', [SalesController::class, 'storeOrder']);
    Route::get('/customers', [SalesController::class, 'customers']);
    Route::get('/items', [SalesController::class, 'items']);
    Route::get('/transactions', [SalesController::class, 'transactions']);
    Route::get('/outstanding-orders', [SalesController::class, 'outstandingOrders']);
    Route::get('/picking-lists', [SalesController::class, 'pickingLists']);
    Route::get('/contracts/lookups', [SalesController::class, 'contractLookups']);
    Route::get('/contracts', [SalesController::class, 'contracts']);
    Route::get('/contracts/{contractRef}', [SalesController::class, 'contractDetail']);
    Route::post('/contracts', [SalesController::class, 'createContract']);
    Route::put('/contracts/{contractRef}', [SalesController::class, 'updateContract']);
    Route::post('/contracts/{contractRef}/quote', [SalesController::class, 'createContractQuotation']);
    Route::delete('/contracts/{contractRef}', [SalesController::class, 'cancelContract']);
    Route::get('/recurring/templates', [SalesController::class, 'recurringTemplates']);
    Route::post('/recurring/process', [SalesController::class, 'processRecurring']);
    Route::get('/reports/summary', [SalesController::class, 'reportSummary']);
    Route::get('/reports/price-list', [SalesController::class, 'reportPriceList']);
    Route::get('/reports/order-status', [SalesController::class, 'reportOrderStatus']);
    Route::get('/reports/daily-inquiry', [SalesController::class, 'reportDailyInquiry']);
    Route::get('/reports/top-items', [SalesController::class, 'reportTopItems']);
    Route::get('/reports/low-gross', [SalesController::class, 'reportLowGross']);
    Route::get('/settings', [SalesController::class, 'settings']);
});
