<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const TABLE = 'carnet_record_revisions';

    public function up(): void
    {
        match (DB::getDriverName()) {
            'sqlite' => $this->sqlite(),
            'pgsql' => $this->postgres(),
            'mysql' => $this->mysql(),
            default => null,
        };
    }

    public function down(): void
    {
        match (DB::getDriverName()) {
            'sqlite' => $this->sqliteDown(),
            'pgsql' => DB::unprepared('DROP TRIGGER IF EXISTS carnet_record_revisions_no_mutation ON carnet_record_revisions'),
            'mysql' => $this->mysqlDown(),
            default => null,
        };
    }

    private function sqlite(): void
    {
        DB::unprepared('CREATE TRIGGER '.self::TABLE.'_no_update BEFORE UPDATE ON '.self::TABLE." BEGIN SELECT RAISE(ABORT, 'append-only register'); END");
        DB::unprepared('CREATE TRIGGER '.self::TABLE.'_no_delete BEFORE DELETE ON '.self::TABLE." BEGIN SELECT RAISE(ABORT, 'append-only register'); END");
    }

    private function sqliteDown(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS carnet_record_revisions_no_update');
        DB::unprepared('DROP TRIGGER IF EXISTS carnet_record_revisions_no_delete');
    }

    private function mysql(): void
    {
        DB::unprepared('CREATE TRIGGER '.self::TABLE.'_no_update BEFORE UPDATE ON '.self::TABLE." FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'append-only register'");
        DB::unprepared('CREATE TRIGGER '.self::TABLE.'_no_delete BEFORE DELETE ON '.self::TABLE." FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'append-only register'");
    }

    private function mysqlDown(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS carnet_record_revisions_no_update');
        DB::unprepared('DROP TRIGGER IF EXISTS carnet_record_revisions_no_delete');
    }

    private function postgres(): void
    {
        DB::unprepared('CREATE TRIGGER '.self::TABLE.'_no_mutation BEFORE UPDATE OR DELETE ON '.self::TABLE.' FOR EACH ROW EXECUTE FUNCTION dtomate_reject_mutation()');
    }
};
