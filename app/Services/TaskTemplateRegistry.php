<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\TaskTemplate;

final class TaskTemplateRegistry
{
    public function importDefaults(): int
    {
        $count = 0;
        $source = file_get_contents(database_path('data/crop-task-templates.json'));
        if ($source === false) {
            throw new \RuntimeException('Catalogue initial des tâches illisible.');
        }
        $catalogue = json_decode($source, true, 512, JSON_THROW_ON_ERROR);
        foreach ($catalogue as $crop => $rules) {
            foreach ($rules as $rule) {
                $template = TaskTemplate::query()->firstOrCreate(['crop_type' => $crop, 'task_key' => $rule['id']], [
                    'title' => $rule['nom'], 'instructions' => $rule['detail'], 'category' => $rule['cat'],
                    'frequency' => $rule['freq'], 'min_day' => $rule['min'] ?? 0, 'max_day' => $rule['max'] ?? null,
                    'weekday' => $rule['jour'] ?? null, 'interval_days' => $rule['periode'] ?? null,
                ]);
                $count += (int) $template->wasRecentlyCreated;
            }
        }

        return $count;
    }
}
