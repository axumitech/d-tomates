<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Une unité de base par dimension — CDC-SI-001 §6.4.
 * Masse en grammes, volume en millilitres, dénombrement en unités.
 * Toute quantité stockée en base est un ENTIER dans ces unités : pas de
 * flottant sur du stock, jamais.
 */
enum Dimension: string
{
    case Mass = 'mass';
    case Volume = 'volume';
    case Count = 'count';

    public function baseUnitCode(): string
    {
        return match ($this) {
            self::Mass => 'g',
            self::Volume => 'ml',
            self::Count => 'u',
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::Mass => 'Masse (base : gramme)',
            self::Volume => 'Volume (base : millilitre)',
            self::Count => 'Dénombrement (base : unité)',
        };
    }

    /** Devine la dimension à partir d'un libellé d'unité du carnet v5.3. */
    public static function guessFromLegacyUnit(string $unit): self
    {
        return match (mb_strtolower(trim($unit))) {
            'kg', 'g', 'tonne', 't' => self::Mass,
            'l', 'ml', 'litre', 'litres' => self::Volume,
            default => self::Count,
        };
    }
}
