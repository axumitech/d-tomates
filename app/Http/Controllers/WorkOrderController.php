<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\AssetStatus;
use App\Enums\WorkOrderStatus;
use App\Enums\WorkOrderType;
use App\Models\Asset;
use App\Models\Item;
use App\Models\Unit;
use App\Models\User;
use App\Models\WorkOrder;
use App\Services\WorkOrderService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

final class WorkOrderController extends Controller
{
    public function index(): Response
    {
        $orders = WorkOrder::query()
            ->with(['asset:id,code,name,status', 'assignedTo:id,name', 'reportedBy:id,name', 'events.user:id,name', 'parts.item:id,code,name', 'labour'])
            ->orderByRaw("CASE WHEN status IN ('done', 'cancelled') THEN 1 ELSE 0 END")
            ->orderBy('due_at')
            ->limit(100)
            ->get();

        $staff = User::query()->orderBy('name')->get()->filter->isActive()->values();
        $units = Unit::query()->orderBy('code')->get(['code', 'label', 'dimension']);

        return Inertia::render('maintenance', [
            'summary' => [
                'open' => WorkOrder::query()->open()->count(),
                'overdue' => WorkOrder::query()->overdue()->count(),
                'awaiting_parts' => WorkOrder::query()->where('status', WorkOrderStatus::AwaitingParts)->count(),
                'done' => WorkOrder::query()->where('status', WorkOrderStatus::Done)->count(),
            ],
            'orders' => $orders->map(fn (WorkOrder $order): array => [
                'id' => $order->id,
                'reference' => $order->reference,
                'title' => $order->title,
                'description' => $order->description,
                'type' => $order->type->value,
                'type_label' => $order->type->label(),
                'status' => $order->status->value,
                'status_label' => $order->status->label(),
                'criticality' => $order->criticality->value,
                'asset' => ['id' => $order->asset->id, 'code' => $order->asset->code, 'name' => $order->asset->name, 'status' => $order->asset->status->value],
                'assigned_to' => $order->assignedTo?->only(['id', 'name']),
                'reported_by' => $order->reportedBy?->only(['id', 'name']),
                'reported_at' => $order->reported_at->format('d/m/Y H:i'),
                'due_at' => $order->due_at?->format('d/m/Y H:i'),
                'started_at' => $order->started_at?->format('d/m/Y H:i'),
                'completed_at' => $order->completed_at?->format('d/m/Y H:i'),
                'overdue' => $order->isOverdue(),
                'asset_stopped' => $order->asset_stopped,
                'resolution' => $order->resolution,
                'cost_parts_cents' => $order->cost_parts_cents,
                'cost_labour_cents' => $order->cost_labour_cents,
                'cost_external_cents' => $order->cost_external_cents,
                'total_cost_cents' => $order->totalCostCents(),
                'events' => $order->events->map(fn ($event): array => [
                    'id' => $event->id,
                    'event' => $event->event,
                    'from_status' => $event->from_status,
                    'to_status' => $event->to_status,
                    'note' => $event->note,
                    'user' => $event->user?->name ?? 'Système',
                    'occurred_at' => $event->occurred_at->format('d/m/Y H:i'),
                ]),
                'parts' => $order->parts->map(fn ($part): array => [
                    'id' => $part->id,
                    'item' => $part->item->name,
                    'quantity' => (float) $part->quantity_entered,
                    'unit' => $part->unit_code_entered,
                    'cost_cents' => $part->cost_cents,
                ]),
                'labour' => $order->labour->map(fn ($line): array => [
                    'id' => $line->id,
                    'name' => $line->worker_name,
                    'hours' => (float) $line->hours,
                    'cost_cents' => $line->cost_cents,
                ]),
            ]),
            'assets' => Asset::query()->where('status', '!=', AssetStatus::Retired)->orderBy('name')->get(['id', 'code', 'name', 'criticality', 'status']),
            'staff' => $staff->map(fn (User $user): array => ['id' => $user->id, 'name' => $user->name, 'role' => $user->role->value, 'role_label' => $user->role->label()]),
            'items' => Item::query()->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name', 'dimension', 'usage_unit_code', 'balance_base']),
            'units' => $units,
            'asset_statuses' => collect(AssetStatus::cases())->map(fn (AssetStatus $status): array => ['value' => $status->value, 'label' => $status->label()]),
        ]);
    }

    public function store(Request $request, WorkOrderService $service): RedirectResponse
    {
        $this->validateSiteCode($request);
        $data = $request->validate([
            'asset_id' => ['required', 'integer', 'exists:assets,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:3000'],
            'reported_by' => ['required', 'integer', 'exists:users,id'],
            'asset_stopped' => ['boolean'],
        ]);

        return $this->perform(function () use ($data, $service): string {
            $order = $service->open(
                Asset::query()->findOrFail((int) $data['asset_id']),
                WorkOrderType::Corrective,
                (string) $data['title'],
                User::query()->findOrFail((int) $data['reported_by']),
                $data['description'] ?? null,
                (bool) ($data['asset_stopped'] ?? false),
            );

            return "Le bon {$order->reference} a été ouvert.";
        });
    }

    public function assign(Request $request, WorkOrder $workOrder, WorkOrderService $service): RedirectResponse
    {
        $data = $this->validatedActor($request, ['assigned_to' => ['required', 'integer', 'exists:users,id']]);

        return $this->perform(function () use ($data, $workOrder, $service): string {
            $assignee = User::query()->findOrFail((int) $data['assigned_to']);
            $service->assign($workOrder, $assignee, $this->actor($data));

            return "{$workOrder->reference} a été assigné à {$assignee->name}.";
        });
    }

    public function start(Request $request, WorkOrder $workOrder, WorkOrderService $service): RedirectResponse
    {
        $data = $this->validatedActor($request);

        return $this->perform(fn (): string => tap($service->start($workOrder, $this->actor($data)), fn () => null)->reference.' est maintenant en cours.');
    }

    public function awaitParts(Request $request, WorkOrder $workOrder, WorkOrderService $service): RedirectResponse
    {
        $data = $this->validatedActor($request, ['note' => ['required', 'string', 'max:1000']]);

        return $this->perform(fn (): string => tap($service->awaitParts($workOrder, (string) $data['note'], $this->actor($data)), fn () => null)->reference.' est en attente de pièce.');
    }

    public function addPart(Request $request, WorkOrder $workOrder, WorkOrderService $service): RedirectResponse
    {
        $data = $this->validatedActor($request, [
            'item_id' => ['required', 'integer', 'exists:items,id'],
            'unit_code' => ['required', 'string', 'exists:units,code'],
            'quantity' => ['required', 'numeric', 'gt:0'],
        ]);

        return $this->perform(function () use ($data, $workOrder, $service): string {
            $service->addPart($workOrder, Item::query()->findOrFail((int) $data['item_id']), (string) $data['unit_code'], (float) $data['quantity'], $this->actor($data));

            return 'La pièce a été sortie du stock et ajoutée au bon.';
        });
    }

    public function addLabour(Request $request, WorkOrder $workOrder, WorkOrderService $service): RedirectResponse
    {
        $data = $this->validatedActor($request, ['worker_id' => ['required', 'integer', 'exists:users,id'], 'hours' => ['required', 'numeric', 'gt:0', 'max:24']]);

        return $this->perform(function () use ($data, $workOrder, $service): string {
            $worker = User::query()->findOrFail((int) $data['worker_id']);
            $service->addLabour($workOrder, (float) $data['hours'], $worker);

            return "Le temps de {$worker->name} a été ajouté au bon.";
        });
    }

    public function complete(Request $request, WorkOrder $workOrder, WorkOrderService $service): RedirectResponse
    {
        $data = $this->validatedActor($request, [
            'resolution' => ['required', 'string', 'max:3000'],
            'asset_status' => ['required', Rule::enum(AssetStatus::class)],
            'failure_cause' => ['nullable', 'string', 'max:255'],
            'external_cost' => ['nullable', 'numeric', 'min:0'],
            'provider_name' => ['nullable', 'string', 'max:255'],
        ]);

        return $this->perform(function () use ($data, $workOrder, $service): string {
            $service->complete($workOrder, $this->actor($data), (string) $data['resolution'], AssetStatus::from((string) $data['asset_status']), $data['failure_cause'] ?? null, (int) round(((float) ($data['external_cost'] ?? 0)) * 100), $data['provider_name'] ?? null);

            return "{$workOrder->reference} a été clôturé avec sa résolution.";
        });
    }

    public function cancel(Request $request, WorkOrder $workOrder, WorkOrderService $service): RedirectResponse
    {
        $data = $this->validatedActor($request, ['reason' => ['required', 'string', 'max:1000']]);

        return $this->perform(fn (): string => tap($service->cancel($workOrder, $this->actor($data), (string) $data['reason']), fn () => null)->reference.' a été annulé.');
    }

    /** @param array<string, mixed> $rules @return array<string, mixed> */
    private function validatedActor(Request $request, array $rules = []): array
    {
        $this->validateSiteCode($request);

        return $request->validate(['actor_id' => ['required', 'integer', 'exists:users,id'], ...$rules]);
    }

    /** @param array<string, mixed> $data */
    private function actor(array $data): User
    {
        return User::query()->findOrFail((int) $data['actor_id']);
    }

    /** @param callable(): string $operation */
    private function perform(callable $operation): RedirectResponse
    {
        try {
            return back()->with('toast', ['type' => 'success', 'message' => $operation()]);
        } catch (RuntimeException|AuthorizationException $exception) {
            return back()->withErrors(['operation' => $exception->getMessage()]);
        }
    }

    private function validateSiteCode(Request $request): void
    {
        $request->validate(['site_code' => ['required', 'string']]);
        if (! hash_equals((string) config('dtomate.site_access_code'), (string) $request->string('site_code'))) {
            abort(403, 'Code site invalide.');
        }
    }
}
