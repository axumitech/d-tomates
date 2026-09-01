<?php

declare(strict_types=1);

namespace App\Enums;

enum AssetStatus: string
{
    case InService = 'in_service';
    case Degraded = 'degraded';
    case Down = 'down';
    case Retired = 'retired';

    public function label(): string
    {
        return match ($this) {
            self::InService => 'En service',
            self::Degraded => 'Dégradé — fonctionne mal',
            self::Down => 'À l\'arrêt',
            self::Retired => 'Réformé',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::InService => 'success',
            self::Degraded => 'warning',
            self::Down => 'danger',
            self::Retired => 'gray',
        };
    }

    public function isUsable(): bool
    {
        return $this === self::InService || $this === self::Degraded;
    }
}
