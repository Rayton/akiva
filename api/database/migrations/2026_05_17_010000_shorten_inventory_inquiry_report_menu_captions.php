<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const PARENT_CAPTION = 'Inquiries and Reports';

    private const MODULE_CAPTION = 'Inventory';

    private const CAPTION_UPDATES = [
        'PDFPrintLabel.php?' => [['Print Price Labels'], 'Price Labels'],
        'StockSerialItemResearch.php?' => [['Serial Item Research Tool', 'Serial Item Research'], 'Serial Research'],
        'StockMovements.php?' => [['Inventory Item Movements', 'Stock Movements'], 'Stock Moves'],
        'StockStatus.php?' => [['Inventory Item Status'], 'Stock Status'],
        'StockUsage.php?' => [['Inventory Item Usage'], 'Stock Usage'],
        'AllStockUsage.php?' => [['All Inventory Usage'], 'All Usage'],
        'InventoryQuantities.php?' => [['Inventory Quantities'], 'Quantities'],
        'ReorderLevel.php?' => [['Reorder Level'], 'Reorder Levels'],
        'ReorderLevelLocation.php?' => [['Reorder Level By Category/Location', 'Location Reorder Levels'], 'Loc Reorder'],
        'StockDispatch.php?' => [['Stock Dispatch'], 'Dispatch'],
        'InventoryValuation.php?' => [['Inventory Valuation Report', 'Inventory Valuation'], 'Valuation'],
        'InventoryPlanning.php?' => [['Inventory Planning Report', 'Inventory Planning'], 'Planning'],
        'InventoryPlanningPrefSupplier.php?' => [['Inventory Planning Based On Preferred Supplier Data', 'Supplier Planning'], 'Supplier Plan'],
        'StockCheck.php?' => [['Inventory Stock Check Sheets', 'Stock Check Sheets'], 'Check Sheets'],
        'StockQties_csv.php?' => [['Make Inventory Quantities CSV', 'Stock Quantities CSV'], 'Qty CSV'],
        'PDFStockCheckComparison.php?' => [['Compare Counts Vs Stock Check Data', 'Count Comparison'], 'Count Compare'],
        'StockLocMovements.php?' => [['All Inventory Movements By Location/Date', 'Location Stock Movements'], 'Loc Movements'],
        'StockLocStatus.php?' => [['List Inventory Status By Location/Category', 'Location Stock Status'], 'Loc Status'],
        'StockQuantityByDate.php?' => [['Historical Stock Quantity By Location/Category', 'Historical Quantities'], 'Qty by Date'],
        'PDFStockNegatives.php?' => [['List Negative Stocks'], 'Negative Stock'],
        'PDFStockTransListing.php?' => [['Daily Stock Transaction Listing', 'Stock Transactions'], 'Stock Txns'],
    ];

    public function up(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        $parentId = $this->inventoryInquiryReportsParentId();
        if ($parentId === null) {
            return;
        }

        foreach (self::CAPTION_UPDATES as $href => [$from, $to]) {
            DB::table('menu')
                ->where('parent', $parentId)
                ->where('href', $href)
                ->whereIn('caption', $from)
                ->update(['caption' => $to]);
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        $parentId = $this->inventoryInquiryReportsParentId();
        if ($parentId === null) {
            return;
        }

        foreach (self::CAPTION_UPDATES as $href => [$from, $to]) {
            DB::table('menu')
                ->where('parent', $parentId)
                ->where('href', $href)
                ->where('caption', $to)
                ->update(['caption' => $from[0]]);
        }
    }

    private function inventoryInquiryReportsParentId(): mixed
    {
        return DB::table('menu as child')
            ->join('menu as parent', 'child.parent', '=', 'parent.id')
            ->where('child.caption', self::PARENT_CAPTION)
            ->where('parent.caption', self::MODULE_CAPTION)
            ->value('child.id');
    }
};
