<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('stockmoves')) {
            return;
        }

        $this->withoutZeroDateStrictMode(function () {
            if (!$this->indexExists('stockmoves', 'idx_akiva_stockmoves_usage')) {
                DB::statement('ALTER TABLE stockmoves ADD INDEX idx_akiva_stockmoves_usage (stockid, hidemovt, type, trandate, prd, loccode)');
            }

            if (!$this->indexExists('stockmoves', 'idx_akiva_stockmoves_item_location_date')) {
                DB::statement('ALTER TABLE stockmoves ADD INDEX idx_akiva_stockmoves_item_location_date (stockid, loccode, hidemovt, trandate)');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('stockmoves')) {
            return;
        }

        if ($this->indexExists('stockmoves', 'idx_akiva_stockmoves_item_location_date')) {
            DB::statement('ALTER TABLE stockmoves DROP INDEX idx_akiva_stockmoves_item_location_date');
        }

        if ($this->indexExists('stockmoves', 'idx_akiva_stockmoves_usage')) {
            DB::statement('ALTER TABLE stockmoves DROP INDEX idx_akiva_stockmoves_usage');
        }
    }

    private function indexExists(string $table, string $index): bool
    {
        $rows = DB::select('SHOW INDEX FROM ' . $table . ' WHERE Key_name = ?', [$index]);
        return count($rows) > 0;
    }

    private function withoutZeroDateStrictMode(callable $callback): void
    {
        $mode = (string) (DB::selectOne('SELECT @@SESSION.sql_mode as mode')->mode ?? '');
        $nextMode = collect(explode(',', $mode))
            ->map(fn ($value) => trim($value))
            ->filter(fn ($value) => $value !== '' && !in_array($value, ['NO_ZERO_DATE', 'NO_ZERO_IN_DATE'], true))
            ->implode(',');

        DB::statement('SET SESSION sql_mode = ?', [$nextMode]);

        try {
            $callback();
        } finally {
            DB::statement('SET SESSION sql_mode = ?', [$mode]);
        }
    }
};
