<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\MaintenanceTrigger;
use App\Models\Concerns\Auditable;
use App\Support\ServerClock;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $name
 * @property MaintenanceTrigger $trigger_type
 * @property Carbon|null $next_due_on
 * @property numeric-string|null $next_due_meter
 * @property bool $is_active
 * @property Asset $asset
 * @property User|null $defaultAssignee
 */
class MaintenancePlan extends Model
{
    use Auditable;

    /** @var array<int,string> */
    protected $fillable = [
        'asset_id', 'name', 'trigger_type', 'interval_days', 'interval_meter',
        'tolerance_days', 'instructions', 'checklist', 'default_assignee_id',
        'estimated_minutes', 'last_done_on', 'last_done_meter',
        'next_due_on', 'next_due_meter', 'is_active',
    ];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return [
            'trigger_type' => MaintenanceTrigger::class,
            'checklist' => 'array',
            'last_done_on' => 'date',
            'next_due_on' => 'date',
            'interval_meter' => 'decimal:2',
            'last_done_meter' => 'decimal:2',
            'next_due_meter' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    public function defaultAssignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'default_assignee_id');
    }

    /** L'échéance est-elle atteinte, au calendrier ou au compteur ? */
    public function isDue(): bool
    {
        if (! $this->is_active) {
            return false;
        }

        if ($this->trigger_type === MaintenanceTrigger::Calendar) {
            return $this->next_due_on !== null
                && $this->next_due_on->lessThanOrEqualTo(ServerClock::today());
        }

        return $this->next_due_meter !== null
            && (float) $this->asset->meter_current >= (float) $this->next_due_meter;
    }

    /** Jours de retard, ou 0. Sert à l'escalade. */
    public function overdueDays(): int
    {
        if ($this->trigger_type !== MaintenanceTrigger::Calendar || $this->next_due_on === null) {
            return 0;
        }

        $ecart = $this->next_due_on->diffInDays(ServerClock::today(), false);

        return max(0, (int) $ecart - (int) $this->tolerance_days);
    }
}
