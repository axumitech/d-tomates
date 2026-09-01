<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Ce que l'arrêt du bien coûte réellement. C'est cette valeur qui fixe le
 * délai d'intervention, pas l'humeur du moment.
 */
enum Criticality: string
{
    case Vital = 'vital';
    case Important = 'important';
    case Ordinary = 'ordinary';

    public function label(): string
    {
        return match ($this) {
            self::Vital => 'Vital — la production s\'arrête',
            self::Important => 'Important — la production ralentit',
            self::Ordinary => 'Courant — gêne sans arrêter',
        };
    }

    /** Délai d'intervention attendu, en heures. */
    public function responseHours(): int
    {
        return match ($this) {
            self::Vital => 4,
            self::Important => 24,
            self::Ordinary => 72,
        };
    }
}
