<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('work_orders', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 20)->unique()->comment('BT-2026-0001, non réutilisable.');
            $table->foreignId('asset_id')->constrained()->restrictOnDelete();
            $table->string('type', 20);
            $table->string('status', 20)->default('raised');
            $table->string('criticality', 20)->default('ordinary');
            $table->string('title');
            $table->text('description')->nullable();

            $table->foreignId('reported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reported_at')->comment('Horloge SERVEUR — P1.');
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('due_at')->nullable()->comment('Calculé sur la criticité du bien.');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();

            $table->boolean('asset_stopped')->default(false);
            $table->unsignedInteger('downtime_minutes')->default(0);
            $table->string('failure_cause', 60)->nullable();
            $table->text('resolution')->nullable();
            $table->boolean('external_provider')->default(false);
            $table->string('provider_name')->nullable();

            $table->unsignedBigInteger('cost_parts_cents')->default(0);
            $table->unsignedBigInteger('cost_labour_cents')->default(0);
            $table->unsignedBigInteger('cost_external_cents')->default(0);
            $table->foreignId('cost_centre_id')->nullable()->constrained()->nullOnDelete();

            $table->foreignId('maintenance_plan_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'due_at']);
            $table->index(['asset_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('work_orders');
    }
};
