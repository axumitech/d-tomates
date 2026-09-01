<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->string('user_label')->nullable()->after('user_id');
            $table->string('ip_address', 45)->nullable()->after('user_label');
            $table->string('user_agent', 500)->nullable()->after('ip_address');
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', fn (Blueprint $table) => $table->dropColumn(['user_label', 'ip_address', 'user_agent']));
    }
};
