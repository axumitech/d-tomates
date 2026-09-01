<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * P3 — aucun plafond, aucune purge. Un journal qui perd silencieusement son
 * historique est pire que pas de journal, parce qu'on lui fait confiance.
 */
class AuditLog extends Model
{
    use AppendOnly;

    public const UPDATED_AT = null;

    /** @var array<int,string> */
    protected $fillable = [
        'auditable_type', 'auditable_id', 'event', 'before', 'after',
        'user_id', 'user_label', 'ip_address', 'user_agent', 'occurred_at',
    ];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return [
            'before' => 'array',
            'after' => 'array',
            'occurred_at' => 'immutable_datetime',
        ];
    }

    public function auditable(): MorphTo
    {
        return $this->morphTo();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
