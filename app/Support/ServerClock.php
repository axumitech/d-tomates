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

    public static function workDateNeedsApproval(CarbonImmutable $workDate): bool
    {
        $date = $workDate->setTimezone((string) config('dtomate.timezone'))->startOfDay();
        $today = self::today();

        if ($date->isAfter($today)) {
            return true;
        }

        return $date->isBefore(self::now()->subHours((int) config('dtomate.backdate_tolerance_hours', 24))->startOfDay());
    }
}
