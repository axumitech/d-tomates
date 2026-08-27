<?php

namespace App\Models;

use App\Enums\Dimension;
use Illuminate\Database\Eloquent\Model;

class Unit extends Model
{
    public $timestamps = false;

    protected $fillable = ['code', 'label', 'dimension', 'factor_to_base'];

    protected function casts(): array
    {
        return ['dimension' => Dimension::class];
    }
}
