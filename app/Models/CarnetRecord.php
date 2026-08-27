<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CarnetRecord extends Model
{
    protected $fillable = ['storage_key', 'value', 'checksum', 'synced_at'];

    protected function casts(): array
    {
        return ['synced_at' => 'immutable_datetime'];
    }
}
