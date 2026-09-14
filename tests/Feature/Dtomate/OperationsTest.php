<?php

declare(strict_types=1);

namespace Tests\Feature\Dtomate;

use App\Enums\AssetKind;
use App\Enums\AttendanceStatus;
use App\Enums\Criticality;
use App\Enums\Dimension;
use App\Enums\MovementDirection;
use App\Enums\Role;
use App\Enums\WorkOrderStatus;
use App\Enums\WorkOrderType;
use App\Models\Asset;
use App\Models\Attendance;
use App\Models\Department;
use App\Models\Item;
use App\Models\Site;
use App\Models\Unit;
use App\Models\User;
use App\Models\WorkOrderEvent;
use App\Services\AttendanceService;
use App\Services\StockService;
use App\Services\WorkOrderService;
use App\Support\ServerClock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

final class OperationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_attendance_is_unique_for_the_whole_site_and_recalculates_cost(): void
    {
        $site = Site::query()->create(['code' => 'NTETEMA', 'name' => 'Ntetema', 'timezone' => 'Africa/Lubumbashi']);
        $agent = User::factory()->create(['site_id' => $site->id, 'daily_rate_cents' => 800]);
        $service = app(AttendanceService::class);

        $service->record($site, ServerClock::today(), $agent, AttendanceStatus::Present, 8);
        $service->record($site, ServerClock::today(), $agent, AttendanceStatus::Present, 6);

        $this->assertSame(1, Attendance::query()->count());
        $this->assertSame(600, Attendance::query()->firstOrFail()->cost_cents);
        $this->assertTrue($service->wasPresent($site, ServerClock::today(), $agent));
    }

    public function test_work_order_uses_asset_criticality_and_writes_an_immutable_history(): void
    {
        $site = Site::query()->create(['code' => 'NTETEMA', 'name' => 'Ntetema', 'timezone' => 'Africa/Lubumbashi']);
        $reporter = User::factory()->create(['site_id' => $site->id]);
        $asset = Asset::query()->create([
            'code' => 'POMPE-01',
            'name' => 'Pompe principale',
            'kind' => AssetKind::Equipment,
            'site_id' => $site->id,
            'criticality' => Criticality::Vital,
        ]);

        $order = app(WorkOrderService::class)->open($asset, WorkOrderType::Corrective, 'Ne démarre plus', $reporter, assetStopped: true);

        $this->assertMatchesRegularExpression('/^BT-\d{4}-0001$/', $order->reference);
        $this->assertSame(4, (int) $order->reported_at->diffInHours($order->due_at));
        $this->assertTrue($asset->fresh()->hasOpenWorkOrder());
        $this->assertSame(1, WorkOrderEvent::query()->count());

        $this->expectException(RuntimeException::class);
        WorkOrderEvent::query()->firstOrFail()->delete();
    }

    public function test_site_code_protects_operational_writes(): void
    {
        $site = Site::query()->create(['code' => 'NTETEMA', 'name' => 'Ntetema', 'timezone' => 'Africa/Lubumbashi']);
        $agent = User::factory()->create(['site_id' => $site->id]);

        $this->actingAs($agent)->post(route('pilotage.attendance'), [
            'user_id' => $agent->id,
            'status' => AttendanceStatus::Present->value,
            'hours' => 8,
            'site_code' => 'incorrect',
        ])->assertForbidden();

        $this->actingAs($agent)->post(route('pilotage.attendance'), [
            'user_id' => $agent->id,
            'status' => AttendanceStatus::Present->value,
            'hours' => 8,
            'site_code' => (string) config('dtomate.site_access_code'),
        ])->assertRedirect();

        $this->assertDatabaseHas('attendances', ['site_id' => $site->id, 'user_id' => $agent->id, 'cost_cents' => 0]);
    }

    public function test_complete_work_order_cycle_tracks_assignment_stock_labour_and_resolution(): void
    {
        $site = Site::query()->create(['code' => 'NTETEMA', 'name' => 'Ntetema', 'timezone' => 'Africa/Lubumbashi']);
        $direction = User::factory()->create(['site_id' => $site->id, 'role' => Role::Direction]);
        $agent = User::factory()->create(['site_id' => $site->id, 'role' => Role::Agent, 'daily_rate_cents' => 800]);
        $storekeeper = User::factory()->create(['site_id' => $site->id, 'role' => Role::Magasinier]);
        $asset = Asset::query()->create(['code' => 'POMPE-02', 'name' => 'Pompe secondaire', 'kind' => AssetKind::Equipment, 'site_id' => $site->id, 'criticality' => Criticality::Important]);
        Unit::query()->create(['code' => 'u', 'label' => 'unité', 'dimension' => Dimension::Count, 'factor_to_base' => 1]);
        $item = Item::query()->create(['code' => 'PCE-01', 'name' => 'Roulement', 'category' => 'Pièce', 'dimension' => Dimension::Count, 'usage_unit_code' => 'u', 'unit_price_cents' => 2500]);
        app(StockService::class)->record($item, MovementDirection::In, 'u', 3, $storekeeper);
        app(AttendanceService::class)->record($site, ServerClock::today(), $agent, AttendanceStatus::Present, 8, $direction);

        $service = app(WorkOrderService::class);
        $order = $service->open($asset, WorkOrderType::Corrective, 'Roulement bruyant', $agent);
        $service->assign($order, $agent, $direction);
        $service->start($order, $agent);
        $service->addPart($order, $item, 'u', 1, $storekeeper);
        $service->addLabour($order, 2, $agent);
        $service->complete($order, $direction, 'Roulement remplacé et essai concluant.');

        $this->assertSame(WorkOrderStatus::Done, $order->fresh()->status);
        $this->assertSame(2, $item->fresh()->balance_base);
        $this->assertSame(2500, $order->fresh()->cost_parts_cents);
        $this->assertSame(200, $order->fresh()->cost_labour_cents);
        $this->assertSame(4, WorkOrderEvent::query()->where('work_order_id', $order->id)->count());
    }

    public function test_administration_updates_delegation_but_protects_last_direction(): void
    {
        $site = Site::query()->create(['code' => 'NTETEMA', 'name' => 'Ntetema', 'timezone' => 'Africa/Lubumbashi']);
        $department = Department::query()->create(['site_id' => $site->id, 'code' => 'SER', 'name' => 'Serre']);
        $direction = User::factory()->create(['site_id' => $site->id, 'role' => Role::Direction]);
        $supervisor = User::factory()->create(['site_id' => $site->id, 'department_id' => $department->id, 'role' => Role::Superviseur]);
        $this->actingAs($direction);
        $base = ['actor_id' => $direction->id, 'site_code' => (string) config('dtomate.site_access_code')];

        $this->patch(route('administration.users.update', $supervisor), $base + [
            'name' => $supervisor->name, 'email' => $supervisor->email, 'role' => Role::Superviseur->value,
            'site_id' => $site->id, 'department_id' => $department->id, 'approval_ceiling' => 350,
            'daily_rate' => 12.50, 'employed_from' => now()->subYear()->toDateString(), 'is_field_only' => false,
        ])->assertRedirect()->assertSessionHasNoErrors();

        $this->assertSame(35_000, $supervisor->fresh()->approval_ceiling_cents);
        $this->assertSame(1250, $supervisor->fresh()->daily_rate_cents);

        $this->patch(route('administration.users.update', $direction), $base + [
            'name' => $direction->name, 'email' => $direction->email, 'role' => Role::Agent->value,
            'site_id' => $site->id, 'approval_ceiling' => 0, 'daily_rate' => 0,
            'employed_from' => now()->subYear()->toDateString(), 'is_field_only' => false,
        ])->assertRedirect()->assertSessionHasErrors('operation');

        $this->assertSame(Role::Direction, $direction->fresh()->role);
    }
}
