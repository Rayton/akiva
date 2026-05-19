<?php

namespace App\Jobs;

use App\Services\AccountsPayable\RecurringBillService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class RunRecurringBillsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public string $runDate)
    {
    }

    public function handle(RecurringBillService $service): void
    {
        $service->run($this->runDate);
    }
}
