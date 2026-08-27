<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Zone extends Model { protected $fillable = ['site_id','department_id','cost_centre_id','code','name','type','legacy_key']; }
