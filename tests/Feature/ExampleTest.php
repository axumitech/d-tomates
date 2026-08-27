<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    public function test_home_displays_the_field_notebook()
    {
        $response = $this->get(route('home'));

        $response->assertOk()->assertInertia(fn ($page) => $page->component('carnet'));
    }
}
