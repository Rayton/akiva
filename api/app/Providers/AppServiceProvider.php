<?php

namespace App\Providers;

use App\Support\AuditTrailLogger;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            return;
        }

        DB::listen(function (QueryExecuted $query): void {
            AuditTrailLogger::logQuery($query);
        });
    }
}
