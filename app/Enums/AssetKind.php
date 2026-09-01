<?php

declare(strict_types=1);

namespace App\Enums;

enum AssetKind: string
{
    case Equipment = 'equipment';
    case Infrastructure = 'infrastructure';

    public function label(): string
    {
        return match ($this) {
            self::Equipment => 'Équipement',
            self::Infrastructure => 'Infrastructure',
        };
    }

    /**
     * La distinction n'est pas cosmétique : un équipement se déplace, se
     * remplace et porte souvent un compteur ; une infrastructure est fixe,
     * s'entretient par inspection et se répare sur place.
     */
    public function description(): string
    {
        return match ($this) {
            self::Equipment => 'Pompe, moteur, véhicule, pulvérisateur, balance, outillage.',
            self::Infrastructure => 'Serre, bâtiment, réseau d\'irrigation, clôture, forage, réseau électrique.',
        };
    }
}
