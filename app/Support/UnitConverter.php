<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Item;
use App\Models\Packaging;
use App\Models\Unit;
use InvalidArgumentException;

/**
 * CDC-SI-001 §6.4 — le système refuse tout mouvement dont l'unité relève
 * d'une autre dimension que celle de l'article. On ne sort pas des litres
 * d'un article compté en kilogrammes.
 *
 * L'ordre de résolution est : conditionnement propre à l'article d'abord
 * (« sac de 50 kg »), puis unité générale ensuite (« kg »).
 */
final class UnitConverter
{
    /** Convertit une quantité saisie vers l'unité de base de l'article. */
    public static function toBase(Item $item, string $unitCode, float $quantity): int
    {
        if (! is_finite($quantity) || $quantity < 0) {
            throw new InvalidArgumentException('Une quantité ne peut pas être négative.');
        }

        $factor = self::factorFor($item, $unitCode);

        return (int) round($quantity * $factor);
    }

    /** Convertit une quantité de base vers une unité d'affichage. */
    public static function fromBase(Item $item, string $unitCode, int $baseQuantity): float
    {
        $factor = self::factorFor($item, $unitCode);

        return round($baseQuantity / $factor, 4);
    }

    /** Facteur de conversion vers l'unité de base, pour cet article. */
    public static function factorFor(Item $item, string $unitCode): float
    {
        $code = trim($unitCode);

        $packaging = Packaging::query()
            ->where('item_id', $item->id)
            ->where('code', $code)
            ->first();

        if ($packaging !== null) {
            if ((float) $packaging->factor_to_base <= 0) {
                throw new InvalidArgumentException('Le facteur de conditionnement doit être positif.');
            }

            return (float) $packaging->factor_to_base;
        }

        $unit = Unit::query()->where('code', $code)->first();

        if ($unit === null) {
            throw new InvalidArgumentException(
                "Unité inconnue « {$code} ». Déclarez-la comme unité générale ou comme conditionnement de l'article {$item->code}."
            );
        }

        if ($unit->dimension !== $item->dimension) {
            throw new InvalidArgumentException(sprintf(
                'Unité incompatible : « %s » est une unité de %s alors que l\'article %s se compte en %s.',
                $unit->code,
                $unit->dimension->label(),
                $item->code,
                $item->dimension->label(),
            ));
        }

        if ((float) $unit->factor_to_base <= 0) {
            throw new InvalidArgumentException('Le facteur de conversion doit être positif.');
        }

        return (float) $unit->factor_to_base;
    }

    /** Libellé lisible d'une quantité de base, dans l'unité d'usage de l'article. */
    public static function humanise(Item $item, int $baseQuantity): string
    {
        $code = $item->usage_unit_code ?: $item->dimension->baseUnitCode();

        try {
            $value = self::fromBase($item, $code, $baseQuantity);
        } catch (InvalidArgumentException) {
            return $baseQuantity.' '.$item->dimension->baseUnitCode();
        }

        return rtrim(rtrim(number_format($value, 3, ',', ' '), '0'), ',').' '.$code;
    }
}
