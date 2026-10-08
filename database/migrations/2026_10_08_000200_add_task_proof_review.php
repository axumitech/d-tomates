<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('replanned_from_id')->nullable()->constrained('tasks')->restrictOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
        });
        // Une ancienne déclaration avec photo n’est pas une validation humaine.
        foreach (DB::table('tasks')->where('origin', 'crop_registry')->where('status', 'done')->get() as $task) {
            DB::table('task_events')->insert([
                'task_id' => $task->id, 'event' => 'submitted', 'performed_by' => $task->closed_by,
                'payload' => json_encode(['status' => 'pending_review', 'evidence' => json_decode($task->evidence ?? '{}', true), 'reason' => 'migration_review_required'], JSON_THROW_ON_ERROR),
                'created_at' => now()->utc(),
            ]);
            DB::table('tasks')->where('id', $task->id)->update([
                'status' => 'pending_review', 'submitted_at' => $task->closed_at, 'closed_at' => null,
            ]);
        }
        foreach (DB::table('task_events')->where('event', 'generated')->get() as $event) {
            $payload = json_decode($event->payload ?? '{}', true);
            if (isset($payload['replanned_from'])) {
                DB::table('tasks')->where('id', $event->task_id)->update(['replanned_from_id' => $payload['replanned_from']]);
            }
        }
        Schema::create('task_review_notice_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('event_id')->constrained('task_events')->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->unique(['event_id', 'user_id']);
        });
    }

    public function down(): void
    {
        if (DB::table('tasks')->whereIn('status', ['pending_review', 'correction_requested'])->exists()) {
            throw new RuntimeException('Traiter les revues et corrections en attente avant de retirer le suivi des preuves.');
        }
        Schema::dropIfExists('task_review_notice_deliveries');
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropConstrainedForeignId('replanned_from_id');
            $table->dropColumn(['submitted_at', 'reviewed_at', 'review_note']);
        });
    }
};
