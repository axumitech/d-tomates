<?php

namespace Tests\Feature\Dtomate;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CarnetPageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create());
    }

    public function test_authenticated_user_can_open_the_field_notebook(): void
    {
        $this->get(route('carnet'))->assertOk()->assertInertia(fn ($page) => $page->component('carnet'));
    }

    public function test_secure_registers_have_a_dedicated_page(): void
    {
        $this->get(route('registres'))->assertOk()->assertInertia(fn ($page) => $page->component('registres'));
    }
}
