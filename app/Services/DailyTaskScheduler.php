<?php

declare(strict_types=1);

namespace App\Services;

use App\Jobs\SendTaskAssignment;
use App\Models\CarnetRecord;
use App\Models\CarnetRecordRevision;
use App\Models\DayClosure;
use App\Models\Department;
use App\Models\Site;
use App\Models\Task;
use App\Models\TaskEvent;
use App\Models\TaskTemplate;
use App\Models\User;
use App\Models\Zone;
use App\Support\ServerClock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class DailyTaskScheduler
{
    public function generate(CarbonImmutable $date): int
    {
        return Cache::lock('daily-task-generation', 120)->block(5, function () use ($date): int {
            app(TaskTemplateRegistry::class)->importDefaults();
            $record = CarnetRecord::query()->where('storage_key', 'dt:reg:cultures')->first();
            if ($record === null) {
                throw new RuntimeException('Registre des cultures absent : synchronisez le carnet avant de générer les tâches.');
            }
            $source = $record->value;
            if ($date->isBefore(ServerClock::today())) {
                $revision = CarnetRecordRevision::query()->where('storage_key', 'dt:reg:cultures')->where('created_at', '<=', $date->endOfDay()->utc())->orderByDesc('id')->first();
                if ($revision === null && $record->updated_at->isAfter($date->endOfDay()->utc())) {
                    throw new RuntimeException('Aucun registre historique disponible pour le '.$date->toDateString().'.');
                }
                $source = $revision->value ?? $record->value;
            }
            $cultures = json_decode($source, true, 512, JSON_THROW_ON_ERROR);
            if (! is_array($cultures)) {
                throw new RuntimeException('Registre des cultures invalide.');
            }
            foreach ($cultures as $culture) {
                if (! is_array($culture) || ! isset($culture['type'], $culture['debut']) || ! CarbonImmutable::hasFormatWithModifiers($culture['debut'], 'Y-m-d')) {
                    throw new RuntimeException('Une culture du registre a une date ou un type invalide.');
                }
            }
            $site = Site::query()->where('code', config('dtomate.tasks.site_code'))->firstOrFail();
            $created = 0;
            DB::transaction(function () use ($cultures, $site, $date, &$created): void {
                foreach ($cultures as $name => $culture) {
                    $start = CarbonImmutable::parse($culture['debut'], config('dtomate.timezone'))->startOfDay();
                    $age = (int) $start->diffInDays($date, false);
                    if ($age < 0) {
                        continue;
                    }
                    $zone = Zone::query()->where('site_id', $site->id)->where(fn ($q) => $q->where('legacy_key', $name)->orWhere('name', $name))->first();
                    if ($zone === null) {
                        // Le carnet contient davantage de zones que le seeder historique.
                        $departmentCode = match (true) {
                            str_contains($culture['type'], 'Tomate'), str_contains($culture['type'], 'tomate') => 'SER',
                            str_contains($culture['type'], 'Poulet'), str_contains($culture['type'], 'Poule') => 'AVI',
                            default => 'BAN',
                        };
                        $department = Department::query()->where('site_id', $site->id)->where('code', $departmentCode)->first();
                        $zone = Zone::query()->create(['site_id' => $site->id, 'department_id' => $department?->id, 'code' => 'REG-'.substr(hash('sha256', $name), 0, 12), 'name' => $name, 'legacy_key' => $name, 'type' => 'crop_zone']);
                    }
                    $responsible = $zone->task_responsible_id === null ? null : User::query()->find($zone->task_responsible_id);
                    if ($responsible !== null && (! $responsible->isActive() || $responsible->site_id !== $site->id)) {
                        $responsible = null;
                    }
                    foreach (TaskTemplate::query()->where('crop_type', $culture['type'])->where('is_active', true)->get() as $template) {
                        $unique = $template->frequency === 'unique';
                        if ($age < $template->min_day || (! $unique && $template->max_day !== null && $age > $template->max_day)) {
                            continue;
                        }
                        $due = match ($template->frequency) {
                            'jour', 'unique' => true,
                            'sem' => $date->dayOfWeek === $template->weekday,
                            'periode' => $template->interval_days > 0 && $age >= $template->min_day && ($age - $template->min_day) % $template->interval_days === 0,
                            default => false,
                        };
                        if (! $due) {
                            continue;
                        }
                        $key = hash('sha256', implode('|', [$zone->id, $culture['type'], $start->toDateString(), $template->id, $unique ? 'unique' : $date->toDateString()]));
                        if (Task::query()->where('occurrence_key', $key)->exists()) {
                            continue;
                        }
                        $workDate = $date;
                        $deadlineDate = $unique ? $start->addDays($template->max_day ?? $template->min_day) : $date;
                        if ($zone->department_id !== null && DayClosure::query()->where('department_id', $zone->department_id)->whereDate('work_date', $workDate)->exists()) {
                            throw new RuntimeException('Une journée clôturée empêche la génération : '.$name.' / '.$workDate->toDateString());
                        }
                        $task = Task::query()->create([
                            'reference' => 'TC-'.substr($key, 0, 24), 'occurrence_key' => $key, 'origin' => 'crop_registry',
                            'title' => $template->title, 'instructions' => $template->instructions, 'template_id' => $template->id,
                            'site_id' => $site->id, 'department_id' => $zone->department_id, 'zone_id' => $zone->id, 'cost_centre_id' => $zone->cost_centre_id,
                            'assigned_to' => $responsible?->id, 'crop_type' => $culture['type'], 'cycle_started_on' => $start->toDateString(),
                            'work_date' => $workDate->toDateString(), 'due_at' => $deadlineDate->setTimeFromTimeString(config('dtomate.tasks.deadline'))->utc(), 'status' => Task::TODO,
                        ]);
                        TaskEvent::query()->create(['task_id' => $task->id, 'event' => 'generated', 'payload' => ['source' => 'dt:reg:cultures', 'responsible' => $responsible?->id], 'performed_by' => null]);
                        if ($responsible !== null) {
                            SendTaskAssignment::dispatch($task->id, $responsible->id)->afterCommit();
                        }
                        $created++;
                    }
                }
                DB::table('task_generation_days')->insertOrIgnore(['work_date' => $date->toDateString(), 'created_at' => ServerClock::now()]);
            });

            return $created;
        });
    }

    public function catchUp(): int
    {
        $last = DB::table('task_generation_days')->max('work_date');
        $date = $last === null ? ServerClock::today() : CarbonImmutable::parse($last, config('dtomate.timezone'));
        $count = 0;
        while ($date->lessThanOrEqualTo(ServerClock::today())) {
            $count += $this->generate($date);
            $date = $date->addDay();
        }

        return $count;
    }
}
