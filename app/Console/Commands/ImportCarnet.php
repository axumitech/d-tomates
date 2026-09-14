<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\Dimension;
use App\Enums\MovementDirection;
use App\Models\Item;
use App\Models\LegacyDay;
use App\Models\LegacyRecord;
use App\Models\Site;
use App\Models\User;
use App\Models\Zone;
use App\Services\StockService;
use App\Support\ServerClock;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Reprise du carnet de ferme v5.3 — CDC-SI-001 §11.
 *
 * php artisan carnet:import storage/app/DTomate_SAUVEGARDE_v5.3_2026-08-25.json \
 *     --site=NTETEMA --user=1 [--dry-run] [--force]
 *
 * Le fichier attendu est la sauvegarde intégrale JSON produite par
 * « Registres → Données et sauvegarde → Sauvegarder tout le carnet ».
 *
 * Principes de reprise :
 *   · Le stock est repris comme UN MOUVEMENT d'inventaire initial daté et
 *     motivé, jamais comme une valeur de colonne.
 *   · Les journées ne sont pas rejouées en tâches : leur horodatage venait
 *     du téléphone et leurs lignes étaient supprimables.
 *   · Tout le reste est conservé intégralement dans legacy_records, pour
 *     être repris module par module aux lots suivants.
 *   · Rejouable : le même fichier importé deux fois ne duplique rien.
 */
final class ImportCarnet extends Command
{
    protected $signature = 'carnet:import
        {file : Chemin du fichier de sauvegarde JSON}
        {--site=NTETEMA : Code du site de rattachement}
        {--user= : Identifiant de l\'utilisateur au nom duquel la reprise est écrite}
        {--dry-run : Analyse le fichier et affiche le rapport sans rien écrire}
        {--force : Compatibilité ; les écritures déjà reprises restent ignorées}';

    protected $description = 'Reprend les données du carnet de ferme v5.3 dans le nouveau système';

    /** @var array<string,int> */
    private array $compteurs = [
        'cles' => 0, 'articles' => 0, 'articles_existants' => 0, 'mouvements_initiaux' => 0,
        'zones' => 0, 'journees' => 0, 'enregistrements' => 0, 'ignorees' => 0,
    ];

    /** @var array<int,string> */
    private array $avertissements = [];

    public function handle(StockService $stock): int
    {
        $this->compteurs = array_fill_keys(array_keys($this->compteurs), 0);
        $this->avertissements = [];
        $chemin = (string) $this->argument('file');

        if (! is_readable($chemin)) {
            $this->error("Fichier introuvable ou illisible : {$chemin}");

            return self::FAILURE;
        }

        $brut = (string) file_get_contents($chemin);
        $somme = hash('sha256', $brut);

        /** @var array<string,mixed>|null $paquet */
        $paquet = json_decode($brut, true);

        if (! is_array($paquet) || ($paquet['format'] ?? null) !== config('dtomate.legacy.expected_format')) {
            $this->error("Ce fichier n'est pas une sauvegarde du Carnet de ferme D'Tomate.");

            return self::FAILURE;
        }

        if (DB::table('legacy_imports')->where('checksum', $somme)->exists()) {
            $this->warn('Ce fichier a déjà été importé : aucune écriture supplémentaire.');

            return self::SUCCESS;
        }

        $donnees = $paquet['donnees'] ?? [];

        if (! is_array($donnees) || $donnees === []) {
            $this->error('La sauvegarde ne contient aucune donnée.');

            return self::FAILURE;
        }

        $this->compteurs['cles'] = count($donnees);
        $version = (string) ($paquet['version'] ?? '?');

        $this->info("Carnet v{$version} — ".$this->compteurs['cles'].' clé(s) à traiter.');

        $site = Site::query()->where('code', $this->option('site'))->first();

        if ($site === null) {
            $this->error("Site « {$this->option('site')} » inconnu. Lancez d'abord php artisan db:seed --class=SocleSeeder");

            return self::FAILURE;
        }

        $auteur = $this->option('user') !== null
            ? User::query()->find((int) $this->option('user'))
            : User::query()->where('role', 'direction')->first();

        if ($auteur === null || ! $auteur->isActive() || $auteur->site_id !== $site->id) {
            $this->error('Un auteur actif appartenant au site est requis. Précisez --user.');

            return self::FAILURE;
        }

        if ($this->option('dry-run')) {
            DB::beginTransaction();
            try {
                $this->importerArticles($donnees, $stock, $auteur);
                $this->importerCultures($donnees, $site);
                $this->importerJournees($donnees, $site);
                $this->importerReste($donnees);
            } catch (Throwable $e) {
                $this->error('Analyse interrompue : '.$e->getMessage());

                return self::FAILURE;
            } finally {
                DB::rollBack();
            }
            $this->rapport();
            $this->warn('Mode --dry-run : rien n\'a été écrit.');

            return self::SUCCESS;
        }

        try {
            DB::transaction(function () use ($donnees, $site, $auteur, $stock, $somme, $chemin, $version): void {
                $this->importerArticles($donnees, $stock, $auteur);
                $this->importerCultures($donnees, $site);
                $this->importerJournees($donnees, $site);
                $this->importerReste($donnees);

                DB::table('legacy_imports')->insert([
                    'filename' => basename($chemin),
                    'carnet_version' => $version,
                    'checksum' => $somme,
                    'keys_total' => $this->compteurs['cles'],
                    'items_created' => $this->compteurs['articles'],
                    'zones_created' => $this->compteurs['zones'],
                    'days_imported' => $this->compteurs['journees'],
                    'records_imported' => $this->compteurs['enregistrements'],
                    'report' => json_encode([
                        'compteurs' => $this->compteurs,
                        'avertissements' => $this->avertissements,
                    ], JSON_UNESCAPED_UNICODE),
                    'imported_by' => $auteur->id,
                    'created_at' => ServerClock::now(),
                ]);
            });
        } catch (Throwable $e) {
            $this->error('Reprise interrompue, rien n\'a été écrit : '.$e->getMessage());

            return self::FAILURE;
        }

        $this->rapport();
        $this->info('Reprise terminée.');

        return self::SUCCESS;
    }

    /** @param array<string,string> $donnees */
    private function importerArticles(array $donnees, StockService $stock, ?User $auteur): void
    {
        $articles = $this->lire($donnees, 'dt:stock:articles');

        if (! is_array($articles)) {
            $this->avertissements[] = 'Aucun catalogue d\'articles dans la sauvegarde.';

            return;
        }

        foreach ($articles as $a) {
            if (! is_array($a) || empty($a['id'])) {
                throw new \RuntimeException('Article sans identifiant ou mal formé.');
            }

            $uniteCarnet = (string) ($a['unite'] ?? 'u');
            $dimension = Dimension::guessFromLegacyUnit($uniteCarnet);
            $codeUnite = $this->codeUnite($uniteCarnet, $dimension);
            if ($codeUnite === 'u') {
                $dimension = Dimension::Count;
            }
            $aRevoir = $codeUnite === 'u' && ! in_array(mb_strtolower($uniteCarnet), ['u', 'unité', 'unite'], true);

            $existant = Item::query()->where('legacy_id', $a['id'])->first();

            if ($existant !== null) {
                $this->compteurs['articles_existants']++;

                continue;
            }

            $facteur = $this->facteurVersBase($codeUnite, $dimension);

            $item = Item::query()->where('code', (string) $a['id'])->lockForUpdate()->first();
            if ($item !== null && ($item->movements()->exists() || (int) $item->balance_base !== 0)) {
                throw new \RuntimeException('Article '.$item->code.' déjà utilisé : rapprochement du stock requis avant la reprise.');
            }
            $item ??= new Item;
            $item->fill([
                'code' => (string) $a['id'],
                'legacy_id' => (string) $a['id'],
                'name' => (string) ($a['nom'] ?? $a['id']),
                'category' => (string) ($a['cat'] ?? 'Divers'),
                'dimension' => $dimension,
                'purchase_unit_code' => $codeUnite,
                'usage_unit_code' => $codeUnite,
                'price_unit_code' => $codeUnite,
                'alert_threshold_base' => (int) round(((float) ($a['seuil'] ?? 0)) * $facteur),
                'unit_price_cents' => (int) round(((float) ($a['prix'] ?? 0)) * 100),
                'frac_irac_code' => $this->extraireFrac((string) ($a['nom'] ?? '')),
                'needs_unit_review' => $aRevoir,
                'balance_base' => 0,
            ]);

            $item->save();
            $this->compteurs['articles']++;

            if ($aRevoir) {
                $this->avertissements[] = sprintf(
                    'Article %s : l\'unité « %s » du carnet n\'a pas de facteur fiable. Traité en dénombrement, à trancher avant usage.',
                    $item->code,
                    $uniteCarnet,
                );
            }

            $quantite = (float) ($a['stock'] ?? 0);
            if (! is_numeric($a['stock'] ?? 0) || ! is_finite($quantite) || $quantite < 0) {
                throw new \RuntimeException('Stock invalide pour '.$item->code);
            }

            if ($quantite > 0) {
                $stock->record($item, MovementDirection::In, $codeUnite, $quantite, $auteur, [
                    'reason' => config('dtomate.legacy.initial_stock_reason'),
                    'note' => 'Inventaire initial repris du carnet de ferme v5.3.',
                ]);

                $this->compteurs['mouvements_initiaux']++;
            }
        }
    }

    /** @param array<string,string> $donnees */
    private function importerCultures(array $donnees, Site $site): void
    {
        $cultures = $this->lire($donnees, 'dt:reg:cultures');

        if (! is_array($cultures)) {
            return;
        }

        foreach ($cultures as $zoneCarnet => $culture) {
            $zone = Zone::query()->where('site_id', $site->id)->where('legacy_key', $zoneCarnet)->first();

            if ($zone === null) {
                $this->avertissements[] = "Zone « {$zoneCarnet} » absente du référentiel : culture conservée sans rattachement.";
            }

            if (is_array($culture) && ($culture['aConfirmer'] ?? false)) {
                $this->avertissements[] = sprintf(
                    'Zone %s : date de départ PRÉSUMÉE (%s). À confirmer avant la mise en production — tout le calendrier en dépend.',
                    $zoneCarnet,
                    (string) ($culture['debut'] ?? '?'),
                );
            }

            if (LegacyRecord::query()->where('source_key', 'dt:reg:cultures#'.$zoneCarnet)->exists()) {
                continue;
            }
            LegacyRecord::query()->create([
                'kind' => 'cultures',
                'source_key' => 'dt:reg:cultures#'.$zoneCarnet,
                'occurred_on' => is_array($culture) ? ($culture['debut'] ?? null) : null,
                'payload' => ['zone_carnet' => $zoneCarnet, 'zone_id' => $zone?->id, 'culture' => $culture],
                'imported_at' => ServerClock::now(),
            ]);

            $this->compteurs['enregistrements']++;
        }
    }

    /** @param array<string,string> $donnees */
    private function importerJournees(array $donnees, Site $site): void
    {
        foreach ($donnees as $cle => $valeur) {
            if (! preg_match('/^dt:(TOM|BAN|AVI|LIV):(\d{4}-\d{2}-\d{2})$/', (string) $cle, $m)) {
                continue;
            }

            if (LegacyDay::query()->where('source_key', $cle)->exists()) {
                continue;
            }

            LegacyDay::query()->create([
                'site_id' => $site->id,
                'section' => $m[1],
                'work_date' => $m[2],
                'source_key' => (string) $cle,
                'payload' => $this->decoder($valeur),
                'imported_at' => ServerClock::now(),
            ]);

            $this->compteurs['journees']++;
        }
    }

    /** @param array<string,string> $donnees */
    private function importerReste(array $donnees): void
    {
        $familles = [
            'dt:lots' => 'lots',
            'dt:regimes' => 'regimes',
            'dt:demandes' => 'demandes',
            'dt:mesures' => 'mesures',
            'dt:journal' => 'journal',
            'dt:stock:mouvements' => 'mouvements',
            'dt:reg:cumul' => 'cumuls',
            'dt:reg:archives' => 'cycles_clotures',
            'dt:reg:taches' => 'taches_faites',
            'dt:reg:dar' => 'delais_avant_recolte',
            'dt:reg:cendres' => 'epandages_cendres',
            'dt:reg:traitzone' => 'traitements_par_zone',
            'dt:meta' => 'meta',
        ];

        foreach ($donnees as $cle => $valeur) {
            $cle = (string) $cle;

            if (preg_match('/^dt:(TOM|BAN|AVI|LIV):/', $cle) || $cle === 'dt:stock:articles' || $cle === 'dt:reg:cultures') {
                continue;
            }

            if (str_starts_with($cle, 'dt:photo:')) {
                $this->compteurs['ignorees']++;

                continue;
            }

            if (str_starts_with($cle, 'dt:acces:')) {
                $this->avertissements[] = "Clé d'accès « {$cle} » non reprise : les codes du carnet n'ont aucune valeur d'authentification.";
                $this->compteurs['ignorees']++;

                continue;
            }

            $genre = $familles[$cle] ?? null;

            if ($genre === null) {
                foreach ($familles as $prefixe => $nom) {
                    if (str_starts_with($cle, $prefixe.':arch:')) {
                        $genre = $nom.'_archive';
                        break;
                    }
                }
            }

            if (LegacyRecord::query()->where('source_key', $cle)->exists()) {
                continue;
            }

            LegacyRecord::query()->create([
                'kind' => $genre ?? 'inconnu',
                'source_key' => $cle,
                'occurred_on' => null,
                'payload' => ['contenu' => $this->decoder($valeur)],
                'imported_at' => ServerClock::now(),
            ]);

            $this->compteurs['enregistrements']++;
        }
    }

    private function rapport(): void
    {
        $this->newLine();
        $this->table(['Élément', 'Nombre'], [
            ['Clés lues',                       $this->compteurs['cles']],
            ['Articles créés',                  $this->compteurs['articles']],
            ['Articles déjà connus',            $this->compteurs['articles_existants']],
            ['Mouvements d\'inventaire initial', $this->compteurs['mouvements_initiaux']],
            ['Journées reprises',               $this->compteurs['journees']],
            ['Enregistrements conservés',       $this->compteurs['enregistrements']],
            ['Clés ignorées',                   $this->compteurs['ignorees']],
        ]);

        if ($this->avertissements !== []) {
            $this->newLine();
            $this->warn('Points à trancher :');

            foreach ($this->avertissements as $a) {
                $this->line('  · '.$a);
            }
        }
    }

    /** @param array<string,string> $donnees */
    private function lire(array $donnees, string $cle): mixed
    {
        return isset($donnees[$cle]) ? $this->decoder($donnees[$cle]) : null;
    }

    private function decoder(mixed $valeur): mixed
    {
        if (! is_string($valeur)) {
            return $valeur;
        }

        $decode = json_decode($valeur, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \RuntimeException('Valeur JSON invalide dans la sauvegarde.');
        }

        return $decode;
    }

    private function codeUnite(string $uniteCarnet, Dimension $dimension): string
    {
        return match (mb_strtolower(trim($uniteCarnet))) {
            'kg' => 'kg',
            'g' => 'g',
            't', 'tonne' => 't',
            'l', 'litre', 'litres' => 'l',
            'ml' => 'ml',
            default => 'u',
        };
    }

    private function facteurVersBase(string $codeUnite, Dimension $dimension): float
    {
        return match ($codeUnite) {
            'kg' => 1000.0,
            'l' => 1000.0,
            't' => 1000000.0,
            default => 1.0,
        };
    }

    private function extraireFrac(string $nom): ?string
    {
        return preg_match('/\((FRAC|IRAC)\s+([A-Z0-9+]+)\)/u', $nom, $m) === 1
            ? $m[1].' '.$m[2]
            : null;
    }
}
