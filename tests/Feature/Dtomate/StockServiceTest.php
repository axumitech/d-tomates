<?php

namespace Tests\Feature\Dtomate;

use App\Enums\Dimension;
use App\Enums\MovementDirection;
use App\Models\Item;
use App\Models\StockMovement;
use App\Models\Unit;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class StockServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_stock_is_derived_from_immutable_movements(): void
    {
        Unit::create(['code' => 'kg', 'label' => 'kilogramme', 'dimension' => Dimension::Mass, 'factor_to_base' => 1000]);
        $item = Item::create(['code' => 'ENG-1', 'name' => 'Engrais', 'category' => 'Engrais', 'dimension' => Dimension::Mass, 'usage_unit_code' => 'kg']);
        app(StockService::class)->record($item, MovementDirection::In, 'kg', 5);
        $this->assertSame(5000, $item->fresh()->balance_base);
        $this->expectException(RuntimeException::class);
        StockMovement::firstOrFail()->delete();
    }
}
