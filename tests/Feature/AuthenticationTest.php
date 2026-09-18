<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_business_route_requires_authentication(): void
    {
        foreach (Route::getRoutes() as $route) {
            if (in_array($route->uri(), ['login', 'logout', 'up']) || str_starts_with($route->uri(), 'storage/') || str_starts_with($route->uri(), '_')) {
                continue;
            }
            $this->assertContains('auth', $route->middleware(), $route->uri());
            $url = '/'.preg_replace('/\{[^}]+\}/', '1', $route->uri());
            $method = $route->methods()[0];
            if (str_starts_with($route->uri(), 'api/')) {
                $this->json($method, $url, [], ['X-DTomate-Site-Code' => config('dtomate.site_access_code')])->assertUnauthorized();
            } else {
                $this->call($method, $url)->assertRedirect('/login');
            }
        }
        $this->assertDatabaseCount('carnet_records', 0);
        $this->assertDatabaseCount('attendances', 0);
    }

    public function test_authenticated_api_writes_require_a_csrf_token(): void
    {
        $this->app['env'] = 'local';
        $this->actingAs(User::factory()->create());
        $this->withSession(['_token' => 'test-csrf-token']);
        $payload = ['key' => 'dt:TOM:2026-09-13', 'value' => '{"meteo":"soleil"}'];
        $headers = ['X-DTomate-Site-Code' => config('dtomate.site_access_code')];

        $this->putJson('/api/carnet-storage', $payload, $headers)->assertStatus(419);
        $this->putJson('/api/carnet-storage', $payload, $headers + ['X-CSRF-TOKEN' => 'test-csrf-token'])->assertOk();
    }

    public function test_password_can_be_provisioned_without_a_public_registration(): void
    {
        $user = User::factory()->create();
        $this->artisan('dtomate:set-password', ['email' => $user->email])
            ->expectsQuestion('Nouveau mot de passe (12 caractères minimum, lettres, chiffres et symboles)', 'A-personal-secret-123!')
            ->expectsQuestion('Confirmez le mot de passe', 'A-personal-secret-123!')
            ->expectsOutput('Mot de passe mis à jour.')
            ->assertSuccessful();
        $this->assertTrue(Hash::check('A-personal-secret-123!', $user->fresh()->password));
    }

    public function test_login_and_logout_protect_the_intended_page(): void
    {
        $user = User::factory()->create(['password' => Hash::make('A-secure-test-password!')]);
        $this->get('/carnet')->assertRedirect('/login');
        $this->get('/login')->assertOk()->assertInertia(fn ($page) => $page->component('auth/login'));
        $this->post('/login', ['email' => $user->email, 'password' => 'A-secure-test-password!'])->assertRedirect('/carnet');
        $this->assertAuthenticatedAs($user);
        $this->get('/carnet')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->post('/logout')->assertRedirect('/login');
        $this->assertGuest();
        $this->get('/carnet')->assertRedirect('/login');
        $this->getJson('/api/carnet-storage/records')->assertUnauthorized();
    }

    public function test_invalid_default_and_inactive_credentials_are_rejected(): void
    {
        $user = User::factory()->create(['password' => Hash::make('password')]);
        foreach (['wrong', 'password'] as $password) {
            $this->post('/login', ['email' => $user->email, 'password' => $password])->assertSessionHasErrors('email');
            $this->assertGuest();
        }
        $user->update(['password' => Hash::make('A-secure-test-password!'), 'employed_until' => now()->subDay()]);
        $this->post('/login', ['email' => $user->email, 'password' => 'A-secure-test-password!'])->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_default_password_is_accepted_only_in_local_environment(): void
    {
        $user = User::factory()->create(['password' => Hash::make('password')]);
        $this->app['env'] = 'production';
        $this->withSession(['_token' => 'test-csrf-token']);
        $this->post('/login', ['email' => $user->email, 'password' => 'password', '_token' => 'test-csrf-token'])->assertSessionHasErrors('email');
        $this->assertGuest();

        $this->app['env'] = 'local';
        $this->withSession(['_token' => 'test-csrf-token']);
        $this->post('/login', ['email' => $user->email, 'password' => 'password', '_token' => 'test-csrf-token'])->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_login_is_throttled_and_registration_is_not_public(): void
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->post('/login', ['email' => 'unknown@example.com', 'password' => 'wrong'])->assertSessionHasErrors('email');
        }
        $this->post('/login', ['email' => 'unknown@example.com', 'password' => 'wrong'])->assertStatus(429);
        $this->get('/register')->assertNotFound();
        $this->post('/register')->assertNotFound();
    }
}
