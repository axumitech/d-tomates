<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;

/**
 * Tout ce que le carnet v5.3 contenait et qui n'a pas encore de modèle dans
 * le nouveau système : lots, cohortes de régimes, demandes, mesures, cumuls,
 * journal d'activité, anciens mouvements de stock.
 *
 * Conservé intégralement pour que rien ne soit perdu, et repris module par
 * module au fil des lots suivants.
 */
class LegacyRecord extends Model
{
    use AppendOnly;

    public const UPDATED_AT = null;

    /** @var array<int,string> */
    protected $fillable = ['kind', 'source_key', 'occurred_on', 'payload', 'imported_at'];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return [
            'occurred_on' => 'date',
            'payload' => 'array',
            'imported_at' => 'immutable_datetime',
        ];
    }
}
