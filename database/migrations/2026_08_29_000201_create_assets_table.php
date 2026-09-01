<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assets', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->string('kind', 20)->comment('equipment | infrastructure');
            $table->string('category', 60)->nullable()->comment('Pompe, Irrigation, Bâtiment, Véhicule…');
            $table->foreignId('site_id')->constrained()->restrictOnDelete();
            $table->foreignId('zone_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('cost_centre_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('parent_asset_id')->nullable()
                ->comment('Sous-ensemble : un moteur appartient à une pompe.');
            $table->string('manufacturer')->nullable();
            $table->string('model')->nullable();
            $table->string('serial_number')->nullable();
            $table->date('commissioned_on')->nullable();
            $table->unsignedBigInteger('purchase_cost_cents')->nullable();
            $table->string('criticality', 20)->default('ordinary');
            $table->string('status', 20)->default('in_service');
            $table->string('meter_unit', 20)->nullable()->comment('h, km — vide si le bien n\'a pas de compteur.');
            $table->decimal('meter_current', 12, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('parent_asset_id')->references('id')->on('assets')->nullOnDelete();
            $table->index(['site_id', 'status']);
            $table->index(['kind', 'criticality']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assets');
    }
};
