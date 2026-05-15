<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('discountcategories')) {
            Schema::create('discountcategories', function (Blueprint $table) {
                $table->char('code', 2)->primary();
                $table->string('name', 40);
                $table->timestamps();
            });
        }

        $codes = collect();

        if (Schema::hasTable('stockmaster')) {
            $codes = $codes->merge(
                DB::table('stockmaster')
                    ->select('discountcategory')
                    ->whereNotNull('discountcategory')
                    ->where('discountcategory', '<>', '')
                    ->distinct()
                    ->pluck('discountcategory')
            );
        }

        if (Schema::hasTable('discountmatrix')) {
            $codes = $codes->merge(
                DB::table('discountmatrix')
                    ->select('discountcategory')
                    ->whereNotNull('discountcategory')
                    ->where('discountcategory', '<>', '')
                    ->distinct()
                    ->pluck('discountcategory')
            );
        }

        $codes->map(static function ($code) {
            return strtoupper(trim((string) $code));
        })->filter()->unique()->each(static function ($code) {
            DB::table('discountcategories')->updateOrInsert(
                ['code' => $code],
                ['name' => $code, 'updated_at' => now(), 'created_at' => now()]
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('discountcategories');
    }
};
