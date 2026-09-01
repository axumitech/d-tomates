<?php

namespace Tests\Feature\Dtomate;

use Tests\TestCase;

class CarnetPageTest extends TestCase
{
    public function test_anyone_with_the_site_code_can_open_the_field_notebook(): void
    {
        $this->get(route('carnet'))->assertOk()->assertInertia(fn ($page) => $page->component('carnet'));
    }

    public function test_secure_registers_have_a_dedicated_page(): void
    {
        $this->get(route('registres'))->assertOk()->assertInertia(fn ($page) => $page->component('registres'));
    }
}
