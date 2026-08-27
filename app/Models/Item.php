<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Dimension;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Item extends Model
{
    protected $fillable = ['code','name','category','dimension','usage_unit_code','alert_threshold_base','unit_price_cents','balance_base','is_active'];
    protected function casts(): array { return ['dimension' => Dimension::class, 'is_active' => 'boolean']; }
    public function movements(): HasMany { return $this->hasMany(StockMovement::class); }
    public function recomputeBalance(): int { return (int) $this->movements()->selectRaw("COALESCE(SUM(CASE WHEN direction = 'in' THEN quantity_base ELSE -quantity_base END), 0) total")->value('total'); }
}
