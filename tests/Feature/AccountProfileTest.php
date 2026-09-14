<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AccountProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_requires_login_and_shows_the_current_account(): void
    {
        $this->get('/profil')->assertRedirect('/login');
        $user = User::factory()->create(['role' => Role::Agent]);
        $this->actingAs($user)->get('/profil')->assertOk()->assertInertia(fn ($page) => $page
            ->component('profil')->where('profile.email', $user->email)->where('profile.name', $user->name));
    }

    public function test_password_change_only_updates_current_account_and_can_be_used_to_login(): void
    {
        $user = User::factory()->create(['password' => 'Old-password-123!', 'remember_token' => 'old-token']);
        $other = User::factory()->create(['password' => 'Other-password-123!']);
        $this->actingAs($user)->put('/profil/mot-de-passe', [
            'user_id' => $other->id,
            'current_password' => 'Old-password-123!',
            'password' => 'New-password-456!',
            'password_confirmation' => 'New-password-456!',
        ])->assertRedirect('/profil')->assertSessionHasNoErrors();
        $this->assertTrue(Hash::check('New-password-456!', $user->fresh()->password));
        $this->assertNotSame('old-token', $user->fresh()->remember_token);
        $this->assertTrue(Hash::check('Other-password-123!', $other->fresh()->password));
        $this->post('/logout');
        $this->post('/login', ['email' => $user->email, 'password' => 'Old-password-123!'])->assertSessionHasErrors('email');
        $this->post('/login', ['email' => $user->email, 'password' => 'New-password-456!'])->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_wrong_current_password_mismatch_and_weak_password_are_rejected(): void
    {
        $user = User::factory()->create(['password' => 'Old-password-123!']);
        $this->actingAs($user);
        foreach ([
            ['wrong', 'New-password-456!', 'New-password-456!', 'current_password'],
            ['Old-password-123!', 'New-password-456!', 'mismatch', 'password'],
            ['Old-password-123!', 'short', 'short', 'password'],
            ['Old-password-123!', 'Old-password-123!', 'Old-password-123!', 'password'],
        ] as [$current, $new, $confirmation, $error]) {
            $this->from('/profil')->put('/profil/mot-de-passe', [
                'current_password' => $current, 'password' => $new, 'password_confirmation' => $confirmation,
            ])->assertSessionHasErrors($error);
            $this->assertTrue(Hash::check('Old-password-123!', $user->fresh()->password));
        }
    }

    public function test_inactive_account_cannot_change_password(): void
    {
        $user = User::factory()->create(['employed_until' => now()->subDay()]);
        $this->actingAs($user)->get('/profil')->assertForbidden();
        $this->put('/profil/mot-de-passe', [])->assertForbidden();
    }
}
