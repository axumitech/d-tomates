<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\ServerClock;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

final class SchedulerHeartbeat extends Command
{
    protected $signature = 'dtomate:scheduler-heartbeat';

    protected $description = 'Enregistre la preuve que l’ordonnanceur fonctionne.';

    public function handle(): int
    {
        Cache::forever('dtomate.scheduler.last_beat', ServerClock::now()->toIso8601String());

        return self::SUCCESS;
    }
}
