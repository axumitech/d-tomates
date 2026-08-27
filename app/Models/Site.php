<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Site extends Model
{
    protected $fillable = ['code', 'name', 'legal_entity', 'timezone', 'address'];
}
