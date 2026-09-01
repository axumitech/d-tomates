<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    public function test_home_displays_the_operations_dashboard(): void
    {
        $response = $this->get(route('home'));

        $response->assertOk()->assertInertia(fn ($page) => $page
            ->component('pilotage')
            ->has('metrics')
            ->has('attendance')
            ->has('work_orders'));
    }
}
