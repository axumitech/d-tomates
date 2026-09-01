<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pièce consommée sur un bon de travail. En ajout seul : la ligne est
 * adossée à un mouvement de stock réel, lui-même immuable. Une erreur se
 * corrige par une contre-écriture, pas par une suppression.
 */
class WorkOrderPart extends Model
{
    use AppendOnly;

    public const UPDATED_AT = null;

    /** @var array<int,string> */
    protected $fillable = [
        'work_order_id', 'item_id', 'quantity_entered', 'unit_code_entered',
        'quantity_base', 'cost_cents', 'stock_movement_id',
    ];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return [
            'quantity_entered' => 'decimal:4',
            'quantity_base' => 'integer',
            'cost_cents' => 'integer',
        ];
    }

    public function workOrder(): BelongsTo
    {
        return $this->belongsTo(WorkOrder::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function movement(): BelongsTo
    {
        return $this->belongsTo(StockMovement::class, 'stock_movement_id');
    }
}
