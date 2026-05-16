<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const INDEX_NAME = 'idx_akiva_stockmoves_all_usage';

    public function up(): void
    {
        if (!Schema::hasTable('stockmoves') || $this->indexExists()) {
            return;
        }

        $this->withoutZeroDateStrictMode(function () {
            DB::statement('CREATE INDEX ' . self::INDEX_NAME . ' ON stockmoves (hidemovt, type, loccode, trandate, stockid, stkmoveno)');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('stockmoves') || !$this->indexExists()) {
            return;
        }

        DB::statement('DROP INDEX ' . self::INDEX_NAME . ' ON stockmoves');
    }

    private function indexExists(): bool
    {
        $database = (string) config('database.connections.mysql.database');

        return DB::table('information_schema.statistics')
            ->where('table_schema', $database)
            ->where('table_name', 'stockmoves')
            ->where('index_name', self::INDEX_NAME)
            ->exists();
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
