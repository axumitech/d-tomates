<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('legacy_id')->nullable()->unique();
            $table->string('purchase_unit_code', 20)->nullable();
            $table->string('price_unit_code', 20)->nullable();
            $table->string('frac_irac_code')->nullable();
            $table->boolean('needs_unit_review')->default(false);
        });
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->foreignId('reversal_of_id')->nullable()->unique()->constrained('stock_movements')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reversal_of_id');
        });
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['legacy_id', 'purchase_unit_code', 'price_unit_code', 'frac_irac_code', 'needs_unit_review']);
        });
    }
};
