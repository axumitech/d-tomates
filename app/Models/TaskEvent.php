<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;

class TaskEvent extends Model
{
    use AppendOnly;

    public const UPDATED_AT = null;

    protected $fillable = ['task_id', 'event', 'payload', 'performed_by'];

    protected function casts(): array
    {
        return ['payload' => 'array'];
    }
}
