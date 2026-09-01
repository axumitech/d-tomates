<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Criticality;
use App\Enums\WorkOrderStatus;
use App\Enums\WorkOrderType;
use App\Models\Concerns\Auditable;
use App\Support\ServerClock;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $reference
 * @property string $title
 * @property WorkOrderStatus $status
 * @property Criticality $criticality
 * @property CarbonImmutable $reported_at
 * @property CarbonImmutable|null $due_at
 * @property CarbonImmutable|null $started_at
 * @property Asset $asset
 * @property User|null $assignedTo
 * @property MaintenancePlan|null $plan
 */
class WorkOrder extends Model
{
    use Auditable;

    /** @var array<int,string> */
    protected $fillable = [
        'reference', 'asset_id', 'type', 'status', 'criticality', 'title', 'description',
        'reported_by', 'reported_at', 'assigned_to', 'due_at', 'started_at', 'completed_at',
        'completed_by', 'asset_stopped', 'downtime_minutes', 'failure_cause', 'resolution',
        'external_provider', 'provider_name', 'cost_parts_cents', 'cost_labour_cents',
        'cost_external_cents', 'cost_centre_id', 'maintenance_plan_id',
    ];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return [
            'type' => WorkOrderType::class,
            'status' => WorkOrderStatus::class,
            'criticality' => Criticality::class,
            'reported_at' => 'immutable_datetime',
            'due_at' => 'immutable_datetime',
            'started_at' => 'immutable_datetime',
            'completed_at' => 'immutable_datetime',
            'asset_stopped' => 'boolean',
            'external_provider' => 'boolean',
            'downtime_minutes' => 'integer',
            'cost_parts_cents' => 'integer',
            'cost_labour_cents' => 'integer',
            'cost_external_cents' => 'integer',
        ];
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    public function reportedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_by');
    }

    public function assignedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function completedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by');
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(MaintenancePlan::class, 'maintenance_plan_id');
    }

    public function parts(): HasMany
    {
        return $this->hasMany(WorkOrderPart::class);
    }

    public function labour(): HasMany
    {
        return $this->hasMany(WorkOrderLabour::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(WorkOrderEvent::class)->orderBy('occurred_at');
    }

    public function scopeOpen(Builder $q): Builder
    {
        return $q->whereNotIn('status', [WorkOrderStatus::Done->value, WorkOrderStatus::Cancelled->value]);
    }

    public function scopeOverdue(Builder $q): Builder
    {
        return $q->open()->whereNotNull('due_at')->where('due_at', '<', ServerClock::now());
    }

    public function totalCostCents(): int
    {
        return $this->cost_parts_cents + $this->cost_labour_cents + $this->cost_external_cents;
    }

    public function isOverdue(): bool
    {
        return $this->status->isOpen()
            && $this->due_at !== null
            && $this->due_at->lessThan(ServerClock::now());
    }
}
