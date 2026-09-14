<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\AssetStatus;
use App\Enums\MaintenanceTrigger;
use App\Enums\MovementDirection;
use App\Enums\WorkOrderStatus;
use App\Enums\WorkOrderType;
use App\Models\Asset;
use App\Models\Item;
use App\Models\MaintenancePlan;
use App\Models\Sequence;
use App\Models\User;
use App\Models\WorkOrder;
use App\Models\WorkOrderEvent;
use App\Models\WorkOrderLabour;
use App\Models\WorkOrderPart;
use App\Support\ServerClock;
use App\Support\UnitConverter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use RuntimeException;

final class WorkOrderService
{
    public function __construct(private readonly StockService $stock) {}

    /**
     * Ouvre un bon de travail. La date d'échéance découle de la criticité du
     * bien, pas d'un choix de l'utilisateur : c'est ce qui rend l'escalade
     * mesurable.
     */
    public function open(
        Asset $asset,
        WorkOrderType $type,
        string $title,
        ?User $reportedBy = null,
        ?string $description = null,
        bool $assetStopped = false,
        ?User $assignee = null,
        ?MaintenancePlan $plan = null,
    ): WorkOrder {
        return DB::transaction(function () use ($asset, $type, $title, $reportedBy, $description, $assetStopped, $assignee, $plan): WorkOrder {
            $now = ServerClock::now();

            $wo = WorkOrder::query()->create([
                'reference' => $this->nextReference(),
                'asset_id' => $asset->id,
                'type' => $type,
                'status' => $assignee !== null ? WorkOrderStatus::Assigned : WorkOrderStatus::Raised,
                'criticality' => $asset->criticality,
                'title' => $title,
                'description' => $description,
                'reported_by' => $reportedBy?->id,
                'reported_at' => $now,
                'assigned_to' => $assignee?->id,
                'due_at' => $now->addHours($asset->criticality->responseHours()),
                'asset_stopped' => $assetStopped,
                'cost_centre_id' => $asset->cost_centre_id,
                'maintenance_plan_id' => $plan?->id,
            ]);

            if ($assetStopped && $asset->status !== AssetStatus::Down) {
                $asset->update(['status' => AssetStatus::Down]);
            }

            $this->trace($wo, 'ouverture', null, $wo->status, $reportedBy, $title);

            return $wo;
        });
    }

    /**
     * Numérotation BT-AAAA-NNNN, séquentielle par année, non réutilisable.
     * Le compteur est une ligne verrouillée seule : deux ouvertures simultanées
     * ne peuvent pas obtenir le même numéro, et un bon annulé ne libère pas sa
     * référence.
     */
    private function nextReference(): string
    {
        return sprintf('BT-%d-%04d', ServerClock::now()->year, Sequence::next('work_order'));
    }

    /** Journal lisible de la vie du bon, en ajout seul. */
    private function trace(WorkOrder $wo, string $event, ?WorkOrderStatus $avant, ?WorkOrderStatus $apres, ?User $par = null, ?string $note = null): void
    {
        WorkOrderEvent::query()->create([
            'work_order_id' => $wo->id,
            'event' => $event,
            'from_status' => $avant?->value,
            'to_status' => $apres?->value,
            'note' => $note,
            'user_id' => $par?->id,
            'occurred_at' => ServerClock::now(),
        ]);
    }

    public function assign(WorkOrder $wo, User $to, User $by): WorkOrder
    {
        $this->assertOpen($wo);
        Gate::forUser($by)->authorize('update', $wo);
        if (! $to->isActive()) {
            throw new RuntimeException('Le bon ne peut pas être assigné à un membre sorti de l’effectif.');
        }
        $avant = $wo->status;
        $wo->update(['assigned_to' => $to->id, 'status' => WorkOrderStatus::Assigned]);
        $this->trace($wo, 'assignation', $avant, WorkOrderStatus::Assigned, $by, 'Assigné à '.$to->name);

        return $wo;
    }

    public function start(WorkOrder $wo, User $by): WorkOrder
    {
        $this->assertOpen($wo);
        Gate::forUser($by)->authorize('transition', $wo);
        $avant = $wo->status;
        $wo->update([
            'status' => WorkOrderStatus::InProgress,
            'started_at' => $wo->started_at ?? ServerClock::now(),
        ]);
        $this->trace($wo, 'demarrage', $avant, WorkOrderStatus::InProgress, $by);

        return $wo;
    }

    public function awaitParts(WorkOrder $wo, string $note, User $by): WorkOrder
    {
        $this->assertOpen($wo);
        Gate::forUser($by)->authorize('transition', $wo);
        if (trim($note) === '') {
            throw new RuntimeException('Précisez la pièce attendue ou la raison du blocage.');
        }
        $avant = $wo->status;
        $wo->update([
            'status' => WorkOrderStatus::AwaitingParts,
            'resolution' => trim(($wo->resolution ?? '')."\nEn attente : ".$note),
        ]);
        $this->trace($wo, 'attente_piece', $avant, WorkOrderStatus::AwaitingParts, $by, $note);

        return $wo;
    }

    /**
     * Consomme une pièce. La pièce SORT du magasin : le mouvement de stock est
     * écrit dans la même transaction et la ligne y est adossée. Une pièce
     * simplement déclarée serait un trou dans l'inventaire.
     */
    public function addPart(WorkOrder $wo, Item $item, string $unitCode, float $quantity, ?User $by = null): WorkOrderPart
    {
        $this->assertOpen($wo);
        if ($by !== null) {
            Gate::forUser($by)->authorize('addPart', $wo);
        }

        return DB::transaction(function () use ($wo, $item, $unitCode, $quantity, $by): WorkOrderPart {
            $mouvement = $this->stock->record($item, MovementDirection::Out, $unitCode, $quantity, $by, [
                'reason' => 'Bon de travail '.$wo->reference,
                'note' => $wo->title,
                'zone_id' => $wo->asset->zone_id,
                'cost_centre_id' => $wo->cost_centre_id,
                'source_type' => WorkOrder::class,
                'source_id' => $wo->id,
            ]);

            $pricedQuantity = UnitConverter::fromBase($item, $item->price_unit_code ?? $item->usage_unit_code, (int) $mouvement->quantity_base);
            $cout = (int) round($pricedQuantity * $item->unit_price_cents);

            $ligne = WorkOrderPart::query()->create([
                'work_order_id' => $wo->id,
                'item_id' => $item->id,
                'quantity_entered' => $quantity,
                'unit_code_entered' => $unitCode,
                'quantity_base' => $mouvement->quantity_base,
                'cost_cents' => $cout,
                'stock_movement_id' => $mouvement->id,
            ]);

            $wo->increment('cost_parts_cents', $cout);

            return $ligne;
        });
    }

    public function addLabour(WorkOrder $wo, float $hours, ?User $worker = null, ?string $workerName = null): WorkOrderLabour
    {
        $this->assertOpen($wo);
        if ($hours <= 0 || $hours > 24) {
            throw new RuntimeException('Le temps de travail doit être compris entre 0 et 24 heures.');
        }
        if ($worker !== null && ! app(AttendanceService::class)->wasPresent($wo->asset->site, ServerClock::today(), $worker)) {
            throw new RuntimeException('Main-d’œuvre refusée : cet agent n’est pas pointé présent aujourd’hui.');
        }

        $taux = (int) ($worker?->daily_rate_cents ?? 0);
        $cout = (int) round(($hours / 8) * $taux);

        $ligne = WorkOrderLabour::query()->create([
            'work_order_id' => $wo->id,
            'user_id' => $worker?->id,
            'worker_name' => $workerName ?? $worker?->name,
            'hours' => $hours,
            'rate_cents' => $taux,
            'cost_cents' => $cout,
            'work_date' => ServerClock::today()->toDateString(),
        ]);

        $wo->increment('cost_labour_cents', $cout);

        return $ligne;
    }

    /**
     * Clôture. Exige une résolution écrite : un bon fermé sans description de
     * ce qui a été fait ne vaut rien, ni pour l'historique du bien ni comme
     * preuve.
     */
    public function complete(
        WorkOrder $wo,
        User $by,
        string $resolution,
        AssetStatus $assetStatus = AssetStatus::InService,
        ?string $failureCause = null,
        int $externalCostCents = 0,
        ?string $providerName = null,
    ): WorkOrder {
        $this->assertOpen($wo);

        if ($externalCostCents < 0) {
            throw new RuntimeException('Le coût externe ne peut pas être négatif.');
        }

        $wo->cost_external_cents = $externalCostCents;

        Gate::forUser($by)->authorize('complete', $wo);

        if (trim($resolution) === '') {
            throw new RuntimeException('La résolution est obligatoire : décrivez ce qui a été fait.');
        }

        return DB::transaction(function () use ($wo, $by, $resolution, $assetStatus, $failureCause, $externalCostCents, $providerName): WorkOrder {
            $now = ServerClock::now();
            $avant = $wo->status;

            $arret = 0;

            if ($wo->asset_stopped) {
                $depart = $wo->started_at ?? $wo->reported_at;
                $arret = max(0, (int) $depart->diffInMinutes($now));
            }

            $wo->update([
                'status' => WorkOrderStatus::Done,
                'completed_at' => $now,
                'completed_by' => $by->id,
                'resolution' => $resolution,
                'failure_cause' => $failureCause,
                'downtime_minutes' => $arret,
                'cost_external_cents' => $externalCostCents,
                'external_provider' => $providerName !== null && trim($providerName) !== '',
                'provider_name' => $providerName,
            ]);

            $wo->asset->update(['status' => $assetStatus]);

            if ($wo->plan !== null) {
                $this->reschedulePlan($wo->plan);
            }

            $this->trace($wo, 'cloture', $avant, WorkOrderStatus::Done, $by, $resolution);

            return $wo->refresh();
        });
    }

    public function cancel(WorkOrder $wo, User $by, string $reason): WorkOrder
    {
        $this->assertOpen($wo);
        Gate::forUser($by)->authorize('update', $wo);
        if (trim($reason) === '') {
            throw new RuntimeException('Le motif d’annulation est obligatoire.');
        }
        $avant = $wo->status;
        $wo->update([
            'status' => WorkOrderStatus::Cancelled,
            'resolution' => 'Annulé par '.$by->name.' : '.$reason,
        ]);
        $this->trace($wo, 'annulation', $avant, WorkOrderStatus::Cancelled, $by, $reason);

        return $wo;
    }

    /** Repositionne l'échéance du plan après exécution. */
    public function reschedulePlan(MaintenancePlan $plan): void
    {
        $aujourdhui = ServerClock::today();

        if ($plan->trigger_type === MaintenanceTrigger::Calendar) {
            $plan->update([
                'last_done_on' => $aujourdhui->toDateString(),
                'next_due_on' => $aujourdhui->addDays((int) $plan->interval_days)->toDateString(),
            ]);

            return;
        }

        $compteur = (float) $plan->asset->meter_current;

        $plan->update([
            'last_done_on' => $aujourdhui->toDateString(),
            'last_done_meter' => $compteur,
            'next_due_meter' => $compteur + (float) $plan->interval_meter,
        ]);
    }

    private function assertOpen(WorkOrder $wo): void
    {
        if (! $wo->status->isOpen()) {
            throw new RuntimeException(sprintf(
                'Le bon %s est %s : il n\'accepte plus d\'écriture. Ouvrez un nouveau bon.',
                $wo->reference,
                mb_strtolower($wo->status->label()),
            ));
        }
    }
}
