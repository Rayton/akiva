<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('labels')) {
            Schema::create('labels', function (Blueprint $table) {
                $table->tinyIncrements('labelid');
                $table->string('description', 50);
                $table->double('pagewidth')->default(0);
                $table->double('pageheight')->default(0);
                $table->double('height')->default(0);
                $table->double('width')->default(0);
                $table->double('topmargin')->default(0);
                $table->double('leftmargin')->default(0);
                $table->double('rowheight')->default(0);
                $table->double('columnwidth')->default(0);
                $table->timestamps();
                $table->softDeletes();
            });
        } else {
            Schema::table('labels', function (Blueprint $table) {
                if (!Schema::hasColumn('labels', 'description')) {
                    $table->string('description', 50)->after('labelid');
                }
                if (!Schema::hasColumn('labels', 'pagewidth')) {
                    $table->double('pagewidth')->default(0)->after('description');
                }
                if (!Schema::hasColumn('labels', 'pageheight')) {
                    $table->double('pageheight')->default(0)->after('pagewidth');
                }
                if (!Schema::hasColumn('labels', 'height')) {
                    $table->double('height')->default(0)->after('pageheight');
                }
                if (!Schema::hasColumn('labels', 'width')) {
                    $table->double('width')->default(0)->after('height');
                }
                if (!Schema::hasColumn('labels', 'topmargin')) {
                    $table->double('topmargin')->default(0)->after('width');
                }
                if (!Schema::hasColumn('labels', 'leftmargin')) {
                    $table->double('leftmargin')->default(0)->after('topmargin');
                }
                if (!Schema::hasColumn('labels', 'rowheight')) {
                    $table->double('rowheight')->default(0)->after('leftmargin');
                }
                if (!Schema::hasColumn('labels', 'columnwidth')) {
                    $table->double('columnwidth')->default(0)->after('rowheight');
                }
                if (!Schema::hasColumn('labels', 'created_at')) {
                    $table->timestamp('created_at')->nullable()->after('columnwidth');
                }
                if (!Schema::hasColumn('labels', 'updated_at')) {
                    $table->timestamp('updated_at')->nullable()->after('created_at');
                }
                if (!Schema::hasColumn('labels', 'deleted_at')) {
                    $table->softDeletes()->after('updated_at');
                }
            });
        }

        if (!Schema::hasTable('labelfields')) {
            Schema::create('labelfields', function (Blueprint $table) {
                $table->increments('labelfieldid');
                $table->unsignedTinyInteger('labelid')->index();
                $table->string('fieldvalue', 20);
                $table->double('vpos')->default(0)->index();
                $table->double('hpos')->default(0);
                $table->unsignedTinyInteger('fontsize')->default(10);
                $table->boolean('barcode')->default(false);
                $table->timestamps();
                $table->softDeletes();
            });
        } else {
            Schema::table('labelfields', function (Blueprint $table) {
                if (!Schema::hasColumn('labelfields', 'labelid')) {
                    $table->unsignedTinyInteger('labelid')->index()->after('labelfieldid');
                }
                if (!Schema::hasColumn('labelfields', 'fieldvalue')) {
                    $table->string('fieldvalue', 20)->after('labelid');
                }
                if (!Schema::hasColumn('labelfields', 'vpos')) {
                    $table->double('vpos')->default(0)->index()->after('fieldvalue');
                }
                if (!Schema::hasColumn('labelfields', 'hpos')) {
                    $table->double('hpos')->default(0)->after('vpos');
                }
                if (!Schema::hasColumn('labelfields', 'fontsize')) {
                    $table->unsignedTinyInteger('fontsize')->default(10)->after('hpos');
                }
                if (!Schema::hasColumn('labelfields', 'barcode')) {
                    $table->boolean('barcode')->default(false)->after('fontsize');
                }
                if (!Schema::hasColumn('labelfields', 'created_at')) {
                    $table->timestamp('created_at')->nullable()->after('barcode');
                }
                if (!Schema::hasColumn('labelfields', 'updated_at')) {
                    $table->timestamp('updated_at')->nullable()->after('created_at');
                }
                if (!Schema::hasColumn('labelfields', 'deleted_at')) {
                    $table->softDeletes()->after('updated_at');
                }
            });
        }
    }

    public function down(): void
    {
        foreach (['labelfields', 'labels'] as $tableName) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                foreach (['created_at', 'updated_at', 'deleted_at'] as $column) {
                    if (Schema::hasColumn($tableName, $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }
};
