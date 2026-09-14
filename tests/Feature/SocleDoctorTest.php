<?php

namespace Tests\Feature;

use App\Enums\MovementDirection;
use App\Models\Item;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class SocleDoctorTest extends TestCase
{
    use RefreshDatabase;

    public function test_diagnostic_ne_modifie_pas_le_stock_et_n_envoie_pas_de_mail(): void
    {
        $this->seed();
        config(['app.debug' => false, 'app.timezone' => config('dtomate.timezone'), 'queue.default' => 'database', 'mail.default' => 'smtp', 'mail.from.address' => 'ferme@example.test']);
        Cache::put('dtomate.scheduler.last_beat', now()->toIso8601String());
        Mail::fake();
        $movement = app(StockService::class)->record(Item::firstOrFail(), MovementDirection::In, 'kg', 2);
        $before = $movement->refresh()->getAttributes();
        $this->artisan('socle:doctor')->assertSuccessful();
        $this->assertSame($before, $movement->refresh()->getAttributes());
        Mail::assertNothingSent();
    }

    public function test_diagnostic_signale_un_ordonnanceur_arrete(): void
    {
        $this->seed();
        Cache::put('dtomate.scheduler.last_beat', now()->subHour()->toIso8601String());
        $this->artisan('socle:doctor')->expectsOutputToContain('Le cron ne tourne plus')->assertFailed();
    }
}
