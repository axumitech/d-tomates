<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class TaskTemplate extends Model
{
    use Auditable;

    protected $fillable = ['crop_type', 'task_key', 'title', 'instructions', 'category', 'frequency', 'min_day', 'max_day', 'weekday', 'interval_days', 'is_active'];

    protected function casts(): array
    {
        return ['min_day' => 'integer', 'max_day' => 'integer', 'weekday' => 'integer', 'interval_days' => 'integer', 'is_active' => 'boolean'];
    }
}
