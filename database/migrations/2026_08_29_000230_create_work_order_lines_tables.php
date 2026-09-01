<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('work_order_parts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('work_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity_entered', 16, 4);
            $table->string('unit_code_entered', 30);
            $table->bigInteger('quantity_base');
            $table->unsignedBigInteger('cost_cents')->default(0);
            $table->unsignedBigInteger('stock_movement_id')->nullable()
                ->comment('Le mouvement de stock réellement écrit. La pièce sort du magasin, elle n\'est pas déclarée.');
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('stock_movement_id')->references('id')->on('stock_movements')->nullOnDelete();
        });

        Schema::create('work_order_labour', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('work_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('worker_name')->nullable()->comment('Pour un intervenant hors effectif.');
            $table->decimal('hours', 6, 2);
            $table->unsignedBigInteger('rate_cents')->default(0);
            $table->unsignedBigInteger('cost_cents')->default(0);
            $table->date('work_date');
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('meter_readings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();
            $table->decimal('reading', 12, 2);
            $table->date('taken_on');
            $table->foreignId('taken_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['asset_id', 'taken_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meter_readings');
        Schema::dropIfExists('work_order_labour');
        Schema::dropIfExists('work_order_parts');
    }
};
