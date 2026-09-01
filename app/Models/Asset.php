<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AssetKind;
use App\Enums\AssetStatus;
use App\Enums\Criticality;
use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $code
 * @property string $name
 * @property AssetStatus $status
 * @property Criticality $criticality
 * @property string|null $meter_unit
 * @property numeric-string $meter_current
 * @property Site $site
 */
class Asset extends Model
{
    use Auditable;

    /** @var array<int,string> */
    protected $fillable = [
        'code', 'name', 'kind', 'category', 'site_id', 'zone_id', 'cost_centre_id',
        'parent_asset_id', 'manufacturer', 'model', 'serial_number', 'commissioned_on',
        'purchase_cost_cents', 'criticality', 'status', 'meter_unit', 'meter_current', 'notes',
    ];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return [
            'kind' => AssetKind::class,
            'status' => AssetStatus::class,
            'criticality' => Criticality::class,
            'commissioned_on' => 'date',
            'meter_current' => 'decimal:2',
            'purchase_cost_cents' => 'integer',
        ];
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function zone(): BelongsTo
    {
        return $this->belongsTo(Zone::class);
    }

    public function costCentre(): BelongsTo
    {
        return $this->belongsTo(CostCentre::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_asset_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_asset_id');
    }

    public function plans(): HasMany
    {
        return $this->hasMany(MaintenancePlan::class);
    }

    public function workOrders(): HasMany
    {
        return $this->hasMany(WorkOrder::class);
    }

    public function readings(): HasMany
    {
        return $this->hasMany(MeterReading::class);
    }

    /**
     * Existe-t-il un bon de travail ouvert sur ce bien ?
     *
     * C'est la vérification exigée par le motif de non-exécution « panne
     * d'équipement » : un motif sans son bon est refusé (CDC-SI-001 §6.3).
     */
    public function hasOpenWorkOrder(): bool
    {
        return $this->workOrders()
            ->whereNotIn('status', ['done', 'cancelled'])
            ->exists();
    }

    /** Coût d'entretien cumulé, toutes natures confondues. */
    public function maintenanceCostCents(): int
    {
        return (int) $this->workOrders()
            ->selectRaw('COALESCE(SUM(cost_parts_cents + cost_labour_cents + cost_external_cents), 0) AS t')
            ->value('t');
    }

    public function downtimeMinutes(): int
    {
        return (int) $this->workOrders()->sum('downtime_minutes');
    }
}
