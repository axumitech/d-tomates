<?php

declare(strict_types=1);

namespace App\Enums;

enum Role: string
{
    case Direction = 'direction';
    case Superviseur = 'superviseur';
    case Magasinier = 'magasinier';
    case Agent = 'agent';

    public function label(): string
    {
        return match ($this) {
            self::Direction => 'Direction',
            self::Superviseur => 'Superviseur',
            self::Magasinier => 'Magasinier',
            self::Agent => 'Agent',
        };
    }

    public function canCloseDay(): bool
    {
        return $this === self::Direction || $this === self::Superviseur;
    }

    public function canIssueStock(): bool
    {
        return $this === self::Magasinier;
    }

    public function defaultCeilingCents(): int
    {
        return match ($this) {
            self::Direction => PHP_INT_MAX, self::Superviseur => 20_000, default => 0
        };
    }
}
