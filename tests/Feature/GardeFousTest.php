<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\AssetStatus;
use App\Enums\AttendanceStatus;
use App\Enums\Dimension;
use App\Enums\MovementDirection;
use App\Enums\Role;
use App\Enums\WorkOrderType;
use App\Models\Asset;
use App\Models\Attendance;
use App\Models\AuditLog;
use App\Models\Item;
use App\Models\Requisition;
use App\Models\Site;
use App\Models\StockMovement;
use App\Models\Unit;
use App\Models\User;
use App\Models\WorkOrder;
use App\Services\AttendanceService;
use App\Services\StockService;
use App\Services\WorkOrderService;
use App\Support\ServerClock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use RuntimeException;
use Tests\TestCase;

/**
 * Ces tests ne vérifient pas que le code « marche ». Ils vérifient que les
 * garde-fous du cahier des charges REFUSENT ce qu'ils doivent refuser.
 *
 * Un test qui échoue ici veut dire qu'une règle du CDC-SI-001 n'est plus
 * appliquée — c'est plus grave qu'une fonctionnalité en panne.
 *
 *   php artisan test --filter=GardeFous
 */
final class GardeFousTest extends TestCase
{
    use RefreshDatabase;

    private Site $site;

    private User $direction;

    private User $superviseur;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->site = Site::query()->create([
            'code' => 'TEST', 'name' => 'Site de test', 'timezone' => 'Africa/Lubumbashi',
        ]);

        $this->direction = User::query()->create([
            'name' => 'Direction', 'email' => 'direction@test.local',
            'password' => Hash::make('secret'), 'role' => Role::Direction,
            'site_id' => $this->site->id, 'employed_from' => '2026-01-01',
        ]);

        $this->superviseur = User::query()->create([
            'name' => 'Superviseur', 'email' => 'sup@test.local',
            'password' => Hash::make('secret'), 'role' => Role::Superviseur,
            'site_id' => $this->site->id, 'manager_id' => $this->direction->id,
            'approval_ceiling_cents' => 20_000, 'daily_rate_cents' => 1_591,
            'employed_from' => '2026-01-01',
        ]);

        $this->agent = User::query()->create([
            'name' => 'Agent', 'email' => 'agent@test.local',
            'password' => Hash::make('secret'), 'role' => Role::Agent,
            'site_id' => $this->site->id, 'manager_id' => $this->superviseur->id,
            'daily_rate_cents' => 385, 'employed_from' => '2026-01-01',
        ]);

        foreach ([['g', 'gramme', Dimension::Mass, 1], ['kg', 'kilogramme', Dimension::Mass, 1000],
            ['ml', 'millilitre', Dimension::Volume, 1], ['l', 'litre', Dimension::Volume, 1000],
            ['u', 'unité', Dimension::Count, 1]] as [$c, $l, $d, $f]) {
            Unit::query()->create(['code' => $c, 'label' => $l, 'dimension' => $d, 'factor_to_base' => $f]);
        }
    }

    private function article(string $code = 'ENG01', Dimension $dim = Dimension::Mass): Item
    {
        return Item::query()->create([
            'code' => $code, 'name' => 'Article '.$code, 'category' => 'Engrais',
            'dimension' => $dim, 'usage_unit_code' => $dim === Dimension::Mass ? 'kg' : 'l',
            'unit_price_cents' => 140, 'alert_threshold_base' => 50_000,
        ]);
    }

    /* ═══════════ P1 — L'horloge appartient au serveur ═══════════ */

    public function test_un_pointage_antidate_est_refuse(): void
    {
        $this->expectException(RuntimeException::class);

        app(AttendanceService::class)->record(
            $this->site, ServerClock::today()->subDays(5), $this->agent,
            AttendanceStatus::Present, 8, $this->superviseur,
        );
    }

    public function test_un_pointage_dans_le_futur_est_refuse(): void
    {
        $this->expectException(RuntimeException::class);

        app(AttendanceService::class)->record(
            $this->site, ServerClock::today()->addDay(), $this->agent,
            AttendanceStatus::Present, 8, $this->superviseur,
        );
    }

    /* ═══════════ P2 — Les registres sont en ajout seul ═══════════ */

    public function test_un_mouvement_de_stock_ne_peut_pas_etre_modifie(): void
    {
        $item = $this->article();
        $mvt = app(StockService::class)->record($item, MovementDirection::In, 'kg', 10, $this->direction);

        $this->expectException(RuntimeException::class);
        $mvt->update(['quantity_base' => 1]);
    }

    public function test_un_mouvement_de_stock_ne_peut_pas_etre_supprime(): void
    {
        $item = $this->article();
        $mvt = app(StockService::class)->record($item, MovementDirection::In, 'kg', 10, $this->direction);

        $this->expectException(RuntimeException::class);
        $mvt->delete();
    }

    public function test_le_journal_d_audit_ne_peut_pas_etre_efface(): void
    {
        $this->article();
        $ligne = AuditLog::query()->latest('id')->first();

        $this->assertNotNull($ligne, 'Aucune ligne d\'audit écrite : le trait Auditable n\'est pas actif.');

        $this->expectException(RuntimeException::class);
        $ligne->delete();
    }

    /* ═══════════ §6.4 — Une unité de base par dimension ═══════════ */

    public function test_une_unite_de_mauvaise_dimension_est_refusee(): void
    {
        $item = $this->article();

        $this->expectException(\InvalidArgumentException::class);
        app(StockService::class)->record($item, MovementDirection::In, 'l', 5, $this->direction);
    }

    public function test_les_conversions_donnent_des_entiers_en_unite_de_base(): void
    {
        $item = $this->article();
        app(StockService::class)->record($item, MovementDirection::In, 'kg', 2.5, $this->direction);

        $this->assertSame(2500, $item->refresh()->balance_base);
    }

    public function test_le_solde_est_la_somme_des_mouvements(): void
    {
        $item = $this->article();
        $svc = app(StockService::class);

        $svc->record($item, MovementDirection::In, 'kg', 10, $this->direction);
        $svc->record($item, MovementDirection::Out, 'kg', 3, $this->direction);

        $item->refresh();
        $this->assertSame($item->recomputeBalance(), $item->balance_base);
        $this->assertSame(7000, $item->balance_base);
    }

    public function test_une_sortie_superieure_au_stock_est_refusee(): void
    {
        $item = $this->article();
        app(StockService::class)->record($item, MovementDirection::In, 'kg', 2, $this->direction);

        $this->expectException(RuntimeException::class);
        app(StockService::class)->record($item, MovementDirection::Out, 'kg', 5, $this->direction);
    }

    public function test_une_correction_est_une_contre_ecriture_pas_une_suppression(): void
    {
        $item = $this->article();
        $svc = app(StockService::class);
        $mvt = $svc->record($item, MovementDirection::In, 'kg', 10, $this->direction);

        $svc->reverse($mvt, $this->direction, 'Erreur de saisie');

        $this->assertSame(0, $item->refresh()->balance_base);
        $this->assertSame(2, StockMovement::query()->count(), 'La contre-écriture doit exister en plus, pas remplacer.');
    }

    /* ═══════════ P8 — Nul n'approuve sa propre demande ═══════════ */

    public function test_nul_n_approuve_sa_propre_demande(): void
    {
        $sienne = new Requisition(['requested_by' => $this->superviseur->id, 'amount_cents' => 1_000]);

        $this->assertFalse(Gate::forUser($this->superviseur)->allows('approve-requisition', $sienne));
    }

    public function test_un_superviseur_approuve_celle_d_un_autre_dans_son_plafond(): void
    {
        $autre = new Requisition(['requested_by' => $this->agent->id, 'amount_cents' => 1_000]);

        $this->assertTrue(Gate::forUser($this->superviseur)->allows('approve-requisition', $autre));
    }

    public function test_au_dela_du_plafond_le_superviseur_ne_peut_plus_approuver(): void
    {
        $grosse = new Requisition(['requested_by' => $this->agent->id, 'amount_cents' => 50_000]);

        $this->assertFalse(Gate::forUser($this->superviseur)->allows('approve-requisition', $grosse));
    }

    public function test_la_demande_remonte_a_la_direction_au_dela_du_plafond(): void
    {
        $this->assertTrue($this->agent->approverFor(50_000)->is($this->direction));
        $this->assertTrue($this->agent->approverFor(1_000)->is($this->superviseur));
    }

    /* ═══════════ §8 — Administration de l'équipe ═══════════ */

    public function test_un_agent_ne_peut_pas_administrer_l_equipe(): void
    {
        $this->assertFalse(Gate::forUser($this->agent)->allows('viewAny', User::class));
        $this->assertTrue(Gate::forUser($this->direction)->allows('viewAny', User::class));
    }

    public function test_personne_ne_modifie_son_propre_plafond(): void
    {
        $this->assertFalse(Gate::forUser($this->direction)->allows('setCeiling', $this->direction));
        $this->assertTrue(Gate::forUser($this->direction)->allows('setCeiling', $this->superviseur));
    }

    public function test_la_derniere_direction_active_ne_peut_pas_etre_desactivee(): void
    {
        $this->assertFalse(Gate::forUser($this->direction)->allows('deactivate', $this->direction));

        User::query()->create([
            'name' => 'Direction 2', 'email' => 'dir2@test.local', 'password' => Hash::make('x'),
            'role' => Role::Direction, 'site_id' => $this->site->id, 'employed_from' => '2026-01-01',
        ]);

        $this->assertTrue(Gate::forUser($this->direction)->allows('deactivate', $this->direction));
    }

    public function test_un_agent_ne_se_supprime_jamais(): void
    {
        $this->assertFalse(Gate::forUser($this->direction)->allows('delete', $this->agent));
    }

    /* ═══════════ Pointage — un fait du site ═══════════ */

    public function test_le_pointage_est_idempotent(): void
    {
        $svc = app(AttendanceService::class);
        $jour = ServerClock::today();

        $svc->record($this->site, $jour, $this->agent, AttendanceStatus::Present, 8, $this->superviseur);
        $svc->record($this->site, $jour, $this->agent, AttendanceStatus::Present, 6, $this->superviseur);

        $this->assertSame(1, Attendance::query()->where('user_id', $this->agent->id)->count());
        $this->assertSame('6.00', Attendance::query()->where('user_id', $this->agent->id)->value('hours'));
    }

    public function test_le_pointage_vaut_pour_tout_le_site(): void
    {
        $svc = app(AttendanceService::class);
        $jour = ServerClock::today();

        $svc->record($this->site, $jour, $this->agent, AttendanceStatus::Present, 8, $this->superviseur);

        $this->assertTrue($svc->presentOn($this->site, $jour)->contains('id', $this->agent->id));
        $this->assertTrue($svc->wasPresent($this->site, $jour, $this->agent));
        $this->assertFalse($svc->wasPresent($this->site, $jour, $this->superviseur));
    }

    public function test_le_cout_de_main_d_oeuvre_suit_les_heures_reelles(): void
    {
        $svc = app(AttendanceService::class);
        $jour = ServerClock::today();

        $svc->record($this->site, $jour, $this->agent, AttendanceStatus::Present, 4, $this->superviseur);

        // 4 h sur 8 au taux de 385 centimes = 192 (arrondi)
        $this->assertSame(193, $svc->labourCostCents($this->site, $jour));
    }

    public function test_un_agent_sorti_ne_peut_plus_etre_pointe(): void
    {
        $this->agent->update(['employed_until' => ServerClock::today()->subDay()->toDateString()]);

        $this->expectException(RuntimeException::class);
        app(AttendanceService::class)->record(
            $this->site, ServerClock::today(), $this->agent, AttendanceStatus::Present, 8, $this->superviseur,
        );
    }

    public function test_les_agents_non_pointes_sont_identifies(): void
    {
        $svc = app(AttendanceService::class);
        $jour = ServerClock::today();

        $svc->record($this->site, $jour, $this->agent, AttendanceStatus::Present, 8, $this->superviseur);

        $this->assertTrue($svc->missingOn($this->site, $jour)->contains('id', $this->superviseur->id));
        $this->assertFalse($svc->missingOn($this->site, $jour)->contains('id', $this->agent->id));
    }

    /* ═══════════ Maintenance et bons de travail ═══════════ */

    private function bien(): Asset
    {
        return Asset::query()->create([
            'code' => 'POMPE-01', 'name' => 'Pompe de test', 'kind' => 'equipment',
            'site_id' => $this->site->id, 'criticality' => 'vital',
        ]);
    }

    public function test_un_bon_recoit_une_reference_unique_et_une_echeance(): void
    {
        $svc = app(WorkOrderService::class);
        $bien = $this->bien();

        $a = $svc->open($bien, WorkOrderType::Corrective, 'Panne A', $this->agent);
        $b = $svc->open($bien, WorkOrderType::Corrective, 'Panne B', $this->agent);

        $this->assertNotSame($a->reference, $b->reference);
        $this->assertStringStartsWith('BT-', $a->reference);
        // Criticité vitale : 4 heures d'intervention
        $this->assertSame(4, (int) $a->reported_at->diffInHours($a->due_at));
    }

    public function test_un_bon_ouvert_vaut_preuve_de_panne(): void
    {
        $bien = $this->bien();
        $this->assertFalse($bien->hasOpenWorkOrder());

        app(WorkOrderService::class)->open($bien, WorkOrderType::Corrective, 'Ne démarre plus', $this->agent, null, true);

        $this->assertTrue($bien->refresh()->hasOpenWorkOrder());
        $this->assertSame(AssetStatus::Down, $bien->status);
    }

    public function test_une_piece_sort_reellement_du_stock(): void
    {
        $svc = app(WorkOrderService::class);
        $item = $this->article('PCE01');
        app(StockService::class)->record($item, MovementDirection::In, 'kg', 5, $this->direction);

        $wo = $svc->open($this->bien(), WorkOrderType::Corrective, 'Réparation', $this->agent);
        $svc->addPart($wo, $item, 'kg', 2, $this->direction);

        $this->assertSame(3000, $item->refresh()->balance_base);
        $this->assertSame(1, $wo->refresh()->parts()->count());
        $this->assertNotNull($wo->parts()->first()->stock_movement_id, 'La pièce doit être adossée à un mouvement réel.');
    }

    public function test_une_cloture_sans_resolution_est_refusee(): void
    {
        $svc = app(WorkOrderService::class);
        $wo = $svc->open($this->bien(), WorkOrderType::Corrective, 'Panne', $this->agent);

        $this->expectException(RuntimeException::class);
        $svc->complete($wo, $this->direction, '   ');
    }

    public function test_un_bon_clos_n_accepte_plus_d_ecriture(): void
    {
        $svc = app(WorkOrderService::class);
        $wo = $svc->open($this->bien(), WorkOrderType::Corrective, 'Panne', $this->agent);
        $svc->complete($wo, $this->direction, 'Roulement remplacé.');

        $this->expectException(RuntimeException::class);
        $svc->addLabour($wo->refresh(), 2, $this->agent);
    }

    public function test_nul_ne_clot_un_bon_au_dela_de_son_plafond(): void
    {
        $svc = app(WorkOrderService::class);
        $wo = $svc->open($this->bien(), WorkOrderType::Corrective, 'Grosse panne', $this->agent);
        $wo->update(['cost_external_cents' => 100_000]); // 1 000 USD

        $this->assertFalse(Gate::forUser($this->superviseur)->allows('complete', $wo->refresh()));
        $this->assertTrue(Gate::forUser($this->direction)->allows('complete', $wo));
    }

    public function test_la_vie_du_bon_est_tracee(): void
    {
        $svc = app(WorkOrderService::class);
        $wo = $svc->open($this->bien(), WorkOrderType::Corrective, 'Panne', $this->agent);
        $svc->start($wo, $this->direction);
        $svc->complete($wo->refresh(), $this->direction, 'Réparé.');

        $evenements = $wo->refresh()->events->pluck('event')->all();

        $this->assertContains('ouverture', $evenements);
        $this->assertContains('demarrage', $evenements);
        $this->assertContains('cloture', $evenements);
    }

    public function test_signaler_une_panne_est_ouvert_a_tous(): void
    {
        $this->assertTrue(Gate::forUser($this->agent)->allows('create', WorkOrder::class));
        $this->assertFalse(Gate::forUser($this->agent)->allows('addPart', $this->bienBon()));
    }

    private function bienBon(): WorkOrder
    {
        return app(WorkOrderService::class)->open($this->bien(), WorkOrderType::Corrective, 'X', $this->agent);
    }

    public function test_un_bon_ne_se_supprime_jamais(): void
    {
        $this->assertFalse(Gate::forUser($this->direction)->allows('delete', $this->bienBon()));
    }

    public function test_le_taux_du_pointage_est_fige(): void
    {
        $svc = app(AttendanceService::class);
        $svc->record($this->site, ServerClock::today(), $this->agent, AttendanceStatus::Present, 8);
        $this->agent->update(['daily_rate_cents' => 1000]);
        $attendance = $svc->record($this->site, ServerClock::today(), $this->agent, AttendanceStatus::Present, 4);
        $this->assertSame(385, $attendance->daily_rate_cents);
        $this->assertSame(193, $attendance->cost_cents);
    }

    public function test_un_mouvement_ne_peut_pas_etre_contre_passe_deux_fois(): void
    {
        $svc = app(StockService::class);
        $movement = $svc->record($this->article(), MovementDirection::In, 'kg', 10);
        $svc->reverse($movement, $this->direction, 'Erreur');
        $this->expectException(RuntimeException::class);
        $svc->reverse($movement, $this->direction, 'Encore');
    }

    public function test_le_cout_des_pieces_respecte_l_unite_du_prix(): void
    {
        $item = $this->article();
        app(StockService::class)->record($item, MovementDirection::In, 'kg', 10);
        $svc = app(WorkOrderService::class);
        $wo = $svc->open($this->bien(), WorkOrderType::Corrective, 'Réparation', $this->agent);
        $part = $svc->addPart($wo, $item, 'g', 500, $this->direction);
        $this->assertSame(70, $part->cost_cents);
    }

    public function test_les_modifications_de_l_equipe_sont_auditees_sans_secrets(): void
    {
        $this->agent->update(['daily_rate_cents' => 450, 'password' => 'nouveau-mot-de-passe']);
        $audit = AuditLog::where('auditable_type', User::class)->where('auditable_id', $this->agent->id)->latest('id')->firstOrFail();
        $this->assertSame(450, $audit->after['daily_rate_cents']);
        $this->assertArrayNotHasKey('password', $audit->after);
        $this->assertArrayNotHasKey('password', $audit->before);
    }
}
