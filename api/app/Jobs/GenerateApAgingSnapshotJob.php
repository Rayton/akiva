<?php

namespace App\Jobs;

use App\Services\AccountsPayable\ForecastingService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class GenerateApAgingSnapshotJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public string $snapshotDate)
    {
    }

    public function handle(ForecastingService $forecastingService): void
    {
        $forecastingService->snapshot($this->snapshotDate);
    }
}
