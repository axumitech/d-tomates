<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('dtomate:scheduler-heartbeat')->everyMinute()->withoutOverlapping();
