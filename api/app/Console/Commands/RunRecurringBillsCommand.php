<?php

namespace App\Console\Commands;

use App\Jobs\RunRecurringBillsJob;
use Illuminate\Console\Command;

class RunRecurringBillsCommand extends Command
{
    protected $signature = 'ap:recurring-run {--date=} {--sync}';
    protected $description = 'Execute AP recurring bill generation';

    public function handle(): int
    {
        $date = (string) ($this->option('date') ?: now()->toDateString());
        if ($this->option('sync')) {
            RunRecurringBillsJob::dispatchSync($date);
            $this->info('Recurring bill run executed synchronously for '.$date);
            return self::SUCCESS;
        }

        RunRecurringBillsJob::dispatch($date);
        $this->info('Recurring bill run queued for '.$date);
        return self::SUCCESS;
    }
}
