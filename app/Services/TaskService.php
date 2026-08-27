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
    public function close(Task $task, User $user, string $status, array $evidence = [], ?string $reason = null): Task
    {
        if (! $task->isOutstanding()) throw new RuntimeException('Cette tâche est déjà clôturée.');
        if ($task->assigned_to !== $user->id && $user->role->value !== 'direction' && $user->role->value !== 'superviseur') throw new RuntimeException('Vous ne pouvez pas clôturer cette tâche.');
        if ($status === Task::DONE && $evidence === []) throw new RuntimeException('Une preuve d’exécution est requise.');
        if ($status === Task::JUSTIFIED && (! in_array($reason, Task::REASONS, true) || $evidence === [])) throw new RuntimeException('Un motif fermé et sa preuve sont requis.');
        if (! in_array($status, [Task::DONE, Task::JUSTIFIED, Task::UNJUSTIFIED], true)) throw new RuntimeException('Statut de clôture invalide.');
        return DB::transaction(function () use ($task, $user, $status, $evidence, $reason) {
            $task->forceFill(['status'=>$status,'evidence'=>$status === Task::DONE ? $evidence : null,'non_completion_reason'=>$reason,'non_completion_evidence'=>$status === Task::JUSTIFIED ? $evidence : null,'closed_by'=>$user->id,'closed_at'=>ServerClock::now()])->save();
            TaskEvent::query()->create(['task_id'=>$task->id,'event'=>'closed','payload'=>['status'=>$status,'reason'=>$reason],'performed_by'=>$user->id]);
            return $task->fresh();
        });
    }
}
