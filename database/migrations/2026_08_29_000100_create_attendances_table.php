<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Le pointage est un fait du SITE, pas d'un département ni d'une culture.
 *
 * Il se saisit une fois par jour et vaut pour la serre, la bananeraie, le
 * poulailler et le magasin. C'est ce qui alimente le coût de main-d'œuvre et
 * ce qui permet de vérifier qu'un travail n'est pas attribué à quelqu'un qui
 * n'était pas là.
 *
 * L'unicité (site, date, agent) interdit structurellement le double pointage.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendances', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('site_id')->constrained()->restrictOnDelete();
            $table->date('work_date');
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('status', 20);
            $table->decimal('hours', 5, 2)->default(0);
            $table->unsignedBigInteger('daily_rate_cents')->default(0)
                ->comment('Taux figé au moment du pointage : une revalorisation ultérieure ne réécrit pas l\'histoire.');
            $table->unsignedBigInteger('cost_cents')->default(0)
                ->comment('heures / 8 x taux journalier, calculé au moment de l\'enregistrement.');
            $table->string('note')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['site_id', 'work_date', 'user_id']);
            $table->index(['work_date', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendances');
    }
};
