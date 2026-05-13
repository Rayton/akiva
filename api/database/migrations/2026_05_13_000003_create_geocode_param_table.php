<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('geocode_param')) {
            return;
        }

        Schema::create('geocode_param', function (Blueprint $table) {
            $table->tinyIncrements('geocodeid');
            $table->string('geocode_key', 200)->default('');
            $table->string('center_long', 20)->default('');
            $table->string('center_lat', 20)->default('');
            $table->string('map_height', 10)->default('');
            $table->string('map_width', 10)->default('');
            $table->string('map_host', 50)->default('');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('geocode_param');
    }
};
