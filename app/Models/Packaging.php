<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Conditionnement propre à un article : « sac de 50 kg » vaut 50 000 g.
 * C'est la pièce qui met fin à la conversion mentale entre ce que le magasin
 * détient et ce que le champ applique.
 */
class Packaging extends Model
{
    use Auditable;

    /** @var array<int,string> */
    protected $fillable = ['item_id', 'code', 'label', 'factor_to_base', 'is_purchase_default'];

    /** @return array<string,string> */
    protected function casts(): array
    {
        return [
            'factor_to_base' => 'decimal:6',
            'is_purchase_default' => 'boolean',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }
}
