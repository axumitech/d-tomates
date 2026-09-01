<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkOrderEvent extends Model
{
    use AppendOnly;

    public const UPDATED_AT = null;

    /** @var array<int,string> */
    protected $fillable = [
        'work_order_id', 'event', 'from_status', 'to_status', 'note', 'user_id', 'occurred_at',
    ];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return ['occurred_at' => 'immutable_datetime'];
    }

    public function workOrder(): BelongsTo
    {
        return $this->belongsTo(WorkOrder::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
