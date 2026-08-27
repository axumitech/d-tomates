<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sites', function (Blueprint $table) { $table->id(); $table->string('code', 20)->unique(); $table->string('name'); $table->string('legal_entity')->nullable(); $table->string('timezone', 64); $table->string('address')->nullable(); $table->timestamps(); });
        Schema::create('departments', function (Blueprint $table) { $table->id(); $table->foreignId('site_id')->constrained()->restrictOnDelete(); $table->string('code', 20); $table->string('name'); $table->timestamps(); $table->unique(['site_id', 'code']); });
        Schema::create('cost_centres', function (Blueprint $table) { $table->id(); $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete(); $table->string('code', 20)->unique(); $table->string('name'); $table->boolean('is_active')->default(true); $table->timestamps(); });
        Schema::create('zones', function (Blueprint $table) { $table->id(); $table->foreignId('site_id')->constrained()->restrictOnDelete(); $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete(); $table->foreignId('cost_centre_id')->nullable()->constrained()->nullOnDelete(); $table->string('code', 30); $table->string('name'); $table->string('type', 40); $table->string('legacy_key')->nullable()->index(); $table->timestamps(); $table->unique(['site_id', 'code']); });
        Schema::table('users', function (Blueprint $table) { $table->string('role', 20)->default('agent')->index(); $table->string('job_title')->nullable(); $table->foreignId('site_id')->nullable()->constrained()->nullOnDelete(); $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete(); $table->foreignId('manager_id')->nullable()->constrained('users')->nullOnDelete(); $table->unsignedBigInteger('approval_ceiling_cents')->nullable(); $table->unsignedBigInteger('daily_rate_cents')->nullable(); $table->date('employed_from')->nullable(); $table->date('employed_until')->nullable(); $table->boolean('is_field_only')->default(false); });
        Schema::create('units', function (Blueprint $table) { $table->id(); $table->string('code', 20)->unique(); $table->string('label'); $table->string('dimension', 20); $table->decimal('factor_to_base', 16, 6); });
        Schema::create('items', function (Blueprint $table) { $table->id(); $table->string('code', 30)->unique(); $table->string('name'); $table->string('category', 40); $table->string('dimension', 20); $table->string('usage_unit_code', 20); $table->bigInteger('alert_threshold_base')->default(0); $table->bigInteger('balance_base')->default(0); $table->unsignedBigInteger('unit_price_cents')->default(0); $table->boolean('is_active')->default(true); $table->timestamps(); });
        Schema::create('stock_movements', function (Blueprint $table) { $table->id(); $table->foreignId('item_id')->constrained()->restrictOnDelete(); $table->string('direction', 4); $table->bigInteger('quantity_base'); $table->decimal('quantity_entered', 16, 4); $table->string('unit_code_entered', 20); $table->string('reason', 60); $table->text('note')->nullable(); $table->foreignId('zone_id')->nullable()->constrained()->nullOnDelete(); $table->foreignId('cost_centre_id')->nullable()->constrained()->nullOnDelete(); $table->foreignId('performed_by')->nullable()->constrained('users')->nullOnDelete(); $table->date('work_date'); $table->timestamp('created_at')->useCurrent(); $table->index(['item_id', 'created_at']); });
        Schema::create('audit_logs', function (Blueprint $table) { $table->id(); $table->string('auditable_type'); $table->string('auditable_id', 64); $table->string('event', 20); $table->json('before')->nullable(); $table->json('after')->nullable(); $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete(); $table->timestamp('occurred_at'); $table->timestamp('created_at')->useCurrent(); $table->index(['auditable_type', 'auditable_id']); });
    }
    public function down(): void { Schema::dropIfExists('audit_logs'); Schema::dropIfExists('stock_movements'); Schema::dropIfExists('items'); Schema::dropIfExists('units'); Schema::table('users', function (Blueprint $table) { $table->dropConstrainedForeignId('manager_id'); $table->dropConstrainedForeignId('department_id'); $table->dropConstrainedForeignId('site_id'); $table->dropColumn(['role','job_title','approval_ceiling_cents','daily_rate_cents','employed_from','employed_until','is_field_only']); }); Schema::dropIfExists('zones'); Schema::dropIfExists('cost_centres'); Schema::dropIfExists('departments'); Schema::dropIfExists('sites'); }
};
