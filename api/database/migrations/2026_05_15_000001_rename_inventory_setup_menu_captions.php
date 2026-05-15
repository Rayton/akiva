<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const CAPTION_UPDATES = [
        'StockCategories.php?' => [
            'from' => ['Inventory Categories Maintenance', 'Inventory Categories Maintanance'],
            'to' => 'Inventory Categories',
        ],
        'Locations.php?' => [
            'from' => ['Inventory Locations Maintenance', 'Inventory Locations Maintanance'],
            'to' => 'Inventory Locations',
        ],
        'DiscountCategories.php?' => [
            'from' => ['Discount Category Maintenance', 'Discount Category Maintanance'],
            'to' => 'Discount Category',
        ],
    ];

    public function up(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        foreach (self::CAPTION_UPDATES as $href => $caption) {
            DB::table('menu')
                ->where('parent', 220)
                ->where('href', $href)
                ->whereIn('caption', $caption['from'])
                ->update(['caption' => $caption['to']]);
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        foreach (self::CAPTION_UPDATES as $href => $caption) {
            DB::table('menu')
                ->where('parent', 220)
                ->where('href', $href)
                ->where('caption', $caption['to'])
                ->update(['caption' => $caption['from'][0]]);
        }
    }
};
