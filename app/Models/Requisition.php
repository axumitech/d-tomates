<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Requisition extends Model
{
    protected $fillable = ['reference','type','subject','item_id','quantity','amount_cents','cost_centre_id','urgency','reason','requested_by','approver_id','approved_by','issued_by','status','refusal_reason','approved_at','issued_at'];
    protected function casts(): array { return ['approved_at' => 'immutable_datetime','issued_at' => 'immutable_datetime']; }
}
