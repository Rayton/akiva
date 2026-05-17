<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('stockitemtypes')) {
            Schema::create('stockitemtypes', function (Blueprint $table) {
                $table->char('code', 1)->primary();
                $table->string('name', 50);
                $table->boolean('is_system')->default(false);
                $table->timestamps();
            });
        }

        $now = now();
        foreach ($this->defaultTypes() as $code => $name) {
            DB::table('stockitemtypes')->updateOrInsert(
                ['code' => $code],
                ['name' => $name, 'is_system' => true, 'updated_at' => $now, 'created_at' => $now]
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('stockitemtypes');
    }

    private function defaultTypes(): array
    {
        return [
            'B' => 'Purchased stock',
            'M' => 'Manufactured stock',
            'D' => 'Service or labour',
            'A' => 'Assembly',
            'K' => 'Kit set',
        ];
    }
};
