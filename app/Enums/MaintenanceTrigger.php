<?php

declare(strict_types=1);

namespace App\Enums;

enum MaintenanceTrigger: string
{
    case Calendar = 'calendar';
    case Meter = 'meter';

    public function label(): string
    {
        return match ($this) {
            self::Calendar => 'Au calendrier — tous les N jours',
            self::Meter => 'Au compteur — toutes les N heures ou N km',
        };
    }
}
