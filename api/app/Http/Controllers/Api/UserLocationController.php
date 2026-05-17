<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class UserLocationController extends Controller
{
    public function workbench()
    {
        if (!$this->hasRequiredTables()) {
            return response()->json([
                'success' => true,
                'data' => $this->emptyPayload(),
            ]);
        }

        return response()->json([
            'success' => true,
            'data' => $this->payload(),
        ]);
    }

    public function store(Request $request)
    {
        if (!$this->hasRequiredTables()) {
            return $this->unavailableResponse();
        }

        $this->prepareRequest($request);
        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $this->normalizedData($validator->validated());

        if ($this->assignmentConflicts($data['userId'], $data['locationCode'])) {
            return response()->json([
                'success' => false,
                'message' => 'This location is already authorised for the selected user.',
            ], 409);
        }

        DB::table('locationusers')->insert([
            'userid' => $data['userId'],
            'loccode' => $data['locationCode'],
            'canview' => $data['canView'] ? 1 : 0,
            'canupd' => $data['canUpdate'] ? 1 : 0,
        ]);

        return $this->savedResponse('User location access added.', $data, 201);
    }

    public function update(Request $request, string $userId, string $locationCode)
    {
        if (!$this->hasRequiredTables()) {
            return $this->unavailableResponse();
        }

        $userId = rawurldecode($userId);
        $locationCode = strtoupper(trim(rawurldecode($locationCode)));

        if (!$this->assignmentExistsExact($userId, $locationCode)) {
            return response()->json([
                'success' => false,
                'message' => 'User location access was not found.',
            ], 404);
        }

        $request->merge([
            'userId' => $userId,
            'locationCode' => $locationCode,
        ]);
        $this->prepareRequest($request);
        $validator = $this->validator($request, true);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $this->normalizedData($validator->validated());

        DB::table('locationusers')
            ->whereRaw('BINARY userid = ?', [$userId])
            ->whereRaw('BINARY loccode = ?', [$locationCode])
            ->update([
                'canview' => $data['canView'] ? 1 : 0,
                'canupd' => $data['canUpdate'] ? 1 : 0,
            ]);

        return $this->savedResponse('User location access updated.', $data);
    }

    public function destroy(string $userId, string $locationCode)
    {
        if (!$this->hasRequiredTables()) {
            return $this->unavailableResponse();
        }

        $userId = rawurldecode($userId);
        $locationCode = strtoupper(trim(rawurldecode($locationCode)));

        if (!$this->assignmentExistsExact($userId, $locationCode)) {
            return response()->json([
                'success' => false,
                'message' => 'User location access was not found.',
            ], 404);
        }

        DB::table('locationusers')
            ->whereRaw('BINARY userid = ?', [$userId])
            ->whereRaw('BINARY loccode = ?', [$locationCode])
            ->delete();

        return $this->savedResponse('User location access removed.', [
            'userId' => $userId,
            'locationCode' => $locationCode,
        ]);
    }

    private function payload(array $selected = []): array
    {
        $systemUsers = DB::table('www_users')
            ->select('userid', 'realname', 'email', 'defaultlocation', 'blocked')
            ->orderBy('realname')
            ->orderBy('userid')
            ->get()
            ->map(static function ($row) {
                return [
                    'userId' => (string) $row->userid,
                    'name' => html_entity_decode((string) ($row->realname ?: $row->userid)),
                    'email' => (string) ($row->email ?? ''),
                    'defaultLocation' => (string) ($row->defaultlocation ?? ''),
                    'blocked' => (int) $row->blocked === 1,
                    'missingUserRecord' => false,
                ];
            });

        $systemUserIds = $systemUsers->pluck('userId')->map(fn ($userId) => (string) $userId)->all();
        $assignmentOnlyUsers = DB::table('locationusers')
            ->orderBy('userid')
            ->pluck('userid')
            ->map(fn ($userId) => (string) $userId)
            ->uniqueStrict()
            ->filter(static function (string $userId) use ($systemUserIds) {
                return !in_array($userId, $systemUserIds, true);
            })
            ->map(static function (string $userId) {
                return [
                    'userId' => $userId,
                    'name' => $userId,
                    'email' => '',
                    'defaultLocation' => '',
                    'blocked' => false,
                    'missingUserRecord' => true,
                ];
            });

        $users = $systemUsers
            ->concat($assignmentOnlyUsers)
            ->sortBy([
                ['name', 'asc'],
                ['userId', 'asc'],
            ])
            ->values();

        $locations = DB::table('locations')
            ->select('loccode', 'locationname')
            ->orderBy('locationname')
            ->orderBy('loccode')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->loccode,
                    'name' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
                ];
            })
            ->values();

        $assignments = DB::table('locationusers as lu')
            ->leftJoin('www_users as wu', function ($join) {
                $join->on(DB::raw('BINARY wu.userid'), '=', DB::raw('BINARY lu.userid'));
            })
            ->leftJoin('locations as loc', function ($join) {
                $join->on(DB::raw('BINARY loc.loccode'), '=', DB::raw('BINARY lu.loccode'));
            })
            ->select(
                'lu.userid',
                'lu.loccode',
                'lu.canview',
                'lu.canupd',
                DB::raw('COALESCE(wu.realname, lu.userid) as user_name'),
                DB::raw('COALESCE(wu.email, "") as user_email'),
                DB::raw('COALESCE(wu.blocked, 0) as user_blocked'),
                DB::raw('CASE WHEN wu.userid IS NULL THEN 1 ELSE 0 END as user_missing_record'),
                DB::raw('COALESCE(loc.locationname, lu.loccode) as location_name')
            )
            ->orderBy('user_name')
            ->orderBy('location_name')
            ->get()
            ->map(static function ($row) {
                return [
                    'userId' => (string) $row->userid,
                    'userName' => html_entity_decode((string) $row->user_name),
                    'userEmail' => (string) ($row->user_email ?? ''),
                    'userBlocked' => (int) $row->user_blocked === 1,
                    'userMissingRecord' => (int) $row->user_missing_record === 1,
                    'locationCode' => (string) $row->loccode,
                    'locationName' => html_entity_decode((string) $row->location_name),
                    'canView' => (int) $row->canview === 1,
                    'canUpdate' => (int) $row->canupd === 1,
                ];
            })
            ->values();

        $selectedUserId = (string) ($selected['userId'] ?? $users->first()['userId'] ?? $assignments->first()['userId'] ?? '');
        $selectedLocationCode = (string) ($selected['locationCode'] ?? $locations->first()['code'] ?? $assignments->first()['locationCode'] ?? '');

        return [
            'users' => $users,
            'locations' => $locations,
            'assignments' => $assignments,
            'defaults' => [
                'userId' => $selectedUserId,
                'locationCode' => $selectedLocationCode,
                'canView' => true,
                'canUpdate' => true,
            ],
            'stats' => [
                'users' => $users->count(),
                'locations' => $locations->count(),
                'assignments' => $assignments->count(),
                'usersWithLocations' => $assignments->pluck('userId')->uniqueStrict()->count(),
                'locationsWithUsers' => $assignments->pluck('locationCode')->uniqueStrict()->count(),
                'updateAccess' => $assignments->where('canUpdate', true)->count(),
                'viewOnly' => $assignments->where('canView', true)->where('canUpdate', false)->count(),
            ],
        ];
    }

    private function emptyPayload(): array
    {
        return [
            'users' => [],
            'locations' => [],
            'assignments' => [],
            'defaults' => [
                'userId' => '',
                'locationCode' => '',
                'canView' => true,
                'canUpdate' => true,
            ],
            'stats' => [
                'users' => 0,
                'locations' => 0,
                'assignments' => 0,
                'usersWithLocations' => 0,
                'locationsWithUsers' => 0,
                'updateAccess' => 0,
                'viewOnly' => 0,
            ],
        ];
    }

    private function prepareRequest(Request $request): void
    {
        $canUpdate = filter_var($request->input('canUpdate', true), FILTER_VALIDATE_BOOLEAN);
        $canView = filter_var($request->input('canView', true), FILTER_VALIDATE_BOOLEAN) || $canUpdate;

        $request->merge([
            'userId' => trim((string) $request->input('userId', '')),
            'locationCode' => strtoupper(trim((string) $request->input('locationCode', ''))),
            'canView' => $canView,
            'canUpdate' => $canUpdate,
        ]);
    }

    private function validator(Request $request, bool $updating = false)
    {
        $rules = [
            'userId' => ['required', 'string'],
            'locationCode' => $updating ? ['required', 'string'] : ['required', 'string', Rule::exists('locations', 'loccode')],
            'canView' => ['required', 'boolean'],
            'canUpdate' => ['required', 'boolean'],
        ];

        $validator = Validator::make($request->all(), $rules);
        $validator->after(function ($validator) use ($request, $updating) {
            if (!$request->boolean('canView') && !$request->boolean('canUpdate')) {
                $validator->errors()->add('canView', 'At least view access must be enabled.');
            }

            if (!$updating && !$this->knownUserExists((string) $request->input('userId'))) {
                $validator->errors()->add('userId', 'The selected user was not found.');
            }

            if (!$updating && $this->assignmentConflicts((string) $request->input('userId'), (string) $request->input('locationCode'))) {
                $validator->errors()->add('locationCode', 'This location is already authorised for the selected user.');
            }
        });

        return $validator;
    }

    private function normalizedData(array $data): array
    {
        $canUpdate = filter_var($data['canUpdate'] ?? true, FILTER_VALIDATE_BOOLEAN);
        return [
            'userId' => (string) $data['userId'],
            'locationCode' => strtoupper((string) $data['locationCode']),
            'canView' => filter_var($data['canView'] ?? true, FILTER_VALIDATE_BOOLEAN) || $canUpdate,
            'canUpdate' => $canUpdate,
        ];
    }

    private function assignmentExistsExact(string $userId, string $locationCode): bool
    {
        if (!$this->hasRequiredTables()) {
            return false;
        }

        return DB::table('locationusers')
            ->whereRaw('BINARY userid = ?', [$userId])
            ->whereRaw('BINARY loccode = ?', [strtoupper($locationCode)])
            ->exists();
    }

    private function assignmentConflicts(string $userId, string $locationCode): bool
    {
        if (!$this->hasRequiredTables()) {
            return false;
        }

        return DB::table('locationusers')
            ->where('userid', $userId)
            ->where('loccode', strtoupper($locationCode))
            ->exists();
    }

    private function knownUserExists(string $userId): bool
    {
        if (!$this->hasRequiredTables()) {
            return false;
        }

        return DB::table('www_users')->whereRaw('BINARY userid = ?', [$userId])->exists()
            || DB::table('locationusers')->whereRaw('BINARY userid = ?', [$userId])->exists();
    }

    private function hasRequiredTables(): bool
    {
        foreach (['locationusers', 'locations', 'www_users'] as $table) {
            if (!Schema::hasTable($table)) {
                return false;
            }
        }

        return true;
    }

    private function unavailableResponse()
    {
        return response()->json([
            'success' => false,
            'message' => 'User location maintenance is not available.',
        ], 503);
    }

    private function validationResponse($validator)
    {
        return response()->json([
            'success' => false,
            'message' => 'Validation failed.',
            'errors' => $validator->errors(),
        ], 422);
    }

    private function savedResponse(string $message, array $selected, int $status = 200)
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => $this->payload($selected),
        ], $status);
    }
}
