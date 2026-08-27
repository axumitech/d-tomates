<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\AppendOnly;
use Illuminate\Database\Eloquent\Model;

class CarnetRecordRevision extends Model
{
    use AppendOnly;

    public const UPDATED_AT = null;

    protected $fillable = ['carnet_record_id', 'storage_key', 'value', 'checksum', 'ip_address'];
}
