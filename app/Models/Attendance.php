<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AttendanceStatus;
use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pointage journalier. Auditable et non « append-only » : une correction de
 * pointage est légitime dans la journée, mais chaque modification laisse une
 * ligne au journal d'audit avec la valeur avant et après.
 *
 * @property int $id
 * @property int $site_id
 * @property int $user_id
 * @property AttendanceStatus $status
 * @property numeric-string $hours
 * @property int $cost_cents
 * @property User $user
 */
class Attendance extends Model
{
    use Auditable;

    /** @var array<int,string> */
    protected $fillable = [
        'site_id', 'work_date', 'user_id', 'status', 'hours',
        'daily_rate_cents', 'cost_cents', 'note', 'recorded_by',
    ];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return [
            'work_date' => 'date',
            'status' => AttendanceStatus::class,
            'hours' => 'decimal:2',
            'daily_rate_cents' => 'integer',
            'cost_cents' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function scopeOn(Builder $q, string $date): Builder
    {
        return $q->whereDate('work_date', $date);
    }

    public function scopeWorking(Builder $q): Builder
    {
        return $q->where('status', AttendanceStatus::Present->value);
    }
}
