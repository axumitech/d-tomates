<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_templates', function (Blueprint $table) {
            $table->id();
            $table->string('crop_type');
            $table->string('task_key', 80);
            $table->string('title');
            $table->text('instructions');
            $table->string('category', 60);
            $table->string('frequency', 20);
            $table->unsignedInteger('min_day')->default(0);
            $table->unsignedInteger('max_day')->nullable();
            $table->unsignedTinyInteger('weekday')->nullable();
            $table->unsignedInteger('interval_days')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['crop_type', 'task_key']);
        });
        Schema::table('zones', function (Blueprint $table) {
            $table->foreignId('task_responsible_id')->nullable()->constrained('users')->nullOnDelete();
        });
        Schema::table('tasks', function (Blueprint $table) {
            $table->unsignedBigInteger('assigned_to')->nullable()->change();
            $table->foreignId('template_id')->nullable()->constrained('task_templates')->restrictOnDelete();
            $table->string('occurrence_key', 64)->nullable()->unique();
            $table->string('crop_type')->nullable();
            $table->date('cycle_started_on')->nullable();
            $table->date('work_date')->nullable()->index();
            $table->text('completion_note')->nullable();
            $table->text('justification')->nullable();
            $table->timestamp('assignment_notified_at')->nullable();
        });
        Schema::create('task_generation_days', function (Blueprint $table) {
            $table->id();
            $table->date('work_date')->unique();
            $table->timestamp('created_at')->useCurrent();
        });
        Schema::create('task_report_deliveries', function (Blueprint $table) {
            $table->id();
            $table->date('work_date');
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->json('snapshot');
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->unique(['work_date', 'user_id']);
        });
        Schema::create('task_reminder_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->date('work_date');
            $table->string('slot', 20);
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'work_date', 'slot']);
        });
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('task_reminder_deliveries');
        Schema::dropIfExists('task_report_deliveries');
        Schema::dropIfExists('task_generation_days');
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('template_id');
            $table->dropColumn(['occurrence_key', 'crop_type', 'cycle_started_on', 'work_date', 'completion_note', 'justification', 'assignment_notified_at']);
        });
        Schema::table('zones', fn (Blueprint $table) => $table->dropConstrainedForeignId('task_responsible_id'));
        Schema::dropIfExists('task_templates');
    }
};
