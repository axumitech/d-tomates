<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\DayClosure;
use App\Models\Task;
use App\Models\User;
use App\Support\ServerClock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Gate;
use RuntimeException;

final class DayClosureService
{
    public function close(int $departmentId, CarbonImmutable $workDate, User $by): DayClosure
    {
        Gate::forUser($by)->authorize('close-day');
        $outstanding = Task::query()->where('department_id', $departmentId)->whereDate('due_at', '<=', $workDate)->where('status', Task::TODO)->exists();
        if ($outstanding) {
            throw new RuntimeException('Clôture refusée : des tâches échues restent sans réponse.');
        }

        return DayClosure::query()->create(['department_id' => $departmentId, 'work_date' => $workDate->toDateString(), 'closed_by' => $by->id, 'closed_at' => ServerClock::now()]);
    }

    public function assertOpen(int $departmentId, CarbonImmutable $workDate): void
    {
        if (DayClosure::query()->where('department_id', $departmentId)->whereDate('work_date', $workDate)->exists()) {
            throw new RuntimeException('Cette journée est clôturée. Une réouverture approuvée par la Direction est requise.');
        }
    }
}
