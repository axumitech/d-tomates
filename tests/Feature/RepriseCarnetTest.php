<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\MovementDirection;
use App\Models\Item;
use App\Models\LegacyDay;
use App\Models\LegacyRecord;
use App\Models\StockMovement;
use App\Services\StockService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * La reprise du carnet v5.x est le moment où l'on peut perdre l'historique
 * d'une exploitation. Ces tests vérifient qu'on ne le perd pas.
 *
 *   php artisan test --filter=RepriseCarnet
 */
final class RepriseCarnetTest extends TestCase
{
    use RefreshDatabase;

    private string $fichier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(DatabaseSeeder::class);

        $donnees = [
            'dt:stock:articles' => json_encode([
                ['id' => 'ENG01', 'nom' => 'Nitrate de calcium', 'cat' => 'Engrais',
                    'unite' => 'kg', 'seuil' => 50, 'prix' => 1.4, 'stock' => 37, 'peremption' => ''],
                ['id' => 'ALI05', 'nom' => 'Aliment PONTE', 'cat' => 'Aliment',
                    'unite' => 'sac', 'seuil' => 20, 'prix' => 32, 'stock' => 6, 'peremption' => ''],
            ]),
            'dt:reg:cultures' => json_encode([
                'Module 1' => ['type' => 'Tomate Trinity F1', 'debut' => '2026-03-30',
                    'effectif' => '1800', 'aConfirmer' => false],
                'Parc 1' => ['type' => 'Banane Williams AAA', 'debut' => '2025-08-25',
                    'effectif' => '', 'aConfirmer' => true],
            ]),
            'dt:TOM:2026-08-20' => json_encode(['meteo' => 'Sec', 'recoltes' => [['zone' => 'Module 1', 'kg' => 95]]]),
            'dt:TOM:2026-08-21' => json_encode(['meteo' => 'Pluie']),
            'dt:journal' => json_encode([['t' => '2026-08-21 07:12', 'action' => 'Connexion']]),
            'dt:photo:IMG-1' => 'data:image/jpeg;base64,AAAA',
            'dt:acces:codes' => json_encode(['Superviseur' => '4821']),
        ];

        $this->fichier = storage_path('app/test-carnet.json');
        File::ensureDirectoryExists(dirname($this->fichier));
        File::put($this->fichier, json_encode([
            'format' => 'CARNET-DTOMATE', 'schema' => 3, 'version' => '5.6',
            'exporteLe' => '2026-09-11 19:00', 'exportePar' => 'Direction',
            'donnees' => $donnees,
        ]));
    }

    protected function tearDown(): void
    {
        File::delete($this->fichier);
        parent::tearDown();
    }

    public function test_le_stock_entre_comme_mouvement_pas_comme_colonne(): void
    {
        $this->artisan('carnet:import', ['file' => $this->fichier, '--site' => 'NTETEMA'])
            ->assertSuccessful();

        $item = Item::query()->where('legacy_id', 'ENG01')->firstOrFail();

        $this->assertSame(37_000, $item->balance_base, '37 kg doivent devenir 37 000 g.');
        $this->assertSame(1, $item->movements()->count(), 'Le stock doit venir d\'un mouvement daté et motivé.');
        $this->assertStringContainsString('reprise', mb_strtolower((string) $item->movements()->first()->reason));
    }

    public function test_les_seuils_et_prix_sont_convertis(): void
    {
        $this->artisan('carnet:import', ['file' => $this->fichier, '--site' => 'NTETEMA']);

        $item = Item::query()->where('legacy_id', 'ENG01')->firstOrFail();

        $this->assertSame(50_000, $item->alert_threshold_base);
        $this->assertSame(140, $item->unit_price_cents);
    }

    public function test_une_unite_non_fiable_est_signalee(): void
    {
        $this->artisan('carnet:import', ['file' => $this->fichier, '--site' => 'NTETEMA']);

        $sac = Item::query()->where('legacy_id', 'ALI05')->firstOrFail();

        $this->assertTrue($sac->needs_unit_review,
            'Un « sac » sans poids connu doit être marqué à trancher, pas converti au hasard.');
    }

    public function test_les_journees_sont_reprises_en_lecture_seule(): void
    {
        $this->artisan('carnet:import', ['file' => $this->fichier, '--site' => 'NTETEMA']);

        $this->assertSame(2, LegacyDay::query()->count());

        $jour = LegacyDay::query()->whereDate('work_date', '2026-08-20')->firstOrFail();
        $this->assertSame('Sec', $jour->payload['meteo']);

        $this->expectException(\RuntimeException::class);
        $jour->update(['section' => 'BAN']);
    }

    public function test_les_dates_presumees_sont_signalees(): void
    {
        $this->artisan('carnet:import', ['file' => $this->fichier, '--site' => 'NTETEMA'])
            ->expectsOutputToContain('PRÉSUMÉE');
    }

    public function test_les_codes_d_acces_ne_sont_pas_repris(): void
    {
        $this->artisan('carnet:import', ['file' => $this->fichier, '--site' => 'NTETEMA']);

        $this->assertSame(0, LegacyRecord::query()->where('source_key', 'dt:acces:codes')->count(),
            'Les codes du carnet ne sont pas une authentification : ils ne doivent pas être importés.');
    }

    public function test_l_import_est_rejouable_sans_doublon(): void
    {
        $this->artisan('carnet:import', ['file' => $this->fichier, '--site' => 'NTETEMA']);
        $this->artisan('carnet:import', ['file' => $this->fichier, '--site' => 'NTETEMA', '--force' => true]);

        $this->assertSame(1, Item::query()->where('legacy_id', 'ENG01')->count());
        $this->assertSame(2, LegacyDay::query()->count());
        $this->assertSame(2, StockMovement::query()->count(), 'Le stock initial ne doit pas être compté deux fois.');
    }

    public function test_le_mode_analyse_n_ecrit_rien(): void
    {
        $this->artisan('carnet:import', ['file' => $this->fichier, '--site' => 'NTETEMA', '--dry-run' => true])
            ->assertSuccessful();

        $this->assertSame(0, LegacyDay::query()->count());
        $this->assertSame(0, Item::query()->where('legacy_id', 'ENG01')->count());
    }

    public function test_un_fichier_etranger_est_refuse(): void
    {
        $autre = storage_path('app/test-autre.json');
        File::put($autre, json_encode(['format' => 'AUTRE-CHOSE', 'donnees' => []]));

        $this->artisan('carnet:import', ['file' => $autre, '--site' => 'NTETEMA'])
            ->assertFailed();

        File::delete($autre);
    }

    public function test_une_nouvelle_sauvegarde_ne_duplique_aucun_registre(): void
    {
        $this->artisan('carnet:import', ['file' => $this->fichier])->assertSuccessful();
        $counts = [LegacyRecord::count(), LegacyDay::count(), StockMovement::count()];
        $data = json_decode(File::get($this->fichier), true);
        $data['exporteLe'] = '2026-09-14 12:00';
        File::put($this->fichier, json_encode($data));
        $this->artisan('carnet:import', ['file' => $this->fichier])->assertSuccessful();
        $this->assertSame($counts, [LegacyRecord::count(), LegacyDay::count(), StockMovement::count()]);
    }

    public function test_analyse_detecte_un_stock_invalide_et_annule_tout(): void
    {
        $data = json_decode(File::get($this->fichier), true);
        $items = json_decode($data['donnees']['dt:stock:articles'], true);
        $items[1]['stock'] = -2;
        $data['donnees']['dt:stock:articles'] = json_encode($items);
        File::put($this->fichier, json_encode($data));
        foreach ([true, false] as $dryRun) {
            $this->artisan('carnet:import', ['file' => $this->fichier, '--dry-run' => $dryRun])->assertFailed();
            $this->assertSame(0, StockMovement::count());
            $this->assertSame(0, Item::whereNotNull('legacy_id')->count());
        }
    }

    public function test_un_catalogue_actif_ne_peut_pas_recevoir_un_second_stock_initial(): void
    {
        $item = Item::where('code', 'ENG01')->firstOrFail();
        app(StockService::class)->record($item, MovementDirection::In, 'kg', 10);
        $this->artisan('carnet:import', ['file' => $this->fichier])->assertFailed();
        $this->assertSame(10000, $item->refresh()->balance_base);
        $this->assertNull($item->legacy_id);
    }

    public function test_les_registres_historiques_refusent_aussi_les_modifications_sql(): void
    {
        $this->artisan('carnet:import', ['file' => $this->fichier])->assertSuccessful();
        $this->expectException(QueryException::class);
        DB::table('legacy_records')->delete();
    }
}
