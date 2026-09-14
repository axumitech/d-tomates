<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Journées reprises du carnet v5.3, en LECTURE SEULE.
 *
 * Elles ne sont pas rejouées comme des tâches : leur horodatage venait du
 * téléphone et leurs lignes étaient supprimables. Elles sont conservées à
 * titre d'historique d'exploitation, avec une valeur probante explicitement
 * limitée (CDC-SI-001 §11).
 */
class LegacyDay extends Model
{
    use AppendOnly;

    public const UPDATED_AT = null;

    /** @var array<int,string> */
    protected $fillable = ['site_id', 'section', 'work_date', 'source_key', 'payload', 'imported_at'];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return [
            'work_date' => 'date',
            'payload' => 'array',
            'imported_at' => 'immutable_datetime',
        ];
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }
}
