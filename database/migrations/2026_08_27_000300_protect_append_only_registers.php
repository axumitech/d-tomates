<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private array $tables = ['stock_movements', 'task_events', 'audit_logs', 'day_closures'];

    public function up(): void
    {
        foreach ($this->tables as $table) {
            match (DB::getDriverName()) {
                'sqlite' => $this->sqlite($table),
                'pgsql' => $this->postgres($table),
                'mysql' => $this->mysql($table),
                default => null,
            };
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $table) {
            if (DB::getDriverName() === 'sqlite') {
                DB::unprepared("DROP TRIGGER IF EXISTS {$table}_no_update");
                DB::unprepared("DROP TRIGGER IF EXISTS {$table}_no_delete");
            }
            if (DB::getDriverName() === 'pgsql') {
                DB::unprepared("DROP TRIGGER IF EXISTS {$table}_no_mutation ON {$table}");
            }
            if (DB::getDriverName() === 'mysql') {
                DB::unprepared("DROP TRIGGER IF EXISTS {$table}_no_update");
                DB::unprepared("DROP TRIGGER IF EXISTS {$table}_no_delete");
            }
        }
        if (DB::getDriverName() === 'pgsql') {
            DB::unprepared('DROP FUNCTION IF EXISTS dtomate_reject_mutation()');
        }
    }

    private function sqlite(string $table): void
    {
        DB::unprepared("CREATE TRIGGER {$table}_no_update BEFORE UPDATE ON {$table} BEGIN SELECT RAISE(ABORT, 'append-only register'); END");
        DB::unprepared("CREATE TRIGGER {$table}_no_delete BEFORE DELETE ON {$table} BEGIN SELECT RAISE(ABORT, 'append-only register'); END");
    }

    private function mysql(string $table): void
    {
        DB::unprepared("CREATE TRIGGER {$table}_no_update BEFORE UPDATE ON {$table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'append-only register'");
        DB::unprepared("CREATE TRIGGER {$table}_no_delete BEFORE DELETE ON {$table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'append-only register'");
    }

    private function postgres(string $table): void
    {
        DB::unprepared("CREATE OR REPLACE FUNCTION dtomate_reject_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'append-only register'; END; $$ LANGUAGE plpgsql");
        DB::unprepared("CREATE TRIGGER {$table}_no_mutation BEFORE UPDATE OR DELETE ON {$table} FOR EACH ROW EXECUTE FUNCTION dtomate_reject_mutation()");
    }
};
