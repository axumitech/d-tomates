<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Site;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminUserPasswordTest extends TestCase
{
    use RefreshDatabase;

    private function payload(User $user): array
    {
        return [
            'name' => $user->name, 'email' => $user->email,
            'modules' => ['taches', 'carnet'],
            'role' => $user->role->value, 'site_id' => $user->site_id,
            'password' => 'New-password-456!', 'password_confirmation' => 'New-password-456!',
        ];
    }

    private function employee(): User
    {
        $site = Site::query()->create(['code' => 'TEST', 'name' => 'Test', 'timezone' => 'Africa/Kinshasa']);

        return User::factory()->create(['site_id' => $site->id, 'role' => Role::Agent, 'password' => 'Old-password-123!']);
    }

    public function test_admin_can_reset_another_password_and_employee_can_login(): void
    {
        $user = $this->employee();
        $admin = User::factory()->create(['role' => Role::Direction]);
        $adminHash = $admin->password;
        $oldToken = $user->remember_token;
        $this->actingAs($admin)->patch(route('administration.users.update', $user), $this->payload($user))
            ->assertSessionHasNoErrors()->assertRedirect();
        $this->assertTrue(Hash::check('New-password-456!', $user->fresh()->password));
        $this->assertNotSame($oldToken, $user->fresh()->remember_token);
        $this->assertSame($adminHash, $admin->fresh()->password);
        $this->post('/logout');
        $this->post('/login', ['email' => $user->email, 'password' => 'Old-password-123!'])->assertSessionHasErrors('email');
        $this->post('/login', ['email' => $user->email, 'password' => 'New-password-456!'])->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_empty_password_preserves_existing_credentials(): void
    {
        $user = $this->employee();
        $hash = $user->password;
        $token = $user->remember_token;
        $admin = User::factory()->create(['role' => Role::Direction]);
        $this->actingAs($admin)->patch(route('administration.users.update', $user), array_replace($this->payload($user), [
            'name' => 'Updated name', 'password' => '', 'password_confirmation' => '',
        ]))->assertSessionHasNoErrors();
        $this->assertSame($hash, $user->fresh()->password);
        $this->assertSame($token, $user->fresh()->remember_token);
        $this->assertSame('Updated name', $user->fresh()->name);
    }

    public function test_mismatched_and_weak_passwords_are_rejected(): void
    {
        $user = $this->employee();
        $admin = User::factory()->create(['role' => Role::Direction]);
        $this->actingAs($admin);
        foreach ([['New-password-456!', 'different'], ['short', 'short']] as [$password, $confirmation]) {
            $this->patch(route('administration.users.update', $user), array_replace($this->payload($user), [
                'password' => $password, 'password_confirmation' => $confirmation,
            ]))->assertSessionHasErrors('password');
            $this->assertTrue(Hash::check('Old-password-123!', $user->fresh()->password));
        }
    }

    public function test_other_roles_cannot_impersonate_direction_to_create_or_update_users(): void
    {
        $user = $this->employee();
        $admin = User::factory()->create(['role' => Role::Direction]);
        foreach ([Role::Agent, Role::Superviseur, Role::Magasinier] as $role) {
            $actor = User::factory()->create(['role' => $role]);
            $data = $this->payload($user) + ['actor_id' => $admin->id, 'site_code' => config('dtomate.site_access_code')];
            $this->actingAs($actor)->patch(route('administration.users.update', $user), $data)->assertForbidden();
            $this->post(route('administration.users.store'), $data)->assertForbidden();
        }
        $admin->update(['employed_until' => now()->subDay()]);
        $this->actingAs($admin)->patch(route('administration.users.update', $user), $this->payload($user))->assertForbidden();
        $this->assertTrue(Hash::check('Old-password-123!', $user->fresh()->password));
    }

    public function test_admin_can_create_a_user_with_a_working_password(): void
    {
        $user = $this->employee();
        $admin = User::factory()->create(['role' => Role::Direction]);
        $this->actingAs($admin)->post(route('administration.users.store'), array_replace($this->payload($user), [
            'name' => 'New employee', 'email' => 'new@example.com',
        ]))->assertSessionHasNoErrors()->assertRedirect();
        $created = User::where('email', 'new@example.com')->firstOrFail();
        $this->post('/logout');
        $this->post('/login', ['email' => $created->email, 'password' => 'New-password-456!'])->assertRedirect('/');
        $this->assertAuthenticatedAs($created);
    }
}
