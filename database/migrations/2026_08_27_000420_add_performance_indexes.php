<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('carnet_records', function (Blueprint $table): void {
            $table->index('synced_at', 'carnet_records_synced_at_index');
        });
        Schema::table('carnet_record_revisions', function (Blueprint $table): void {
            $table->index(['storage_key', 'created_at'], 'carnet_revisions_key_created_index');
        });
        Schema::table('stock_movements', function (Blueprint $table): void {
            $table->index(['work_date', 'item_id'], 'stock_movements_date_item_index');
            $table->index(['zone_id', 'work_date'], 'stock_movements_zone_date_index');
        });
        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->index('occurred_at', 'audit_logs_occurred_at_index');
            $table->index(['user_id', 'occurred_at'], 'audit_logs_user_occurred_index');
        });
        Schema::table('tasks', function (Blueprint $table): void {
            $table->index(['assigned_to', 'status', 'due_at'], 'tasks_assignee_status_due_index');
            $table->index(['site_id', 'status', 'due_at'], 'tasks_site_status_due_index');
        });
        Schema::table('requisitions', function (Blueprint $table): void {
            $table->index(['status', 'approver_id', 'created_at'], 'requisitions_status_approver_index');
            $table->index(['requested_by', 'created_at'], 'requisitions_requester_created_index');
        });
    }

    public function down(): void
    {
        Schema::table('requisitions', function (Blueprint $table): void {
            $table->dropIndex('requisitions_status_approver_index');
            $table->dropIndex('requisitions_requester_created_index');
        });
        Schema::table('tasks', function (Blueprint $table): void {
            $table->dropIndex('tasks_assignee_status_due_index');
            $table->dropIndex('tasks_site_status_due_index');
        });
        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->dropIndex('audit_logs_occurred_at_index');
            $table->dropIndex('audit_logs_user_occurred_index');
        });
        Schema::table('stock_movements', function (Blueprint $table): void {
            $table->dropIndex('stock_movements_date_item_index');
            $table->dropIndex('stock_movements_zone_date_index');
        });
        Schema::table('carnet_record_revisions', function (Blueprint $table): void {
            $table->dropIndex('carnet_revisions_key_created_index');
        });
        Schema::table('carnet_records', function (Blueprint $table): void {
            $table->dropIndex('carnet_records_synced_at_index');
        });
    }
};
