<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('carnet_records', function (Blueprint $table): void {
            $table->id();
            $table->string('storage_key', 190)->unique();
            $table->longText('value');
            $table->string('checksum', 64);
            $table->timestamp('synced_at')->useCurrent();
            $table->timestamps();
        });

        Schema::create('carnet_record_revisions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('carnet_record_id')->constrained()->restrictOnDelete();
            $table->string('storage_key', 190)->index();
            $table->longText('value');
            $table->string('checksum', 64);
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('carnet_record_revisions');
        Schema::dropIfExists('carnet_records');
    }
};
