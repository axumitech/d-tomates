<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int|null $assigned_to
 * @property int $site_id
 * @property int|null $department_id
 * @property CarbonImmutable|null $work_date
 * @property CarbonImmutable|null $submitted_at
 * @property CarbonImmutable|null $reviewed_at
 * @property int|null $reviewed_by
 * @property User|null $reviewer
 * @property CarbonImmutable|null $closed_at
 * @property CarbonImmutable|null $assignment_notified_at
 * @property array{photos?: list<string>, note?: string|null, justification?: string|null}|null $evidence
 * @property array{photos?: list<string>, note?: string|null, justification?: string|null}|null $non_completion_evidence
 * @property CarbonImmutable|null $cycle_started_on
 * @property TaskTemplate|null $template
 * @property User|null $assignee
 * @property string $reference
 * @property string $title
 * @property string $status
 * @property string $priority
 * @property CarbonImmutable $due_at
 * @property Zone|null $zone
 */
class Task extends Model
{
    public const UPDATED_AT = null;

    public const TODO = 'todo';

    public const DONE = 'done';

    public const PENDING_REVIEW = 'pending_review';

    public const CORRECTION_REQUESTED = 'correction_requested';

    public const OPEN_STATUSES = [self::TODO, self::PENDING_REVIEW, self::CORRECTION_REQUESTED];

    public const RESPONSE_STATUSES = [self::TODO, self::CORRECTION_REQUESTED];

    public const JUSTIFIED = 'justified';

    public const UNJUSTIFIED = 'unjustified';

    public const REASONS = ['weather', 'stockout', 'equipment_failure', 'supervisor_instruction', 'safety_incident', 'zone_access'];

    protected $fillable = ['reference', 'origin', 'title', 'instructions', 'site_id', 'department_id', 'zone_id', 'cost_centre_id', 'assigned_to', 'due_at', 'late_tolerance_hours', 'priority', 'status', 'evidence', 'non_completion_reason', 'non_completion_evidence', 'closed_by', 'closed_at', 'template_id', 'occurrence_key', 'crop_type', 'cycle_started_on', 'work_date', 'completion_note', 'justification', 'assignment_notified_at', 'submitted_at', 'reviewed_by', 'reviewed_at', 'review_note', 'replanned_from_id'];

    protected function casts(): array
    {
        return ['submitted_at' => 'immutable_datetime', 'reviewed_at' => 'immutable_datetime', 'work_date' => 'immutable_date', 'cycle_started_on' => 'immutable_date', 'assignment_notified_at' => 'immutable_datetime', 'due_at' => 'immutable_datetime', 'closed_at' => 'immutable_datetime', 'evidence' => 'array', 'non_completion_evidence' => 'array'];
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

    /** @return BelongsTo<User, $this> */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /** @return BelongsTo<TaskTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(TaskTemplate::class, 'template_id');
    }

    /** @return BelongsTo<User, $this> */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function deadlineAtSite(): CarbonImmutable
    {
        return $this->due_at->setTimezone((string) config('dtomate.timezone'));
    }

    public function isOutstanding(): bool
    {
        return in_array($this->status, self::RESPONSE_STATUSES, true);
    }
}
