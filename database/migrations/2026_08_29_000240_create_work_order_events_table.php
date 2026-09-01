<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Journal des transitions d'un bon de travail : qui l'a ouvert, assigné,
 * démarré, mis en attente, clos, et quand. En ajout seul.
 *
 * Le journal d'audit dit ce qui a changé dans la table ; celui-ci raconte la
 * vie du bon, lisible sans être développeur.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('work_order_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('work_order_id')->constrained()->cascadeOnDelete();
            $table->string('event', 40);
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20)->nullable();
            $table->text('note')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('occurred_at')->comment('Horloge SERVEUR — P1.');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['work_order_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('work_order_events');
    }
};
