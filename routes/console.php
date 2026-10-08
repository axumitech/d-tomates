<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('dtomate:scheduler-heartbeat')->everyMinute()->withoutOverlapping();
Schedule::command('maintenance:emit')->dailyAt('05:30')->withoutOverlapping();
Schedule::command('maintenance:chase')->hourly()->withoutOverlapping();

// Horaires du site agricole (DTOMATE_TZ), indépendants du fuseau du serveur.
Schedule::command('tasks:daily generate')->dailyAt('05:45')->timezone(config('dtomate.timezone'))->withoutOverlapping();
Schedule::command('tasks:daily remind --slot=morning')->dailyAt(config('dtomate.tasks.morning'))->timezone(config('dtomate.timezone'))->withoutOverlapping();
Schedule::command('tasks:daily remind --slot=afternoon')->dailyAt(config('dtomate.tasks.afternoon'))->timezone(config('dtomate.timezone'))->withoutOverlapping();
Schedule::command('tasks:daily remind --slot=review')->dailyAt(config('dtomate.tasks.review'))->timezone(config('dtomate.timezone'))->withoutOverlapping();
Schedule::command('tasks:daily report')->dailyAt(config('dtomate.tasks.report'))->timezone(config('dtomate.timezone'))->withoutOverlapping();
