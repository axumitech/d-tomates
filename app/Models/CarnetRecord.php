<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** @property CarbonImmutable $synced_at */
class CarnetRecord extends Model
{
    protected $fillable = ['storage_key', 'value', 'checksum', 'synced_at'];

    protected function casts(): array
    {
        return ['synced_at' => 'immutable_datetime'];
    }

    /** @return HasMany<CarnetRecordRevision, $this> */
    public function revisions(): HasMany
    {
        return $this->hasMany(CarnetRecordRevision::class);
    }
}
