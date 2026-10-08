<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\Task;
use App\Notifications\DailyTaskNotification;
use App\Services\TaskNotificationSender;
use App\Support\ServerClock;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

final class SendTaskAssignment implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public int $taskId, public int $assigneeId) {}

    public function handle(): void
    {
        Cache::lock('task-assignment:'.$this->taskId, 60)->block(5, function (): void {
            $task = Task::query()->with(['assignee', 'zone'])->find($this->taskId);
            if ($task === null || $task->assigned_to !== $this->assigneeId || $task->assignment_notified_at !== null || ! $task->isOutstanding() || ! $task->assignee?->isActive() || $task->assignee->site_id !== $task->site_id) {
                return;
            }
            app(TaskNotificationSender::class)->send($task->assignee, new DailyTaskNotification('Une tâche vous est attribuée', [
                $task->reference.' — '.$task->title.' — '.($task->zone->name ?? 'Zone non renseignée'),
                $task->instructions ?? '',
                'Échéance : '.$task->deadlineAtSite()->format('d/m/Y H:i').'. Photo obligatoire pour déclarer la tâche exécutée ; sinon, indiquez le motif et une justification.',
            ], $task->work_date?->toDateString() ?? $task->due_at->toDateString()), 'assignment:'.$task->id.':'.$this->assigneeId.':'.$task->events()->where('event', 'assigned')->count());
            $task->forceFill(['assignment_notified_at' => ServerClock::now()->utc()])->save();
        });
    }
}
