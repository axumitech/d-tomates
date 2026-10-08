<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\Role;
use App\Jobs\SendTaskReviewMessage;
use App\Models\Task;
use App\Models\TaskEvent;
use App\Models\User;
use App\Support\ServerClock;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class TaskReviewService
{
    public function canReview(User $user, Task $task): bool
    {
        return $user->isActive() && $user->site_id === $task->site_id
            && $user->id !== $task->closed_by && $user->id !== $task->assigned_to
            && ($user->role === Role::Direction || ($user->role === Role::Superviseur && $user->department_id !== null && $user->department_id === $task->department_id));
    }

    public function review(Task $task, User $user, bool $approve, ?string $note): Task
    {
        return DB::transaction(function () use ($task, $user, $approve, $note): Task {
            $task = Task::query()->lockForUpdate()->findOrFail($task->id);
            if ($task->status !== Task::PENDING_REVIEW || ! $this->canReview($user, $task)) {
                throw new RuntimeException('Cette preuve n’est pas en attente ou vous ne pouvez pas la valider.');
            }
            if ($approve && empty($task->evidence['photos'])) {
                throw new RuntimeException('La preuve ne contient aucune photo. Demandez un dépôt complet au responsable.');
            }
            if (! $approve && mb_strlen(trim($note ?? '')) < 10) {
                throw new RuntimeException('Expliquez la correction attendue (au moins 10 caractères).');
            }
            if ($task->department_id !== null) {
                app(DayClosureService::class)->assertOpen($task->department_id, $task->deadlineAtSite()->startOfDay());
            }
            $task->forceFill([
                'status' => $approve ? Task::DONE : Task::CORRECTION_REQUESTED,
                'reviewed_by' => $user->id, 'reviewed_at' => ServerClock::now()->utc(),
                'review_note' => $note, 'closed_at' => $approve ? ServerClock::now()->utc() : null,
            ])->save();
            $event = TaskEvent::query()->create([
                'task_id' => $task->id, 'event' => $approve ? 'review_approved' : 'review_rejected',
                'payload' => ['note' => $note, 'evidence' => $task->evidence, 'submitted_at' => $task->submitted_at?->toIso8601String(), 'submitted_by' => $task->closed_by],
                'performed_by' => $user->id,
            ]);
            if ($task->assigned_to !== null) {
                $this->notify($event, $task->assigned_to);
            }

            return $task->fresh();
        });
    }

    public function notifyReviewers(Task $task, TaskEvent $event): void
    {
        foreach (User::query()->where('site_id', $task->site_id)->whereIn('role', [Role::Direction->value, Role::Superviseur->value])->get() as $user) {
            if ($this->canReview($user, $task)) {
                $this->notify($event, $user->id);
            }
        }
    }

    private function notify(TaskEvent $event, int $userId): void
    {
        DB::table('task_review_notice_deliveries')->insertOrIgnore(['event_id' => $event->id, 'user_id' => $userId, 'created_at' => ServerClock::now()->utc(), 'updated_at' => ServerClock::now()->utc()]);
        $delivery = DB::table('task_review_notice_deliveries')->where('event_id', $event->id)->where('user_id', $userId)->first();
        SendTaskReviewMessage::dispatch($delivery->id)->afterCommit();
    }
}
