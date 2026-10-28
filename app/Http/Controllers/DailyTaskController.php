<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\Role;
use App\Jobs\SendTaskAssignment;
use App\Models\CarnetRecord;
use App\Models\Task;
use App\Models\TaskEvent;
use App\Models\TaskTemplate;
use App\Models\User;
use App\Models\Zone;
use App\Services\DailyTaskReport;
use App\Services\DailyTaskScheduler;
use App\Services\DayClosureService;
use App\Services\TaskPhotoStorage;
use App\Services\TaskReviewService;
use App\Services\TaskService;
use App\Services\TaskTemplateRegistry;
use App\Support\ServerClock;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

final class DailyTaskController extends Controller
{
    public function index(Request $request, DailyTaskReport $report): Response
    {
        $user = $request->user();
        abort_unless($user->isActive() && $user->site_id !== null, 403);
        $request->validate(['date' => ['nullable', 'date_format:Y-m-d']]);
        $date = CarbonImmutable::parse($request->query('date', ServerClock::today()->toDateString()), config('dtomate.timezone'));
        $manager = in_array($user->role, [Role::Direction, Role::Superviseur], true);
        $query = Task::query()->with(['zone', 'assignee', 'events', 'reviewer'])->where('site_id', $user->site_id)->where('origin', 'crop_registry')
            ->whereDate('work_date', '<=', $date)
            ->where(fn ($q) => $q->whereDate('work_date', $date)->orWhereIn('status', Task::OPEN_STATUSES)->orWhereBetween('closed_at', [$date->startOfDay()->utc(), $date->endOfDay()->utc()]));
        if (! $manager) {
            $query->where('assigned_to', $user->id);
        } elseif ($user->role === Role::Superviseur) {
            $query->where(fn ($q) => $q->where('assigned_to', $user->id)->when($user->department_id !== null, fn ($q) => $q->orWhere('department_id', $user->department_id)));
        }
        $tasks = $query->orderBy('work_date')->orderBy('zone_id')->get();
        $notifications = $user->notifications()->latest()->limit(20)->get()->map(fn ($notification): array => ['id' => $notification->id, 'data' => $notification->data, 'read_at' => $notification->read_at]);

        return Inertia::render('taches', [
            'date' => $date->toDateString(), 'userId' => $user->id, 'canManage' => $manager, 'canEditRegistry' => $user->role === Role::Direction,
            'tasks' => $tasks->map(fn (Task $task): array => [
                'id' => $task->id, 'reference' => $task->reference, 'title' => $task->title, 'instructions' => $task->instructions,
                'zone' => $task->zone?->name, 'crop_type' => $task->crop_type, 'assigned_to' => $task->assigned_to, 'assignee' => $task->assignee?->name,
                'can_review' => $task->status === Task::PENDING_REVIEW && app(TaskReviewService::class)->canReview($user, $task),
                'review_note' => $task->review_note, 'reviewer' => $task->reviewer?->name,
                'reviewed_at' => $task->reviewed_at?->setTimezone((string) config('dtomate.timezone'))->format('d/m/Y H:i'),
                'submitted_at' => $task->submitted_at?->setTimezone((string) config('dtomate.timezone'))->format('d/m/Y H:i'),
                'status' => $task->status, 'work_date' => ($task->work_date ?? $task->due_at)->toDateString(), 'due_at' => $task->deadlineAtSite()->format('d/m/Y H:i'),
                'overdue' => $task->isOutstanding() && $task->due_at->isBefore(ServerClock::now()),
                'completion_note' => $task->completion_note, 'justification' => $task->justification, 'reason' => $task->non_completion_reason,
                'photos' => array_map(fn ($path, $index): string => route('tasks.photo', [$task, $index]), $task->evidence['photos'] ?? $task->non_completion_evidence['photos'] ?? [], array_keys($task->evidence['photos'] ?? $task->non_completion_evidence['photos'] ?? [])),
                'events' => $task->events->map(fn ($event): array => ['event' => $event->event, 'payload' => $event->payload, 'at' => $event->created_at->setTimezone((string) config('dtomate.timezone'))->format('d/m/Y H:i'), 'photos' => array_map(fn ($path, $index): string => route('tasks.event-photo', [$task, $event, $index]), $event->payload['evidence']['photos'] ?? [], array_keys($event->payload['evidence']['photos'] ?? []))]),
            ]),
            'staff' => $manager ? User::query()->where('site_id', $user->site_id)->orderBy('name')->get()->filter(fn (User $agent): bool => $agent->isActive())->map(fn (User $agent): array => ['id' => $agent->id, 'name' => $agent->name])->values() : [],
            'zones' => $manager ? Zone::query()->where('site_id', $user->site_id)->when($user->role === Role::Superviseur, fn ($q) => $q->where('department_id', $user->department_id))->get(['id', 'name', 'task_responsible_id']) : [],
            'templates' => $user->role === Role::Direction ? TaskTemplate::query()->orderBy('crop_type')->orderBy('id')->get() : [],
            'reasons' => Task::REASONS, 'notifications' => $notifications,
            'report' => $user->role === Role::Direction ? $report->snapshot($date, $user->site_id) : null,
            'timezone' => config('dtomate.timezone'), 'deadline' => config('dtomate.tasks.deadline'),
            'reportDelivery' => $user->role === Role::Direction ? DB::table('task_report_deliveries')->where('user_id', $user->id)->whereDate('work_date', $date)->first(['sent_at', 'created_at', 'snapshot']) : null,
            'lastGenerated' => DB::table('task_generation_days')->max('work_date'),
        ]);
    }

    public function carnet(): Response
    {
        return Inertia::render('carnet', ['taskTemplates' => TaskTemplate::query()->get()]);
    }

    public function summary(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->isActive(), 403);
        $request->validate(['date' => ['required', 'date_format:Y-m-d']]);
        $date = CarbonImmutable::parse($request->input('date'), config('dtomate.timezone'));
        $query = Task::query()->with(['zone', 'assignee', 'template'])->where('site_id', $user->site_id)->where('origin', 'crop_registry')->whereDate('work_date', '<=', $date);
        if ($user->role !== Role::Direction) {
            $query->where(fn ($q) => $q->where('assigned_to', $user->id)->when($user->role === Role::Superviseur && $user->department_id !== null, fn ($q) => $q->orWhere('department_id', $user->department_id)));
        }
        $tasks = $query->where(fn ($q) => $q->whereDate('work_date', $date)->orWhereIn('status', Task::OPEN_STATUSES)->orWhereBetween('closed_at', [$date->startOfDay()->utc(), $date->endOfDay()->utc()]))->get();

        $record = CarnetRecord::query()->where('storage_key', 'dt:reg:cultures')->first();
        $cultures = $record === null ? [] : json_decode($record->value, true, 512, JSON_THROW_ON_ERROR);
        $lastExecutions = [];
        foreach (Task::query()->with(['zone', 'template'])->where('site_id', $user->site_id)->where('origin', 'crop_registry')->where('status', Task::DONE)->where('closed_at', '<=', $date->endOfDay()->utc())->orderBy('submitted_at')->get() as $completed) {
            $name = $completed->zone->legacy_key ?? $completed->zone->name ?? '';
            if ($completed->template !== null && ($cultures[$name]['debut'] ?? null) === $completed->cycle_started_on?->toDateString() && ($cultures[$name]['type'] ?? null) === $completed->crop_type) {
                $lastExecutions[$name.'|'.$completed->template->task_key] = ($completed->submitted_at ?? $completed->closed_at)?->setTimezone((string) config('dtomate.timezone'))->toDateString();
            }
        }

        return response()->json(['lastExecutions' => $lastExecutions, 'tasks' => $tasks->map(fn (Task $task): array => [
            'id' => $task->id, 'zone' => $task->zone->legacy_key ?? $task->zone?->name, 'nom' => $task->title,
            'category' => $task->template?->category ?? 'Autres',
            'detail' => $task->instructions, 'status' => $task->status, 'qui' => $task->assignee->name ?? 'Non attribuée',
            'h' => $task->closed_at?->setTimezone((string) config('dtomate.timezone'))->format('H:i'), 'work_date' => ($task->work_date ?? $task->due_at)->toDateString(),
            'justification' => $task->justification, 'photos' => count($task->evidence['photos'] ?? []),
        ])]);
    }

    public function generate(Request $request, DailyTaskScheduler $scheduler): RedirectResponse
    {
        $this->manager($request->user());
        abort_unless($request->user()->site?->code === config('dtomate.tasks.site_code'), 403);
        try {
            $scheduler->catchUp();
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['operation' => $error->getMessage()]);
        }

        return back()->with('toast', ['type' => 'success', 'message' => 'Tâches du registre générées.']);
    }

    public function assign(Request $request, Task $task): RedirectResponse
    {
        $this->manager($request->user());
        $this->viewTask($request->user(), $task);
        $data = $request->validate(['assigned_to' => ['required', 'integer', 'exists:users,id']]);
        $assignee = User::query()->findOrFail((int) $data['assigned_to']);
        abort_unless($assignee->site_id === $task->site_id && $assignee->isActive(), 422, 'Le responsable doit être actif et appartenir au même site.');
        DB::transaction(function () use ($task, $assignee, $request): void {
            $locked = Task::query()->lockForUpdate()->findOrFail($task->id);
            $this->assertOpen($locked);
            if ($locked->assigned_to === $assignee->id) {
                return;
            }
            $previous = $locked->assigned_to;
            $locked->forceFill(['assigned_to' => $assignee->id, 'assignment_notified_at' => null])->save();
            TaskEvent::query()->create(['task_id' => $locked->id, 'event' => 'assigned', 'payload' => ['previous' => $previous, 'assigned_to' => $assignee->id], 'performed_by' => $request->user()->id]);
            SendTaskAssignment::dispatch($locked->id, $assignee->id)->afterCommit();
        });

        return back()->with('toast', ['type' => 'success', 'message' => 'Tâche attribuée et notification préparée.']);
    }

    public function replan(Request $request, Task $task): RedirectResponse
    {
        $this->manager($request->user());
        $this->viewTask($request->user(), $task);
        $data = $request->validate([
            'work_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:'.ServerClock::today()->toDateString()],
            'assigned_to' => ['required', 'integer', 'exists:users,id'],
        ]);
        $assignee = User::query()->findOrFail((int) $data['assigned_to']);
        abort_unless($assignee->isActive() && $assignee->site_id === $task->site_id, 422);
        DB::transaction(function () use ($task, $assignee, $data, $request): void {
            $original = Task::query()->lockForUpdate()->findOrFail($task->id);
            if (! in_array($original->status, [Task::JUSTIFIED, Task::UNJUSTIFIED], true)) {
                throw ValidationException::withMessages(['operation' => 'Seule une tâche non exécutée ayant reçu une réponse peut être reprogrammée.']);
            }
            $date = CarbonImmutable::parse($data['work_date'], config('dtomate.timezone'));
            if ($original->department_id !== null) {
                try {
                    app(DayClosureService::class)->assertOpen($original->department_id, $date);
                } catch (RuntimeException $error) {
                    throw ValidationException::withMessages(['operation' => $error->getMessage()]);
                }
            }
            $key = hash('sha256', 'reprise|'.$original->id.'|'.$date->toDateString());
            $existing = Task::query()->where('replanned_from_id', $original->id)->whereIn('status', Task::OPEN_STATUSES)->first();
            if ($existing !== null && $existing->occurrence_key !== $key) {
                throw ValidationException::withMessages(['operation' => 'Une reprise de cette tâche est déjà à suivre pour le '.($existing->work_date ?? $existing->due_at)->toDateString().'.']);
            }
            $next = Task::query()->firstOrCreate(['occurrence_key' => $key], [
                'reference' => 'TC-'.substr($key, 0, 24), 'origin' => 'crop_registry', 'replanned_from_id' => $original->id,
                'title' => $original->title, 'instructions' => $original->instructions,
                'template_id' => $original->template_id, 'site_id' => $original->site_id,
                'department_id' => $original->department_id, 'zone_id' => $original->zone_id,
                'cost_centre_id' => $original->cost_centre_id, 'assigned_to' => $assignee->id,
                'crop_type' => $original->crop_type, 'cycle_started_on' => $original->cycle_started_on,
                'work_date' => $date->toDateString(), 'due_at' => $date->setTimeFromTimeString(config('dtomate.tasks.deadline'))->utc(),
            ]);
            if ($next->wasRecentlyCreated) {
                TaskEvent::query()->create(['task_id' => $original->id, 'event' => 'replanned', 'payload' => ['task_id' => $next->id, 'work_date' => $date->toDateString()], 'performed_by' => $request->user()->id]);
                TaskEvent::query()->create(['task_id' => $next->id, 'event' => 'generated', 'payload' => ['replanned_from' => $original->id], 'performed_by' => $request->user()->id]);
                SendTaskAssignment::dispatch($next->id, $assignee->id)->afterCommit();
            }
        });

        return back()->with('toast', ['type' => 'success', 'message' => 'Reprise programmée. La justification initiale reste conservée.']);
    }

    public function close(Request $request, Task $task, TaskService $service, TaskPhotoStorage $photos): RedirectResponse
    {
        $this->viewTask($request->user(), $task);
        abort_unless($task->assigned_to === $request->user()->id, 403, 'Seul le responsable attribué peut déposer son exécution ou sa justification.');
        $data = $request->validate([
            'status' => ['required', Rule::in([Task::DONE, Task::JUSTIFIED])],
            'note' => ['nullable', 'string', 'max:3000'],
            'reason' => ['required_if:status,justified', 'nullable', Rule::in(Task::REASONS)],
            'justification' => ['required_if:status,justified', 'nullable', 'string', 'min:10', 'max:3000'],
            'photos' => ['required_if:status,done', 'array', 'max:5'],
            'photos.*' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
        ]);
        $paths = [];
        try {
            foreach ($request->file('photos', []) as $photo) {
                $paths[] = $photos->store($photo, $task->id);
            }
            $evidence = ['photos' => $paths, 'note' => $data['note'] ?? null, 'justification' => $data['justification'] ?? null];
            $service->close($task, $request->user(), $data['status'], $evidence, $data['reason'] ?? null);
        } catch (RuntimeException $error) {
            Storage::disk('local')->delete($paths);
            throw ValidationException::withMessages(['operation' => $error->getMessage()]);
        } catch (\Throwable $error) {
            Storage::disk('local')->delete($paths);
            throw $error;
        }

        return back()->with('toast', ['type' => 'success', 'message' => $data['status'] === Task::DONE ? 'Preuve déposée : votre responsable doit la valider.' : 'Non-exécution justifiée et historisée.']);
    }

    public function review(Request $request, Task $task, TaskReviewService $service): RedirectResponse
    {
        $this->viewTask($request->user(), $task);
        abort_unless($service->canReview($request->user(), $task), 403, 'La revue exige un responsable habilité différent de l’auteur de la preuve.');
        $data = $request->validate(['photos_examined' => ['accepted_if:decision,approve'], 'decision' => ['required', Rule::in(['approve', 'reject'])], 'note' => ['required_if:decision,reject', 'nullable', 'string', Rule::when($request->input('decision') === 'reject', ['min:10']), 'max:3000']]);
        try {
            $service->review($task, $request->user(), $data['decision'] === 'approve', $data['note'] ?? null);
        } catch (RuntimeException $error) {
            throw ValidationException::withMessages(['operation' => $error->getMessage()]);
        }

        return back()->with('toast', ['type' => 'success', 'message' => $data['decision'] === 'approve' ? 'Exécution validée après revue de la preuve.' : 'Correction demandée ; l’agent a été notifié.']);
    }

    public function eventPhoto(Request $request, Task $task, TaskEvent $event, int $index): BinaryFileResponse
    {
        $this->viewTask($request->user(), $task);
        abort_unless($event->task_id === $task->id, 404);
        $photos = $event->payload['evidence']['photos'] ?? [];
        abort_unless(isset($photos[$index]) && Storage::disk('local')->exists($photos[$index]), 404);

        return response()->file(Storage::disk('local')->path($photos[$index]), ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function photo(Request $request, Task $task, int $index): BinaryFileResponse
    {
        $this->viewTask($request->user(), $task);
        $photos = $task->evidence['photos'] ?? $task->non_completion_evidence['photos'] ?? [];
        abort_unless(isset($photos[$index]) && Storage::disk('local')->exists($photos[$index]), 404);

        return response()->file(Storage::disk('local')->path($photos[$index]), ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function responsible(Request $request, Zone $zone): RedirectResponse
    {
        $this->manager($request->user());
        abort_unless($zone->site_id === $request->user()->site_id && ($request->user()->role === Role::Direction || $zone->department_id === $request->user()->department_id), 403);
        $data = $request->validate(['task_responsible_id' => ['nullable', 'integer', 'exists:users,id']]);
        $agent = empty($data['task_responsible_id']) ? null : User::query()->findOrFail((int) $data['task_responsible_id']);
        abort_unless($agent === null || ($agent->site_id === $zone->site_id && $agent->isActive()), 422);
        DB::transaction(function () use ($zone, $agent): void {
            $zone->update(['task_responsible_id' => $agent?->id]);
        });

        return back()->with('toast', ['type' => 'success', 'message' => 'Responsable défini pour les prochaines tâches. Attribuez séparément les tâches déjà générées.']);
    }

    public function template(Request $request, ?TaskTemplate $template = null): RedirectResponse
    {
        abort_unless($request->user()->isActive() && $request->user()->role === Role::Direction, 403);
        $data = $request->validate([
            'crop_type' => ['required', 'string', 'max:255'], 'task_key' => ['required', 'string', 'max:80', 'regex:/^[A-Za-z0-9_-]+$/', Rule::unique('task_templates')->where('crop_type', $request->input('crop_type'))->ignore($template?->id)],
            'title' => ['required', 'string', 'max:255'], 'instructions' => ['required', 'string', 'max:10000'], 'category' => ['required', 'string', 'max:60'],
            'frequency' => ['required', Rule::in(['jour', 'sem', 'periode', 'unique'])], 'min_day' => ['required', 'integer', 'min:0', 'max:99999'],
            'max_day' => ['nullable', 'integer', 'gte:min_day', 'max:99999'], 'weekday' => ['required_if:frequency,sem', 'nullable', 'integer', 'between:0,6'],
            'interval_days' => ['required_if:frequency,periode', 'nullable', 'integer', 'between:1,9999'], 'is_active' => ['required', 'boolean'],
        ]);
        if ($template !== null && ($data['crop_type'] !== $template->crop_type || $data['task_key'] !== $template->task_key)) {
            throw ValidationException::withMessages(['task_key' => 'La culture et l’identifiant d’une règle existante restent fixes. Créez une nouvelle règle si nécessaire.']);
        }
        ($template ?? new TaskTemplate)->fill($data)->save();

        return back()->with('toast', ['type' => 'success', 'message' => 'Règle enregistrée. Les tâches déjà générées conservent leurs consignes.']);
    }

    public function importTemplates(Request $request, TaskTemplateRegistry $registry): RedirectResponse
    {
        abort_unless($request->user()->isActive() && $request->user()->role === Role::Direction, 403);
        $registry->importDefaults();

        return back();
    }

    public function readNotification(Request $request, string $notification): RedirectResponse
    {
        $request->user()->notifications()->where('id', $notification)->firstOrFail()->markAsRead();

        return back();
    }

    private function manager(User $user): void
    {
        abort_unless($user->isActive() && in_array($user->role, [Role::Direction, Role::Superviseur], true), 403);
    }

    private function viewTask(User $user, Task $task): void
    {
        abort_unless($user->isActive() && $user->site_id === $task->site_id && ($task->assigned_to === $user->id || $user->role === Role::Direction || ($user->role === Role::Superviseur && $user->department_id !== null && $user->department_id === $task->department_id)), 403);
    }

    private function assertOpen(Task $task): void
    {
        if (! $task->isOutstanding()) {
            throw ValidationException::withMessages(['operation' => 'Cette tâche est déjà clôturée.']);
        }
        if ($task->department_id !== null) {
            try {
                app(DayClosureService::class)->assertOpen($task->department_id, $task->deadlineAtSite()->startOfDay());
            } catch (RuntimeException $error) {
                throw ValidationException::withMessages(['operation' => $error->getMessage()]);
            }
        }
    }
}
