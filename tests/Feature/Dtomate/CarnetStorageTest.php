<?php

namespace Tests\Feature\Dtomate;

use App\Models\CarnetRecordRevision;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CarnetStorageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());
    }

    public function test_site_code_protects_and_persists_carnet_records(): void
    {
        config()->set('dtomate.site_access_code', '2026');
        $payload = json_encode(['meteo' => 'pluie', 'travaux' => []], JSON_THROW_ON_ERROR);

        $this->putJson('/api/carnet-storage', ['key' => 'dt:TOM:2026-08-27', 'value' => $payload])->assertUnauthorized();
        $this->getJson('/api/carnet-storage/records')->assertUnauthorized();
        $this->withHeader('X-DTomate-Site-Code', '2026')->putJson('/api/carnet-storage', ['key' => 'dt:TOM:2026-08-27', 'value' => $payload])->assertOk();
        $this->withHeader('X-DTomate-Site-Code', '2026')->getJson('/api/carnet-storage/value?key=dt:TOM:2026-08-27')->assertOk()->assertJsonPath('value', $payload);
        $this->withHeader('X-DTomate-Site-Code', '2026')->getJson('/api/carnet-storage/records')
            ->assertOk()
            ->assertJsonPath('records.0.key', 'dt:TOM:2026-08-27')
            ->assertJsonPath('records.0.revision_count', 1);
        $this->withHeader('X-DTomate-Site-Code', '2026')->getJson('/api/carnet-storage/history?key=dt:TOM:2026-08-27')
            ->assertOk()
            ->assertJsonCount(1, 'revisions');
        $this->withHeader('X-DTomate-Site-Code', '2026')->getJson('/api/carnet-storage?prefix=dt:TOM:')->assertOk()->assertJsonPath('keys.0', 'dt:TOM:2026-08-27');
        $this->assertSame(1, CarnetRecordRevision::count());
    }

    public function test_identical_sync_does_not_create_a_duplicate_revision(): void
    {
        config()->set('dtomate.site_access_code', '2026');
        $payload = json_encode(['meteo' => 'soleil'], JSON_THROW_ON_ERROR);

        $this->withHeader('X-DTomate-Site-Code', '2026')->putJson('/api/carnet-storage', ['key' => 'dt:TOM:2026-08-27', 'value' => $payload])->assertOk();
        $this->withHeader('X-DTomate-Site-Code', '2026')->putJson('/api/carnet-storage', ['key' => 'dt:TOM:2026-08-27', 'value' => $payload])->assertOk();

        $this->assertSame(1, CarnetRecordRevision::count());
    }

    public function test_carnet_records_must_contain_valid_json(): void
    {
        config()->set('dtomate.site_access_code', '2026');

        $this->withHeader('X-DTomate-Site-Code', '2026')
            ->putJson('/api/carnet-storage', ['key' => 'dt:TOM:2026-08-27', 'value' => 'not-json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('value');
    }
}
