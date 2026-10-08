<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\Role;
use App\Models\CarnetRecord;
use App\Models\CarnetRecordRevision;
use App\Support\ServerClock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
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

        return response()->json([
            'value' => $record?->value,
            'checksum' => $record?->checksum,
            'synced_at' => $record?->synced_at?->toIso8601String(),
            'revision_count' => $record?->revisions()->count() ?? 0,
        ]);
    }

    public function records(Request $request): JsonResponse
    {
        $this->authorizeSite($request);

        $records = CarnetRecord::query()
            ->withCount('revisions')
            ->where('storage_key', 'not like', 'dt:acces:%')
            ->latest('synced_at')
            ->limit(2000)
            ->get()
            ->map(fn (CarnetRecord $record): array => [
                'key' => $record->storage_key,
                'checksum' => $record->checksum,
                'synced_at' => $record->synced_at->toIso8601String(),
                'size_bytes' => strlen($record->value),
                'revision_count' => $record->revisions_count,
            ]);

        return response()->json(['records' => $records]);
    }

    public function history(Request $request): JsonResponse
    {
        $this->authorizeSite($request);
        $key = (string) $request->string('key');
        $this->validateKey($key);

        $revisions = CarnetRecordRevision::query()
            ->where('storage_key', $key)
            ->latest('created_at')
            ->limit(100)
            ->get(['id', 'checksum', 'created_at'])
            ->map(fn (CarnetRecordRevision $revision): array => [
                'id' => $revision->id,
                'checksum' => $revision->checksum,
                'created_at' => $revision->created_at->toIso8601String(),
            ]);

        return response()->json(['revisions' => $revisions]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeSite($request);
        $data = $request->validate(['key' => ['required', 'string', 'max:190'], 'value' => ['required', 'string', 'max:2097152']]);
        $this->validateKey($data['key']);
        try {
            $decoded = json_decode($data['value'], true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw ValidationException::withMessages(['value' => 'La valeur du registre doit être un JSON valide.']);
        }
        if ($data['key'] === 'dt:reg:cultures') {
            abort_unless($request->user()->isActive() && $request->user()->site?->code === config('dtomate.tasks.site_code'), 403);
            if (! is_array($decoded)) {
                throw ValidationException::withMessages(['value' => 'Le registre des cultures doit être un objet.']);
            }
            foreach ($decoded as $zone => $culture) {
                if (! is_string($zone) || ! is_array($culture)) {
                    throw ValidationException::withMessages(['value' => 'Zone ou culture invalide.']);
                }
                Validator::make($culture, [
                    'type' => ['required', 'string', 'max:255'], 'debut' => ['required', 'date_format:Y-m-d'],
                    'effectif' => ['nullable', 'numeric', 'min:0'], 'aConfirmer' => ['nullable', 'boolean'],
                ])->validate();
            }

        }
        $checksum = hash('sha256', $data['value']);

        $record = DB::transaction(function () use ($data, $checksum, $request): CarnetRecord {
            $record = CarnetRecord::query()->where('storage_key', $data['key'])->lockForUpdate()->first();
            if ($data['key'] === 'dt:reg:cultures' && $request->user()->role !== Role::Direction) {
                $old = $record === null ? null : json_decode($record->value, true, 512, JSON_THROW_ON_ERROR);
                $next = json_decode($data['value'], true, 512, JSON_THROW_ON_ERROR);
                $structure = static fn (array $cultures): array => array_map(static fn (array $culture): array => array_diff_key($culture, ['effectif' => true]), $cultures);
                abort_unless($old !== null && $structure($old) == $structure($next), 403, 'Seule la direction peut modifier les cycles du registre des cultures.');
            }
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
