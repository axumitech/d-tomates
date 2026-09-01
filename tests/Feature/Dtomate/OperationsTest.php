<?php

declare(strict_types=1);

namespace Tests\Feature\Dtomate;

use App\Enums\AssetKind;
use App\Enums\AttendanceStatus;
use App\Enums\Criticality;
use App\Enums\WorkOrderType;
use App\Models\Asset;
use App\Models\Attendance;
use App\Models\Site;
use App\Models\User;
use App\Models\WorkOrderEvent;
use App\Services\AttendanceService;
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

        $this->post(route('pilotage.attendance'), [
            'user_id' => $agent->id,
            'status' => AttendanceStatus::Present->value,
            'hours' => 8,
            'site_code' => 'incorrect',
        ])->assertForbidden();

        $this->post(route('pilotage.attendance'), [
            'user_id' => $agent->id,
            'status' => AttendanceStatus::Present->value,
            'hours' => 8,
            'site_code' => (string) config('dtomate.site_access_code'),
        ])->assertRedirect();

        $this->assertDatabaseHas('attendances', ['site_id' => $site->id, 'user_id' => $agent->id, 'cost_cents' => 0]);
    }
}
