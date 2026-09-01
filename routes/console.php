<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('dtomate:scheduler-heartbeat')->everyMinute()->withoutOverlapping();
Schedule::command('maintenance:emit')->dailyAt('05:30')->withoutOverlapping();
Schedule::command('maintenance:chase')->hourly()->withoutOverlapping();
