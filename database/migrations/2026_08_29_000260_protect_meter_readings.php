<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            DB::unprepared("CREATE TRIGGER meter_readings_no_update BEFORE UPDATE ON meter_readings BEGIN SELECT RAISE(ABORT, 'append-only register'); END");
            DB::unprepared("CREATE TRIGGER meter_readings_no_delete BEFORE DELETE ON meter_readings BEGIN SELECT RAISE(ABORT, 'append-only register'); END");
        }
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS meter_readings_no_update');
        DB::unprepared('DROP TRIGGER IF EXISTS meter_readings_no_delete');
    }
};
