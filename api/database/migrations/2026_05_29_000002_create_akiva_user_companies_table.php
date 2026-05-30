<?php

use App\Support\AkivaDatabase;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('akiva_user_companies', function (Blueprint $table) {
            $table->id();
            $table->string('user_id', 20)->index();
            $table->string('company_name', 120);
            $table->string('database_name', 96)->index();
            $table->boolean('is_default')->default(false);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['user_id', 'database_name']);
        });

        Schema::table('akiva_auth_sessions', function (Blueprint $table) {
            $table->string('company_database', 96)->nullable()->index();
            $table->string('company_name', 120)->nullable();
        });

        $databaseName = AkivaDatabase::defaultDatabaseName();
        $companyName = $databaseName;
        if (Schema::hasTable('companies')) {
            $companyName = (string) (DB::table('companies')->where('coycode', 1)->value('coyname') ?: $companyName);
        }

        if ($databaseName !== '' && Schema::hasTable('www_users')) {
            DB::table('www_users')
                ->select('userid')
                ->orderBy('userid')
                ->chunk(500, function ($users) use ($databaseName, $companyName) {
                    $now = now();
                    $rows = $users->map(fn ($user) => [
                        'user_id' => (string) $user->userid,
                        'company_name' => $companyName,
                        'database_name' => $databaseName,
                        'is_default' => true,
                        'active' => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ])->all();

                    DB::table('akiva_user_companies')->insertOrIgnore($rows);
                });
        }
    }

    public function down(): void
    {
        Schema::table('akiva_auth_sessions', function (Blueprint $table) {
            $table->dropColumn(['company_database', 'company_name']);
        });

        Schema::dropIfExists('akiva_user_companies');
    }
};
