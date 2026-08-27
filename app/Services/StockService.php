<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\MovementDirection;
use App\Models\Item;
use App\Models\StockMovement;
use App\Models\Unit;
use App\Models\User;
use App\Models\Zone;
use App\Support\ServerClock;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class StockService
{
    /** @param array<string, int|string|null> $meta */
    public function record(Item $item, MovementDirection $direction, string $unitCode, float $quantity, ?User $by = null, array $meta = []): StockMovement
    {
        if ($quantity <= 0) {
            throw new RuntimeException('La quantité doit être strictement positive.');
        }
        $unit = Unit::query()->where('code', $unitCode)->firstOrFail();
        if ($unit->dimension !== $item->dimension) {
            throw new RuntimeException("Unité incompatible : {$unitCode} ne correspond pas à l'article {$item->code}.");
        }
        $base = (int) round($quantity * (float) $unit->factor_to_base);

        return DB::transaction(function () use ($item, $direction, $unitCode, $quantity, $by, $meta, $base) {
            if (isset($meta['zone_id'])) {
                $zone = Zone::query()->find($meta['zone_id']);
                if ($zone?->department_id !== null) {
                    app(DayClosureService::class)->assertOpen($zone->department_id, ServerClock::today());
                }
            }
            $locked = Item::query()->lockForUpdate()->findOrFail($item->id);
            if ($direction === MovementDirection::Out && $locked->balance_base < $base) {
                throw new RuntimeException('Stock insuffisant.');
            }
            $movement = StockMovement::query()->create(['item_id' => $locked->id, 'direction' => $direction, 'quantity_base' => $base, 'quantity_entered' => $quantity, 'unit_code_entered' => $unitCode, 'reason' => $meta['reason'] ?? 'non_precise', 'note' => $meta['note'] ?? null, 'zone_id' => $meta['zone_id'] ?? null, 'cost_centre_id' => $meta['cost_centre_id'] ?? null, 'performed_by' => $by?->id, 'work_date' => ($meta['work_date'] ?? ServerClock::today())->toDateString()]);
            $locked->balance_base = $locked->recomputeBalance();
            $locked->saveQuietly();

            return $movement;
        });
    }
}
