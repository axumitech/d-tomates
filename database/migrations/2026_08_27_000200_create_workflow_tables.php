<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) { $table->id(); $table->string('reference', 30)->unique(); $table->string('origin', 60); $table->string('title'); $table->text('instructions')->nullable(); $table->foreignId('site_id')->constrained()->restrictOnDelete(); $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete(); $table->foreignId('zone_id')->nullable()->constrained()->nullOnDelete(); $table->foreignId('cost_centre_id')->nullable()->constrained()->nullOnDelete(); $table->foreignId('assigned_to')->constrained('users')->restrictOnDelete(); $table->timestamp('due_at'); $table->unsignedSmallInteger('late_tolerance_hours')->default(0); $table->string('priority', 20)->default('normal'); $table->string('status', 30)->default('todo'); $table->json('evidence')->nullable(); $table->string('non_completion_reason', 60)->nullable(); $table->json('non_completion_evidence')->nullable(); $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete(); $table->timestamp('closed_at')->nullable(); $table->timestamp('created_at')->useCurrent(); $table->index(['department_id', 'due_at', 'status']); });
        Schema::create('task_events', function (Blueprint $table) { $table->id(); $table->foreignId('task_id')->constrained()->restrictOnDelete(); $table->string('event', 40); $table->json('payload')->nullable(); $table->foreignId('performed_by')->nullable()->constrained('users')->nullOnDelete(); $table->timestamp('created_at')->useCurrent(); $table->index(['task_id', 'created_at']); });
        Schema::create('day_closures', function (Blueprint $table) { $table->id(); $table->foreignId('department_id')->constrained()->restrictOnDelete(); $table->date('work_date'); $table->foreignId('closed_by')->constrained('users')->restrictOnDelete(); $table->timestamp('closed_at'); $table->text('reopen_reason')->nullable(); $table->foreignId('reopened_by')->nullable()->constrained('users')->nullOnDelete(); $table->timestamp('reopened_at')->nullable(); $table->timestamp('created_at')->useCurrent(); $table->unique(['department_id','work_date']); });
        Schema::create('requisitions', function (Blueprint $table) { $table->id(); $table->string('reference', 30)->unique(); $table->string('type', 40); $table->string('subject'); $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete(); $table->decimal('quantity', 16, 4)->nullable(); $table->unsignedBigInteger('amount_cents')->default(0); $table->foreignId('cost_centre_id')->nullable()->constrained()->nullOnDelete(); $table->string('urgency', 20)->default('normal'); $table->text('reason'); $table->foreignId('requested_by')->constrained('users')->restrictOnDelete(); $table->foreignId('approver_id')->nullable()->constrained('users')->nullOnDelete(); $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete(); $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete(); $table->string('status', 20)->default('issued'); $table->text('refusal_reason')->nullable(); $table->timestamp('approved_at')->nullable(); $table->timestamp('issued_at')->nullable(); $table->timestamps(); });
    }
    public function down(): void { Schema::dropIfExists('requisitions'); Schema::dropIfExists('day_closures'); Schema::dropIfExists('task_events'); Schema::dropIfExists('tasks'); }
};
