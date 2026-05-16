<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const CAPTION_UPDATES = [
        'Transactions' => 'Stock Operations',
        'Receive Purchase Orders' => 'Purchase Order Receiving',
        'Bulk Inventory Transfer - Dispatch' => 'Dispatch Stock Transfer',
        'Bulk Inventory Transfer - Receive' => 'Receive Stock Transfer',
        'Inventory Location Transfers' => 'Stock Location Transfers',
        'Inventory Adjustments' => 'Stock Adjustments',
        'Reverse Goods Received' => 'Reverse Goods Receipt',
        'Enter Stock Counts' => 'Stock Counts',
        'Inventory Issue' => 'Stock Issue',
    ];

    public function up(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        foreach (self::CAPTION_UPDATES as $from => $to) {
            DB::table('menu')
                ->where('caption', $from)
                ->update(['caption' => $to]);
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        foreach (self::CAPTION_UPDATES as $from => $to) {
            DB::table('menu')
                ->where('caption', $to)
                ->update(['caption' => $from]);
        }
    }
};
