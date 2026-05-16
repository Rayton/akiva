<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\MenuController;
use App\Http\Controllers\Api\SalesController;
use App\Http\Controllers\Api\GeneralLedgerController;
use App\Http\Controllers\Api\CompanyPreferencesController;
use App\Http\Controllers\Api\SystemParametersController;
use App\Http\Controllers\Api\AuditTrailController;
use App\Http\Controllers\Api\SystemCheckController;
use App\Http\Controllers\Api\GeocodeSetupController;
use App\Http\Controllers\Api\DocumentTemplateController;
use App\Http\Controllers\Api\LabelController;
use App\Http\Controllers\Api\SmtpServerController;
use App\Http\Controllers\Api\WwwUsersController;
use App\Http\Controllers\Api\AccessPermissionsController;
use App\Http\Controllers\Api\MenuAccessController;
use App\Http\Controllers\Api\GeneralLedgerSetupController;
use App\Http\Controllers\Api\SalesReceivablesSetupController;
use App\Http\Controllers\Api\PurchasesPayablesSetupController;
use App\Http\Controllers\Api\InventorySetupController;
use App\Http\Controllers\Api\ManufacturingSetupController;
use App\Http\Controllers\Api\PurchaseOrderController;
use App\Http\Controllers\Api\InventoryTransferController;
use App\Http\Controllers\Api\StockAdjustmentController;

Route::get('/menu', [MenuController::class, 'index']);
Route::get('/menu/categories', [MenuController::class, 'categories']);
Route::get('/menu/parent/{parentId}', [MenuController::class, 'byParent']);

Route::get('/company/preferences', [CompanyPreferencesController::class, 'show']);
Route::put('/company/preferences', [CompanyPreferencesController::class, 'update']);
Route::get('/system/parameters', [SystemParametersController::class, 'show']);
Route::put('/system/parameters', [SystemParametersController::class, 'update']);
Route::get('/system/check', [SystemCheckController::class, 'show']);
Route::get('/audit-trail', [AuditTrailController::class, 'index']);
Route::get('/geocode/setup', [GeocodeSetupController::class, 'show']);
Route::post('/geocode/setup', [GeocodeSetupController::class, 'store']);
Route::put('/geocode/setup/settings', [GeocodeSetupController::class, 'updateSettings']);
Route::post('/geocode/setup/run', [GeocodeSetupController::class, 'run']);
Route::get('/geocode/setup/locations', [GeocodeSetupController::class, 'locations']);
Route::put('/geocode/setup/{id}', [GeocodeSetupController::class, 'update']);
Route::delete('/geocode/setup/{id}', [GeocodeSetupController::class, 'destroy']);
Route::get('/document-templates', [DocumentTemplateController::class, 'index']);
Route::post('/document-templates', [DocumentTemplateController::class, 'store']);
Route::post('/document-templates/{template}/duplicate', [DocumentTemplateController::class, 'duplicate']);
Route::get('/document-templates/{template}', [DocumentTemplateController::class, 'show']);
Route::put('/document-templates/{template}', [DocumentTemplateController::class, 'update']);
Route::delete('/document-templates/{template}', [DocumentTemplateController::class, 'destroy']);
Route::get('/form-designer', [DocumentTemplateController::class, 'index']);
Route::post('/form-designer', [DocumentTemplateController::class, 'store']);
Route::post('/form-designer/{template}/duplicate', [DocumentTemplateController::class, 'duplicate']);
Route::get('/form-designer/{template}', [DocumentTemplateController::class, 'show']);
Route::put('/form-designer/{template}', [DocumentTemplateController::class, 'update']);
Route::delete('/form-designer/{template}', [DocumentTemplateController::class, 'destroy']);
Route::get('/labels', [LabelController::class, 'index']);
Route::post('/labels', [LabelController::class, 'store']);
Route::put('/labels/{id}', [LabelController::class, 'update']);
Route::delete('/labels/{id}', [LabelController::class, 'destroy']);
Route::get('/smtp/server', [SmtpServerController::class, 'show']);
Route::put('/smtp/server', [SmtpServerController::class, 'update']);
Route::post('/smtp/server/test', [SmtpServerController::class, 'test']);
Route::get('/configuration/users/www-users', [WwwUsersController::class, 'index']);
Route::post('/configuration/users/www-users', [WwwUsersController::class, 'store']);
Route::put('/configuration/users/www-users/{userId}', [WwwUsersController::class, 'update']);
Route::delete('/configuration/users/www-users/{userId}', [WwwUsersController::class, 'destroy']);
Route::get('/configuration/users/www-access', [AccessPermissionsController::class, 'index']);
Route::post('/configuration/users/www-access', [AccessPermissionsController::class, 'store']);
Route::put('/configuration/users/www-access/{roleId}', [AccessPermissionsController::class, 'update']);
Route::delete('/configuration/users/www-access/{roleId}', [AccessPermissionsController::class, 'destroy']);
Route::get('/configuration/users/menu-access', [MenuAccessController::class, 'index']);
Route::put('/configuration/users/menu-access/{userId}', [MenuAccessController::class, 'update']);
Route::get('/configuration/general-ledger/setup', [GeneralLedgerSetupController::class, 'index']);
Route::post('/configuration/general-ledger/setup/{entity}', [GeneralLedgerSetupController::class, 'store']);
Route::put('/configuration/general-ledger/setup/{entity}/{id}', [GeneralLedgerSetupController::class, 'update']);
Route::delete('/configuration/general-ledger/setup/{entity}/{id}', [GeneralLedgerSetupController::class, 'destroy']);
Route::get('/configuration/sales-receivables/setup', [SalesReceivablesSetupController::class, 'index']);
Route::post('/configuration/sales-receivables/setup/{entity}', [SalesReceivablesSetupController::class, 'store']);
Route::put('/configuration/sales-receivables/setup/{entity}/{id}', [SalesReceivablesSetupController::class, 'update']);
Route::delete('/configuration/sales-receivables/setup/{entity}/{id}', [SalesReceivablesSetupController::class, 'destroy']);
Route::get('/configuration/purchases-payables/setup', [PurchasesPayablesSetupController::class, 'index']);
Route::post('/configuration/purchases-payables/setup/{entity}', [PurchasesPayablesSetupController::class, 'store']);
Route::put('/configuration/purchases-payables/setup/{entity}/{id}', [PurchasesPayablesSetupController::class, 'update']);
Route::delete('/configuration/purchases-payables/setup/{entity}/{id}', [PurchasesPayablesSetupController::class, 'destroy']);
Route::get('/configuration/inventory/setup', [InventorySetupController::class, 'index']);
Route::post('/configuration/inventory/setup/{entity}', [InventorySetupController::class, 'store']);
Route::put('/configuration/inventory/setup/{entity}/{id}', [InventorySetupController::class, 'update']);
Route::delete('/configuration/inventory/setup/{entity}/{id}', [InventorySetupController::class, 'destroy']);
Route::get('/configuration/manufacturing/setup', [ManufacturingSetupController::class, 'index']);
Route::post('/configuration/manufacturing/setup/{entity}', [ManufacturingSetupController::class, 'store']);
Route::put('/configuration/manufacturing/setup/{entity}/{id}', [ManufacturingSetupController::class, 'update']);
Route::delete('/configuration/manufacturing/setup/{entity}/{id}', [ManufacturingSetupController::class, 'destroy']);

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

Route::prefix('purchases')->group(function () {
    Route::get('/orders', [PurchaseOrderController::class, 'index']);
});

Route::prefix('inventory')->group(function () {
    Route::get('/adjustments/workbench', [StockAdjustmentController::class, 'workbench']);
    Route::get('/adjustment-items', [StockAdjustmentController::class, 'items']);
    Route::post('/adjustments', [StockAdjustmentController::class, 'store']);
    Route::get('/transfers/workbench', [InventoryTransferController::class, 'workbench']);
    Route::get('/transfers/receiving/workbench', [InventoryTransferController::class, 'receivingWorkbench']);
    Route::get('/transfer-items', [InventoryTransferController::class, 'transferItems']);
    Route::get('/transfers/{reference}/print', [InventoryTransferController::class, 'transferPrint']);
    Route::get('/transfers/{reference}', [InventoryTransferController::class, 'show']);
    Route::post('/transfers', [InventoryTransferController::class, 'store']);
    Route::post('/transfers/{reference}/receive', [InventoryTransferController::class, 'receive']);
    Route::put('/transfers/{reference}', [InventoryTransferController::class, 'update']);
});

Route::prefix('gl')->group(function () {
    Route::get('/lookups', [GeneralLedgerController::class, 'lookups']);
    Route::get('/settings', [GeneralLedgerController::class, 'settings']);
    Route::get('/transactions', [GeneralLedgerController::class, 'transactions']);
    Route::post('/transactions', [GeneralLedgerController::class, 'createTransaction']);
    Route::get('/trial-balance', [GeneralLedgerController::class, 'trialBalance']);
    Route::get('/reports/cash-flow', [GeneralLedgerController::class, 'cashFlowReport']);
    Route::get('/reports/tax', [GeneralLedgerController::class, 'taxReport']);
    Route::get('/reports/financial-statement', [GeneralLedgerController::class, 'financialStatement']);
    Route::get('/reports/horizontal-analysis', [GeneralLedgerController::class, 'horizontalAnalysis']);
    Route::get('/reports/account-trend', [GeneralLedgerController::class, 'accountTrend']);
    Route::get('/reports/account-inquiry', [GeneralLedgerController::class, 'accountInquiry']);

    Route::get('/accounts', [GeneralLedgerController::class, 'accounts']);
    Route::post('/accounts', [GeneralLedgerController::class, 'createAccount']);
    Route::put('/accounts/{accountCode}', [GeneralLedgerController::class, 'updateAccount']);
    Route::delete('/accounts/{accountCode}', [GeneralLedgerController::class, 'deleteAccount']);
    Route::post('/accounts/change-code', [GeneralLedgerController::class, 'changeAccountCode']);
    Route::post('/accounts/import-csv', [GeneralLedgerController::class, 'importChartCsv']);

    Route::get('/groups', [GeneralLedgerController::class, 'groups']);
    Route::post('/groups', [GeneralLedgerController::class, 'createGroup']);
    Route::put('/groups/{groupName}', [GeneralLedgerController::class, 'updateGroup']);
    Route::delete('/groups/{groupName}', [GeneralLedgerController::class, 'deleteGroup']);
    Route::post('/groups/move', [GeneralLedgerController::class, 'moveGroup']);

    Route::get('/sections', [GeneralLedgerController::class, 'sections']);
    Route::post('/sections', [GeneralLedgerController::class, 'createSection']);
    Route::put('/sections/{sectionId}', [GeneralLedgerController::class, 'updateSection']);
    Route::delete('/sections/{sectionId}', [GeneralLedgerController::class, 'deleteSection']);

    Route::get('/bank-accounts', [GeneralLedgerController::class, 'bankAccounts']);
    Route::post('/bank-accounts', [GeneralLedgerController::class, 'createBankAccount']);
    Route::put('/bank-accounts/{accountCode}', [GeneralLedgerController::class, 'updateBankAccount']);
    Route::delete('/bank-accounts/{accountCode}', [GeneralLedgerController::class, 'deleteBankAccount']);
    Route::get('/bank-transactions', [GeneralLedgerController::class, 'bankTransactions']);
    Route::post('/bank-transactions', [GeneralLedgerController::class, 'createBankTransaction']);
    Route::post('/bank-transactions/import-csv', [GeneralLedgerController::class, 'importBankTransactionsCsv']);
    Route::post('/bank-transactions/{bankTransId}/match', [GeneralLedgerController::class, 'matchBankTransaction']);
    Route::post('/bank-transactions/{bankTransId}/unmatch', [GeneralLedgerController::class, 'unmatchBankTransaction']);

    Route::get('/budgets', [GeneralLedgerController::class, 'budgets']);
    Route::post('/budgets', [GeneralLedgerController::class, 'upsertBudget']);

    Route::get('/tags', [GeneralLedgerController::class, 'tags']);
    Route::post('/tags', [GeneralLedgerController::class, 'createTag']);
    Route::put('/tags/{tagRef}', [GeneralLedgerController::class, 'updateTag']);
    Route::delete('/tags/{tagRef}', [GeneralLedgerController::class, 'deleteTag']);

    Route::get('/account-users', [GeneralLedgerController::class, 'accountUsers']);
    Route::post('/account-users', [GeneralLedgerController::class, 'upsertAccountUser']);
    Route::delete('/account-users', [GeneralLedgerController::class, 'deleteAccountUser']);
});
