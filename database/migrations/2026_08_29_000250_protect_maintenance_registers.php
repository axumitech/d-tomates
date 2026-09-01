<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private array $tables = ['work_order_events', 'work_order_parts'];

    public function up(): void
    {
        foreach ($this->tables as $table) {
            if (DB::getDriverName() === 'sqlite') {
                DB::unprepared("CREATE TRIGGER {$table}_no_update BEFORE UPDATE ON {$table} BEGIN SELECT RAISE(ABORT, 'append-only register'); END");
                DB::unprepared("CREATE TRIGGER {$table}_no_delete BEFORE DELETE ON {$table} BEGIN SELECT RAISE(ABORT, 'append-only register'); END");
            }
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $table) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$table}_no_update");
            DB::unprepared("DROP TRIGGER IF EXISTS {$table}_no_delete");
        }
    }
};
