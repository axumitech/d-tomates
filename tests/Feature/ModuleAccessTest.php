<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ModuleAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_restricted_user_cannot_open_or_write_other_modules(): void
    {
        $user = User::factory()->create(['role' => Role::Agent, 'modules' => ['taches']]);
        $this->actingAs($user)->get('/')->assertRedirect('/taches');
        $this->get('/administration')->assertForbidden();
        $this->post('/administration/equipe', [])->assertForbidden();
        $this->get('/maintenance')->assertForbidden();
        $this->get('/api/carnet-storage')->assertForbidden();
        $this->put('/api/carnet-storage', [])->assertForbidden();
        $this->get('/profil')->assertOk();
    }

    public function test_legacy_accounts_keep_their_modules(): void
    {
        $user = User::factory()->create();
        $this->assertTrue($user->hasModule('pilotage'));
        $this->assertTrue($user->hasModule('administration'));
    }
}
