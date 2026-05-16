<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const MENU_ID = 87;

    public function up(): void
    {
        if (!Schema::hasTable('menu') || DB::table('menu')->where('href', 'AllStockUsage.php?')->exists()) {
            return;
        }

        DB::transaction(function () {
            DB::table('menu')->where('id', '>=', self::MENU_ID)->orderByDesc('id')->get()->each(function ($row) {
                DB::table('menu')->where('id', $row->id)->update(['id' => (int) $row->id + 1]);
            });

            DB::table('menu')->where('parent', '>=', self::MENU_ID)->increment('parent');

            if (Schema::hasTable('usermenurights')) {
                DB::table('usermenurights')->where('menuid', '>=', self::MENU_ID)->orderByDesc('menuid')->get()->each(function ($row) {
                    DB::table('usermenurights')
                        ->where('userid', $row->userid)
                        ->where('menuid', $row->menuid)
                        ->update(['menuid' => (int) $row->menuid + 1]);
                });
            }

            DB::table('menu')->insert([
                'id' => self::MENU_ID,
                'parent' => 81,
                'caption' => 'All Inventory Usage',
                'href' => 'AllStockUsage.php?',
            ]);
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        DB::transaction(function () {
            DB::table('menu')->where('id', self::MENU_ID)->where('href', 'AllStockUsage.php?')->delete();

            DB::table('menu')->where('parent', '>', self::MENU_ID)->decrement('parent');

            if (Schema::hasTable('usermenurights')) {
                DB::table('usermenurights')->where('menuid', '>', self::MENU_ID)->orderBy('menuid')->get()->each(function ($row) {
                    DB::table('usermenurights')
                        ->where('userid', $row->userid)
                        ->where('menuid', $row->menuid)
                        ->update(['menuid' => (int) $row->menuid - 1]);
                });
            }

            DB::table('menu')->where('id', '>', self::MENU_ID)->orderBy('id')->get()->each(function ($row) {
                DB::table('menu')->where('id', $row->id)->update(['id' => (int) $row->id - 1]);
            });
        });
    }
};
