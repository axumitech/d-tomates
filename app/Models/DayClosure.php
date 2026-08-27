<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;

class DayClosure extends Model
{
    use AppendOnly;

    public const UPDATED_AT = null;

    protected $fillable = ['department_id', 'work_date', 'closed_by', 'closed_at'];

    protected function casts(): array
    {
        return ['work_date' => 'date', 'closed_at' => 'immutable_datetime'];
    }
}
