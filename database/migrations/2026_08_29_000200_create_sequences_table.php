<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Compteurs de numérotation. Une référence de bon de travail doit être unique,
 * séquentielle et non réutilisable : elle sert de preuve. Le verrou pessimiste
 * sur cette table empêche deux bons de porter le même numéro.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sequences', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 40);
            $table->unsignedSmallInteger('year');
            $table->unsignedInteger('last_value')->default(0);
            $table->timestamps();

            $table->unique(['key', 'year']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sequences');
    }
};
