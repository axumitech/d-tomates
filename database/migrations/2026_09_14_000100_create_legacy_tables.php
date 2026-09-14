<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('legacy_days', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('site_id')->nullable()->constrained()->nullOnDelete();
            $table->string('section', 10)->comment('TOM, BAN, AVI, LIV');
            $table->date('work_date');
            $table->string('source_key')->unique();
            $table->json('payload');
            $table->timestamp('imported_at');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['section', 'work_date']);
        });

        Schema::create('legacy_records', function (Blueprint $table): void {
            $table->id();
            $table->string('kind', 40)->comment('lots, regimes, demandes, mesures, journal, mouvements, cultures, cumuls, acces');
            $table->string('source_key');
            $table->date('occurred_on')->nullable();
            $table->json('payload');
            $table->timestamp('imported_at');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['kind', 'occurred_on']);
            $table->index('source_key');
        });

        Schema::create('legacy_imports', function (Blueprint $table): void {
            $table->id();
            $table->string('filename');
            $table->string('carnet_version', 20)->nullable();
            $table->string('checksum', 64)->unique()->comment('Empêche le double import du même fichier.');
            $table->unsignedInteger('keys_total')->default(0);
            $table->unsignedInteger('items_created')->default(0);
            $table->unsignedInteger('zones_created')->default(0);
            $table->unsignedInteger('days_imported')->default(0);
            $table->unsignedInteger('records_imported')->default(0);
            $table->json('report')->nullable();
            $table->foreignId('imported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legacy_imports');
        Schema::dropIfExists('legacy_records');
        Schema::dropIfExists('legacy_days');
    }
};
