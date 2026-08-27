<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;

final class ServerClock
{
    public static function now(): CarbonImmutable
    {
        return CarbonImmutable::now(config('dtomate.timezone'));
    }

    public static function today(): CarbonImmutable
    {
        return self::now()->startOfDay();
    }
}
