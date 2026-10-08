<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\AttendanceStatus;
use App\Enums\WorkOrderType;
use App\Models\Asset;
use App\Models\Attendance;
use App\Models\Item;
use App\Models\MaintenancePlan;
use App\Models\Requisition;
use App\Models\Site;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkOrder;
use App\Services\AttendanceService;
use App\Services\WorkOrderService;
use App\Support\ServerClock;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

final class PilotageController extends Controller
{
    public function index(): Response
    {
        $today = ServerClock::today();
        $site = Site::query()->first();
        $staff = User::query()->whereNull('employed_until')->orderBy('name')->get(['id', 'name', 'job_title', 'daily_rate_cents']);
        $attendance = $site === null
            ? collect()
            : Attendance::query()->where('site_id', $site->id)->whereDate('work_date', $today)->with('user:id,name')->get();

        $openWorkOrders = WorkOrder::query()->open()->with('asset:id,code,name')->orderBy('due_at')->limit(6)->get();
        $recentTasks = Task::query()->with('zone:id,name')->orderByDesc('due_at')->limit(5)->get();

        return Inertia::render('pilotage', [
            'today' => $today->translatedFormat('l j F Y'),
            'site' => $site?->only(['id', 'code', 'name', 'address']),
            'metrics' => [
                'staff_total' => $staff->count(),
                'staff_present' => $attendance->where('status', AttendanceStatus::Present)->count(),
                'staff_missing' => max(0, $staff->count() - $attendance->count()),
                'tasks_open' => Task::query()->whereIn('status', Task::OPEN_STATUSES)->count(),
                'tasks_overdue' => Task::query()->whereIn('status', Task::OPEN_STATUSES)->where('due_at', '<', ServerClock::now())->count(),
                'work_orders_open' => WorkOrder::query()->open()->count(),
                'work_orders_overdue' => WorkOrder::query()->overdue()->count(),
                'stock_alerts' => Item::query()->where('is_active', true)->whereColumn('balance_base', '<=', 'alert_threshold_base')->count(),
                'requisitions_pending' => Requisition::query()->whereIn('status', ['pending', 'approved'])->count(),
                'assets_down' => Asset::query()->where('status', 'down')->count(),
            ],
            'attendance' => $attendance->map(fn (Attendance $entry): array => [
                'id' => $entry->id,
                'user_id' => $entry->user_id,
                'name' => $entry->user->name,
                'status' => $entry->status->value,
                'status_label' => $entry->status->label(),
                'hours' => (float) $entry->hours,
            ])->values(),
            'staff' => $staff,
            'assets' => Asset::query()->orderBy('name')->get(['id', 'code', 'name', 'status', 'criticality']),
            'work_orders' => $openWorkOrders->map(fn (WorkOrder $order): array => [
                'id' => $order->id,
                'reference' => $order->reference,
                'title' => $order->title,
                'asset' => $order->asset->name,
                'status' => $order->status->value,
                'status_label' => $order->status->label(),
                'criticality' => $order->criticality->value,
                'due_at' => $order->due_at?->diffForHumans(),
                'overdue' => $order->isOverdue(),
            ]),
            'tasks' => $recentTasks->map(fn (Task $task): array => [
                'id' => $task->id,
                'reference' => $task->reference,
                'title' => $task->title,
                'zone' => $task->zone?->name,
                'status' => $task->status,
                'priority' => $task->priority,
                'due_at' => $task->due_at->diffForHumans(),
            ]),
            'maintenance_due' => MaintenancePlan::query()->where('is_active', true)->whereDate('next_due_on', '<=', $today)->count(),
            'attendance_statuses' => collect(AttendanceStatus::cases())->map(fn (AttendanceStatus $status): array => ['value' => $status->value, 'label' => $status->label()]),
        ]);
    }

    public function storeAttendance(Request $request, AttendanceService $service): RedirectResponse
    {
        $this->validateSiteCode($request);
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'status' => ['required', 'string'],
            'hours' => ['required', 'numeric', 'min:0', 'max:24'],
        ]);
        $site = Site::query()->firstOrFail();
        $agent = User::query()->findOrFail((int) $data['user_id']);
        $service->record($site, ServerClock::today(), $agent, AttendanceStatus::from($data['status']), (float) $data['hours'], $request->user());

        return back()->with('toast', ['type' => 'success', 'message' => "Pointage de {$agent->name} enregistré."]);
    }

    public function storeIncident(Request $request, WorkOrderService $service): RedirectResponse
    {
        $this->validateSiteCode($request);
        $data = $request->validate([
            'asset_id' => ['required', 'integer', 'exists:assets,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:3000'],
            'reported_by' => ['nullable', 'integer', 'exists:users,id'],
            'asset_stopped' => ['boolean'],
        ]);
        $asset = Asset::query()->findOrFail((int) $data['asset_id']);
        $reporter = isset($data['reported_by']) ? User::query()->find((int) $data['reported_by']) : $request->user();
        $order = $service->open($asset, WorkOrderType::Corrective, $data['title'], $reporter, $data['description'] ?? null, (bool) ($data['asset_stopped'] ?? false));

        return back()->with('toast', ['type' => 'success', 'message' => "Incident enregistré sous {$order->reference}."]);
    }

    private function validateSiteCode(Request $request): void
    {
        $request->validate(['site_code' => ['required', 'string']]);
        if (! hash_equals((string) config('dtomate.site_access_code'), (string) $request->string('site_code'))) {
            abort(403, 'Code site invalide.');
        }
    }
}
