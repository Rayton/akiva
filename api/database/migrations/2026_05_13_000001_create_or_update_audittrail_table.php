<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('audittrail')) {
            Schema::create('audittrail', function (Blueprint $table) {
                $table->id();
                $table->dateTime('transactiondate')->index();
                $table->string('userid', 20)->index();
                $table->longText('querystring')->nullable();
                $table->string('event', 32)->nullable()->index();
                $table->string('source', 32)->nullable()->index();
                $table->string('table_name', 128)->nullable()->index();
                $table->string('auditable_type')->nullable()->index();
                $table->string('auditable_id')->nullable()->index();
                $table->longText('old_values')->nullable();
                $table->longText('new_values')->nullable();
                $table->longText('bindings')->nullable();
                $table->string('url', 2048)->nullable();
                $table->string('request_method', 16)->nullable();
                $table->string('ip_address', 64)->nullable();
                $table->text('user_agent')->nullable();
                $table->uuid('request_id')->nullable()->index();
                $table->unsignedInteger('execution_ms')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });

            return;
        }

        DB::statement("SET SESSION sql_mode = REPLACE(REPLACE(@@SESSION.sql_mode, 'NO_ZERO_DATE', ''), 'NO_ZERO_IN_DATE', '')");
        DB::statement("ALTER TABLE `audittrail` MODIFY `transactiondate` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP");

        Schema::table('audittrail', function (Blueprint $table) {
            if (!Schema::hasColumn('audittrail', 'event')) {
                $table->string('event', 32)->nullable()->index()->after('querystring');
            }
            if (!Schema::hasColumn('audittrail', 'source')) {
                $table->string('source', 32)->nullable()->index()->after('event');
            }
            if (!Schema::hasColumn('audittrail', 'table_name')) {
                $table->string('table_name', 128)->nullable()->index()->after('source');
            }
            if (!Schema::hasColumn('audittrail', 'auditable_type')) {
                $table->string('auditable_type')->nullable()->index()->after('table_name');
            }
            if (!Schema::hasColumn('audittrail', 'auditable_id')) {
                $table->string('auditable_id')->nullable()->index()->after('auditable_type');
            }
            if (!Schema::hasColumn('audittrail', 'old_values')) {
                $table->longText('old_values')->nullable()->after('auditable_id');
            }
            if (!Schema::hasColumn('audittrail', 'new_values')) {
                $table->longText('new_values')->nullable()->after('old_values');
            }
            if (!Schema::hasColumn('audittrail', 'bindings')) {
                $table->longText('bindings')->nullable()->after('new_values');
            }
            if (!Schema::hasColumn('audittrail', 'url')) {
                $table->string('url', 2048)->nullable()->after('bindings');
            }
            if (!Schema::hasColumn('audittrail', 'request_method')) {
                $table->string('request_method', 16)->nullable()->after('url');
            }
            if (!Schema::hasColumn('audittrail', 'ip_address')) {
                $table->string('ip_address', 64)->nullable()->after('request_method');
            }
            if (!Schema::hasColumn('audittrail', 'user_agent')) {
                $table->text('user_agent')->nullable()->after('ip_address');
            }
            if (!Schema::hasColumn('audittrail', 'request_id')) {
                $table->uuid('request_id')->nullable()->index()->after('user_agent');
            }
            if (!Schema::hasColumn('audittrail', 'execution_ms')) {
                $table->unsignedInteger('execution_ms')->nullable()->after('request_id');
            }
            if (!Schema::hasColumn('audittrail', 'created_at')) {
                $table->timestamp('created_at')->nullable()->after('execution_ms');
            }
            if (!Schema::hasColumn('audittrail', 'updated_at')) {
                $table->timestamp('updated_at')->nullable()->after('created_at');
            }
            if (!Schema::hasColumn('audittrail', 'deleted_at')) {
                $table->softDeletes()->after('updated_at');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('audittrail')) {
            return;
        }

        Schema::table('audittrail', function (Blueprint $table) {
            foreach ([
                'event',
                'source',
                'table_name',
                'auditable_type',
                'auditable_id',
                'old_values',
                'new_values',
                'bindings',
                'url',
                'request_method',
                'ip_address',
                'user_agent',
                'request_id',
                'execution_ms',
                'created_at',
                'updated_at',
                'deleted_at',
            ] as $column) {
                if (Schema::hasColumn('audittrail', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
