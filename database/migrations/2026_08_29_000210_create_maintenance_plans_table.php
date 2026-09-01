<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Un plan d'entretien est un ÉMETTEUR de bons de travail, au même titre que
 * le calendrier cultural est un émetteur de tâches. Il ne se coche pas : il
 * produit une obligation datée et assignée.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('maintenance_plans', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('trigger_type', 20)->default('calendar');
            $table->unsignedInteger('interval_days')->nullable();
            $table->decimal('interval_meter', 12, 2)->nullable();
            $table->unsignedSmallInteger('tolerance_days')->default(3);
            $table->text('instructions')->nullable()
                ->comment('Écrit pour quelqu\'un sans expertise : produit, dose, geste, ordre.');
            $table->json('checklist')->nullable();
            $table->foreignId('default_assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedSmallInteger('estimated_minutes')->nullable();
            $table->date('last_done_on')->nullable();
            $table->decimal('last_done_meter', 12, 2)->nullable();
            $table->date('next_due_on')->nullable();
            $table->decimal('next_due_meter', 12, 2)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'next_due_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maintenance_plans');
    }
};
