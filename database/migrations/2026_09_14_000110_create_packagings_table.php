<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('units')->insertOrIgnore([
            'code' => 't', 'label' => 'tonne', 'dimension' => 'mass', 'factor_to_base' => 1000000,
        ]);
        Schema::create('packagings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->string('code', 30)->comment('Ex. « sac50 »');
            $table->string('label')->comment('Ex. « Sac de 50 kg »');
            $table->decimal('factor_to_base', 16, 6)->comment('Ex. 50000 pour un sac de 50 kg.');
            $table->boolean('is_purchase_default')->default(false);
            $table->timestamps();

            $table->unique(['item_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('packagings');
    }
};
