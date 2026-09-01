<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkOrderLabour extends Model
{
    use AppendOnly;

    public const UPDATED_AT = null;

    protected $table = 'work_order_labour';

    /** @var array<int,string> */
    protected $fillable = [
        'work_order_id', 'user_id', 'worker_name', 'hours', 'rate_cents', 'cost_cents', 'work_date',
    ];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return [
            'hours' => 'decimal:2',
            'rate_cents' => 'integer',
            'cost_cents' => 'integer',
            'work_date' => 'date',
        ];
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
