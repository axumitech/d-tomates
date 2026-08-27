<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Task extends Model
{
    public const TODO = 'todo'; public const DONE = 'done'; public const JUSTIFIED = 'justified'; public const UNJUSTIFIED = 'unjustified';
    public const REASONS = ['weather','stockout','equipment_failure','supervisor_instruction','safety_incident','zone_access'];
    public const UPDATED_AT = false;
    protected $fillable = ['reference','origin','title','instructions','site_id','department_id','zone_id','cost_centre_id','assigned_to','due_at','late_tolerance_hours','priority','status','evidence','non_completion_reason','non_completion_evidence','closed_by','closed_at'];
    protected function casts(): array { return ['due_at' => 'immutable_datetime','closed_at' => 'immutable_datetime','evidence' => 'array','non_completion_evidence' => 'array']; }
    public function events(): HasMany { return $this->hasMany(TaskEvent::class); }
    public function isOutstanding(): bool { return $this->status === self::TODO; }
}
