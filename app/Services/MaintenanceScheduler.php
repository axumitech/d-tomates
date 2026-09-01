<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\WorkOrderStatus;
use App\Enums\WorkOrderType;
use App\Models\MaintenancePlan;
use App\Models\WorkOrder;
use Illuminate\Support\Collection;

/**
 * Le plan d'entretien émet des bons de travail. Il ne se contente pas
 * d'afficher une échéance : il crée une obligation datée et assignée, que
 * quelqu'un devra clore ou justifier (CDC-SI-001 §4, principes P4 et P5).
 */
final class MaintenanceScheduler
{
    public function __construct(private readonly WorkOrderService $workOrders) {}

    /** @return Collection<int,MaintenancePlan> */
    public function duePlans(): Collection
    {
        return MaintenancePlan::query()
            ->where('is_active', true)
            ->with('asset')
            ->get()
            ->filter(fn (MaintenancePlan $p): bool => $p->isDue())
            ->values();
    }

    /**
     * Émet un bon par plan échu, en évitant les doublons : si un bon issu du
     * même plan est déjà ouvert, on n'en crée pas un second.
     *
     * @return array{emis:int,ignores:int,references:array<int,string>}
     */
    public function emit(): array
    {
        $emis = 0;
        $ignores = 0;
        $refs = [];

        foreach ($this->duePlans() as $plan) {
            $dejaOuvert = WorkOrder::query()
                ->where('maintenance_plan_id', $plan->id)
                ->whereNotIn('status', [WorkOrderStatus::Done->value, WorkOrderStatus::Cancelled->value])
                ->exists();

            if ($dejaOuvert) {
                $ignores++;

                continue;
            }

            $wo = $this->workOrders->open(
                asset: $plan->asset,
                type: WorkOrderType::Preventive,
                title: $plan->name,
                reportedBy: null,
                description: $plan->instructions,
                assetStopped: false,
                assignee: $plan->defaultAssignee,
                plan: $plan,
            );

            $emis++;
            $refs[] = $wo->reference;
        }

        return ['emis' => $emis, 'ignores' => $ignores, 'references' => $refs];
    }
}
