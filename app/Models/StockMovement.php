<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\MovementDirection;
use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    use AppendOnly;
    public const UPDATED_AT = null;
    protected $fillable = ['item_id','direction','quantity_base','quantity_entered','unit_code_entered','reason','note','zone_id','cost_centre_id','performed_by','work_date'];
    protected function casts(): array { return ['direction' => MovementDirection::class, 'work_date' => 'date']; }
}
