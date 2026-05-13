<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('emailsettings')) {
            Schema::create('emailsettings', function (Blueprint $table) {
                $table->id();
                $table->string('host', 255)->default('');
                $table->unsignedInteger('port')->default(25);
                $table->string('heloaddress', 255)->default('');
                $table->string('username', 255)->default('');
                $table->string('password', 255)->default('');
                $table->unsignedInteger('timeout')->default(5);
                $table->boolean('auth')->default(false);
                $table->string('encryption', 20)->default('none');
                $table->string('from_address', 255)->nullable();
                $table->string('from_name', 255)->nullable();
                $table->timestamps();
                $table->softDeletes();
            });

            return;
        }

        Schema::table('emailsettings', function (Blueprint $table) {
            if (!Schema::hasColumn('emailsettings', 'host')) {
                $table->string('host', 255)->default('')->after('id');
            }
            if (!Schema::hasColumn('emailsettings', 'port')) {
                $table->unsignedInteger('port')->default(25)->after('host');
            }
            if (!Schema::hasColumn('emailsettings', 'heloaddress')) {
                $table->string('heloaddress', 255)->default('')->after('port');
            }
            if (!Schema::hasColumn('emailsettings', 'username')) {
                $table->string('username', 255)->default('')->after('heloaddress');
            }
            if (!Schema::hasColumn('emailsettings', 'password')) {
                $table->string('password', 255)->default('')->after('username');
            }
            if (!Schema::hasColumn('emailsettings', 'timeout')) {
                $table->unsignedInteger('timeout')->default(5)->after('password');
            }
            if (!Schema::hasColumn('emailsettings', 'auth')) {
                $table->boolean('auth')->default(false)->after('timeout');
            }
            if (!Schema::hasColumn('emailsettings', 'encryption')) {
                $table->string('encryption', 20)->default('none')->after('auth');
            }
            if (!Schema::hasColumn('emailsettings', 'from_address')) {
                $table->string('from_address', 255)->nullable()->after('encryption');
            }
            if (!Schema::hasColumn('emailsettings', 'from_name')) {
                $table->string('from_name', 255)->nullable()->after('from_address');
            }
            if (!Schema::hasColumn('emailsettings', 'created_at')) {
                $table->timestamp('created_at')->nullable()->after('from_name');
            }
            if (!Schema::hasColumn('emailsettings', 'updated_at')) {
                $table->timestamp('updated_at')->nullable()->after('created_at');
            }
            if (!Schema::hasColumn('emailsettings', 'deleted_at')) {
                $table->softDeletes()->after('updated_at');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('emailsettings')) {
            return;
        }

        Schema::table('emailsettings', function (Blueprint $table) {
            foreach (['encryption', 'from_address', 'from_name', 'created_at', 'updated_at', 'deleted_at'] as $column) {
                if (Schema::hasColumn('emailsettings', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
