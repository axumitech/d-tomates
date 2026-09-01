<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $reference
 * @property string $title
 * @property string $status
 * @property string $priority
 * @property CarbonImmutable $due_at
 * @property Zone|null $zone
 */
class Task extends Model
{
    public const TODO = 'todo';

    public const DONE = 'done';

    public const JUSTIFIED = 'justified';

    public const UNJUSTIFIED = 'unjustified';

    public const REASONS = ['weather', 'stockout', 'equipment_failure', 'supervisor_instruction', 'safety_incident', 'zone_access'];

    protected $fillable = ['reference', 'origin', 'title', 'instructions', 'site_id', 'department_id', 'zone_id', 'cost_centre_id', 'assigned_to', 'due_at', 'late_tolerance_hours', 'priority', 'status', 'evidence', 'non_completion_reason', 'non_completion_evidence', 'closed_by', 'closed_at'];

    protected function casts(): array
    {
        return ['due_at' => 'immutable_datetime', 'closed_at' => 'immutable_datetime', 'evidence' => 'array', 'non_completion_evidence' => 'array'];
    }

    /** @return HasMany<TaskEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(TaskEvent::class);
    }

    /** @return BelongsTo<Zone, $this> */
    public function zone(): BelongsTo
    {
        return $this->belongsTo(Zone::class);
    }

    public function isOutstanding(): bool
    {
        return $this->status === self::TODO;
    }
}
