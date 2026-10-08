<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Zone extends Model
{
    use Auditable;

    protected $fillable = ['site_id', 'department_id', 'cost_centre_id', 'code', 'name', 'type', 'legacy_key', 'task_responsible_id'];
}
