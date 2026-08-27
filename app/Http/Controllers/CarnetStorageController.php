<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\CarnetRecord;
use App\Models\CarnetRecordRevision;
use App\Support\ServerClock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use JsonException;

final class CarnetStorageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeSite($request);
        $prefix = (string) $request->string('prefix');
        $this->validateKey($prefix, true);

        return response()->json(['keys' => CarnetRecord::query()->where('storage_key', 'like', $prefix.'%')->pluck('storage_key')->all()]);
    }

    public function show(Request $request): JsonResponse
    {
        $this->authorizeSite($request);
        $key = (string) $request->string('key');
        $this->validateKey($key);
        $record = CarnetRecord::query()->where('storage_key', $key)->first();

        return response()->json(['value' => $record?->value, 'synced_at' => $record?->synced_at?->toIso8601String()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeSite($request);
        $data = $request->validate(['key' => ['required', 'string', 'max:190'], 'value' => ['required', 'string', 'max:2097152']]);
        $this->validateKey($data['key']);
        try {
            json_decode($data['value'], true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw ValidationException::withMessages(['value' => 'La valeur du registre doit être un JSON valide.']);
        }
        $checksum = hash('sha256', $data['value']);

        $record = DB::transaction(function () use ($data, $checksum, $request): CarnetRecord {
            $record = CarnetRecord::query()->where('storage_key', $data['key'])->lockForUpdate()->first();
            $mustCreateRevision = false;
            if ($record === null) {
                $record = CarnetRecord::query()->create(['storage_key' => $data['key'], 'value' => $data['value'], 'checksum' => $checksum, 'synced_at' => ServerClock::now()]);
                $mustCreateRevision = true;
            } elseif ($record->checksum !== $checksum) {
                $record->forceFill(['value' => $data['value'], 'checksum' => $checksum, 'synced_at' => ServerClock::now()])->save();
                $mustCreateRevision = true;
            }
            if ($mustCreateRevision) {
                CarnetRecordRevision::query()->create(['carnet_record_id' => $record->id, 'storage_key' => $record->storage_key, 'value' => $record->value, 'checksum' => $record->checksum, 'ip_address' => $request->ip()]);
            }

            return $record;
        });

        return response()->json(['synced_at' => $record->synced_at->toIso8601String()]);
    }

    private function authorizeSite(Request $request): void
    {
        if (! hash_equals((string) config('dtomate.site_access_code'), (string) $request->header('X-DTomate-Site-Code'))) {
            abort(401, 'Code site invalide.');
        }
    }

    private function validateKey(string $key, bool $isPrefix = false): void
    {
        $pattern = $isPrefix ? '/^dt:[A-Za-z0-9:_-]*$/' : '/^dt:[A-Za-z0-9:_-]+$/';
        if (! preg_match($pattern, $key)) {
            throw ValidationException::withMessages(['key' => 'Clé de registre invalide.']);
        }
    }
}
