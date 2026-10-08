<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Task;
use App\Models\TaskEvent;
use App\Models\User;
use App\Support\ServerClock;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class TaskService
{
    /** @param array<string, mixed> $evidence */
    public function close(Task $task, User $user, string $status, array $evidence = [], ?string $reason = null): Task
    {
        return DB::transaction(function () use ($task, $user, $status, $evidence, $reason): Task {
            $task = Task::query()->lockForUpdate()->findOrFail($task->id);
            if ($task->department_id !== null) {
                app(DayClosureService::class)->assertOpen($task->department_id, ($task->origin === 'crop_registry' ? $task->deadlineAtSite() : $task->due_at)->startOfDay());
            }
            if (! $task->isOutstanding()) {
                throw new RuntimeException('Cette tâche est déjà clôturée.');
            }
            if (! $user->isActive() || ($task->assigned_to !== $user->id && ! in_array($user->role->value, ['direction', 'superviseur'], true))) {
                throw new RuntimeException('Vous ne pouvez pas clôturer cette tâche.');
            }
            if ($task->origin === 'crop_registry' && ($task->assigned_to !== $user->id || ($task->work_date !== null && $task->work_date->toDateString() > ServerClock::today()->toDateString()))) {
                throw new RuntimeException('Seul le responsable attribué peut répondre, à partir de la journée prévue.');
            }
            if ($status === Task::DONE && ($evidence === [] || ($task->origin === 'crop_registry' && empty($evidence['photos'])))) {
                throw new RuntimeException('Une preuve d’exécution est requise.');
            }
            if ($status === Task::JUSTIFIED && (! in_array($reason, Task::REASONS, true) || $evidence === [] || ($task->origin === 'crop_registry' && mb_strlen(trim($evidence['justification'] ?? '')) < 10))) {
                throw new RuntimeException('Un motif fermé et sa justification sont requis.');
            }
            if (! in_array($status, [Task::DONE, Task::JUSTIFIED, Task::UNJUSTIFIED], true)) {
                throw new RuntimeException('Statut de clôture invalide.');
            }
            $pending = $task->origin === 'crop_registry' && $status === Task::DONE;
            $storedStatus = $pending ? Task::PENDING_REVIEW : $status;
            $task->forceFill([
                'status' => $storedStatus, 'evidence' => $status === Task::DONE ? $evidence : null,
                'completion_note' => $status === Task::DONE ? ($evidence['note'] ?? null) : null,
                'non_completion_reason' => $status === Task::JUSTIFIED ? $reason : null,
                'non_completion_evidence' => $status === Task::JUSTIFIED ? $evidence : null,
                'justification' => $status === Task::JUSTIFIED ? ($evidence['justification'] ?? null) : null,
                'closed_by' => $user->id, 'closed_at' => $pending ? null : ($task->origin === 'crop_registry' ? ServerClock::now()->utc() : ServerClock::now()),
                'submitted_at' => $pending ? ServerClock::now()->utc() : null,
                'reviewed_by' => null, 'reviewed_at' => null, 'review_note' => null,
            ])->save();
            $event = TaskEvent::query()->create(['task_id' => $task->id, 'event' => $pending ? 'submitted' : 'closed', 'payload' => ['status' => $storedStatus, 'reason' => $reason, 'evidence' => $evidence], 'performed_by' => $user->id]);
            if ($pending) {
                app(TaskReviewService::class)->notifyReviewers($task, $event);
            }

            return $task->fresh();
        });
    }
}
