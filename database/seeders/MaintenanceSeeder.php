<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\AssetKind;
use App\Enums\Criticality;
use App\Enums\MaintenanceTrigger;
use App\Models\Asset;
use App\Models\CostCentre;
use App\Models\MaintenancePlan;
use App\Models\Site;
use App\Models\Zone;
use App\Support\ServerClock;
use Illuminate\Database\Seeder;

/**
 * Parc matériel de départ, tiré des documents d'exploitation : plan
 * d'irrigation, calendrier d'actions tomate, plan d'ombrière.
 *
 * Les valeurs de compteur et les dates de mise en service sont à confirmer
 * par la Direction : elles ne figurent dans aucun document du dossier.
 */
final class MaintenanceSeeder extends Seeder
{
    public function run(): void
    {
        $site = Site::query()->where('code', 'NTETEMA')->firstOrFail();
        $zone = fn (string $code): ?int => Zone::query()
            ->where('site_id', $site->id)->where('code', $code)->value('id');
        $cc = fn (string $code): ?int => CostCentre::query()->where('code', $code)->value('id');

        $biens = [
            // code, nom, nature, catégorie, zone, centre, criticité, compteur
            ['POMPE-01', 'Pompe de forage principale', AssetKind::Equipment, 'Pompe', 'TEC-POM', 'CC-GEN', Criticality::Vital, 'h'],
            ['MAZZEI-01', 'Injecteur Mazzei — fertigation', AssetKind::Equipment, 'Irrigation', 'TEC-FER', 'CC-SER', Criticality::Vital, null],
            ['CUVE-A', 'Cuve de fertigation A', AssetKind::Infrastructure, 'Irrigation', 'TEC-FER', 'CC-SER', Criticality::Important, null],
            ['CUVE-B', 'Cuve de fertigation B', AssetKind::Infrastructure, 'Irrigation', 'TEC-FER', 'CC-SER', Criticality::Important, null],
            ['RES-SER', 'Réseau goutte-à-goutte — serre', AssetKind::Infrastructure, 'Irrigation', 'SER-M1', 'CC-SER', Criticality::Vital, null],
            ['RES-BAN', 'Réseau goutte-à-goutte — bananeraie', AssetKind::Infrastructure, 'Irrigation', 'BAN-P1', 'CC-BAN', Criticality::Vital, null],
            ['SERRE-01', 'Structure de serre — 5 modules', AssetKind::Infrastructure, 'Serre', 'SER-M1', 'CC-SER', Criticality::Vital, null],
            ['OMBR-01', 'Ombrière rétractable', AssetKind::Infrastructure, 'Serre', 'SER-M1', 'CC-SER', Criticality::Important, null],
            ['PULV-01', 'Pulvérisateur à dos 15 L', AssetKind::Equipment, 'Pulvérisation', null, 'CC-GEN', Criticality::Important, null],
            ['BAL-01', 'Balance de conditionnement', AssetKind::Equipment, 'Pesage', 'MAG-CND', 'CC-MAG', Criticality::Important, null],
            ['AVI-B1-EQ', 'Abreuvoirs et mangeoires — Poulailler 1', AssetKind::Equipment, 'Élevage', 'AVI-B1', 'CC-AVI', Criticality::Vital, null],
            ['AVI-B1-BAT', 'Bâtiment Poulailler 1', AssetKind::Infrastructure, 'Bâtiment', 'AVI-B1', 'CC-AVI', Criticality::Vital, null],
            ['MAG-BAT', 'Bâtiment magasin', AssetKind::Infrastructure, 'Bâtiment', 'MAG-01', 'CC-MAG', Criticality::Important, null],
        ];

        foreach ($biens as [$code, $nom, $nature, $cat, $zcode, $ccode, $crit, $compteur]) {
            Asset::query()->updateOrCreate(
                ['code' => $code],
                [
                    'name' => $nom,
                    'kind' => $nature,
                    'category' => $cat,
                    'site_id' => $site->id,
                    'zone_id' => $zcode !== null ? $zone($zcode) : null,
                    'cost_centre_id' => $cc($ccode),
                    'criticality' => $crit,
                    'meter_unit' => $compteur,
                ],
            );
        }

        $demain = ServerClock::today()->addDay()->toDateString();

        $plans = [
            ['MAZZEI-01', 'Rinçage acide de l\'injecteur', MaintenanceTrigger::Calendar, 28, null,
                'Acide phosphorique à 0,5 %. Faire circuler 20 minutes, puis rincer à l\'eau claire 30 minutes. Débouche les goutteurs avant qu\'ils ne se bouchent.'],
            ['RES-SER', 'Contrôle des goutteurs — serre', MaintenanceTrigger::Calendar, 7, null,
                'Parcourir chaque ligne. Repérer les goutteurs bouchés et les fuites. Vérifier la pression en bout de ligne : elle doit rester entre 1,2 et 1,8 bar.'],
            ['RES-BAN', 'Contrôle du goutte-à-goutte — bananeraie', MaintenanceTrigger::Calendar, 15, null,
                'Parcourir les rangs, vérifier les deux lignes par rang, repérer les tuyaux enterrés ou percés.'],
            ['POMPE-01', 'Vidange et graissage de la pompe', MaintenanceTrigger::Meter, null, 250,
                'Vidange d\'huile, graissage des roulements, contrôle du presse-étoupe. Relever le compteur avant et après.'],
            ['POMPE-01', 'Contrôle mensuel de la pompe', MaintenanceTrigger::Calendar, 30, null,
                'Contrôle du débit en sortie, de l\'échauffement et des vibrations. Noter le débit mesuré : une baisse annonce l\'usure de la turbine.'],
            ['OMBR-01', 'Contrôle des câbles et de l\'enroulement', MaintenanceTrigger::Calendar, 90, null,
                'Vérifier la tension des câbles, l\'état des poulies et le libre déploiement sur toute la longueur.'],
            ['PULV-01', 'Entretien du pulvérisateur', MaintenanceTrigger::Calendar, 30, null,
                'Nettoyage des buses et du filtre, contrôle des joints, essai de débit à l\'eau claire. Un pulvérisateur mal réglé fausse toutes les doses.'],
            ['BAL-01', 'Vérification de la balance', MaintenanceTrigger::Calendar, 90, null,
                'Contrôle avec une masse étalon connue. Une balance qui dérive fausse les bons de livraison et les rendements.'],
            ['AVI-B1-EQ', 'Nettoyage et désinfection des abreuvoirs', MaintenanceTrigger::Calendar, 7, null,
                'Démontage, brossage, désinfection. Une chute de consommation d\'eau précède de 24 h tout problème sanitaire.'],
            ['AVI-B1-BAT', 'Vide sanitaire du bâtiment', MaintenanceTrigger::Calendar, 120, null,
                'Après enlèvement : sortie de la litière, lavage, désinfection, puis 14 jours de vide sanitaire minimum.'],
            ['SERRE-01', 'Contrôle de la structure et du film', MaintenanceTrigger::Calendar, 90, null,
                'Fixations, déchirures du film, portes et ouvrants, filet anti-insectes. À faire avant la saison des pluies.'],
            ['MAG-BAT', 'Contrôle du magasin', MaintenanceTrigger::Calendar, 90, null,
                'Étanchéité de la toiture, aération, rangement des produits phytosanitaires sous clé, état de l\'extincteur.'],
        ];

        foreach ($plans as [$codeBien, $nom, $declencheur, $jours, $compteur, $consignes]) {
            $bien = Asset::query()->where('code', $codeBien)->first();

            if ($bien === null) {
                continue;
            }

            MaintenancePlan::query()->updateOrCreate(
                ['asset_id' => $bien->id, 'name' => $nom],
                [
                    'trigger_type' => $declencheur,
                    'interval_days' => $jours,
                    'interval_meter' => $compteur,
                    'instructions' => $consignes,
                    'next_due_on' => $declencheur === MaintenanceTrigger::Calendar ? $demain : null,
                    'next_due_meter' => $declencheur === MaintenanceTrigger::Meter ? $compteur : null,
                    'estimated_minutes' => 60,
                ],
            );
        }
    }
}
