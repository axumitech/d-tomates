<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Relevé de compteur — heures de pompe, kilomètres de véhicule.
 * En ajout seul : un compteur ne se réécrit pas, il se relève.
 */
class MeterReading extends Model
{
    use AppendOnly;

    public const UPDATED_AT = null;

    /** @var array<int,string> */
    protected $fillable = ['asset_id', 'reading', 'taken_on', 'taken_by', 'note'];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return ['reading' => 'decimal:2', 'taken_on' => 'date'];
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    public function takenBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'taken_by');
    }
}
