<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class DepartmentAuthorizationController extends Controller
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

        if ($this->authorizationConflicts($data['userId'], $data['locationCode'])) {
            return response()->json([
                'success' => false,
                'message' => 'This user is already authorised for the selected location.',
            ], 409);
        }

        $locationName = DB::table('locations')
            ->where('loccode', $data['locationCode'])
            ->value('locationname');

        DB::table('internalstockauthusers')->insert([
            'loccode' => $data['locationCode'],
            'locationname' => (string) ($locationName ?: $data['locationCode']),
            'userid' => $data['userId'],
            'cancreate' => $data['canCreate'] ? 1 : 0,
            'canauthorise' => $data['canAuthorise'] ? 1 : 0,
            'canfullfill' => $data['canFulfill'] ? 1 : 0,
        ]);

        return $this->savedResponse('Department authorisation added.', $data, 201);
    }

    public function update(Request $request, string $locationCode, string $userId)
    {
        if (!$this->hasRequiredTables()) {
            return $this->unavailableResponse();
        }

        $locationCode = strtoupper(trim(rawurldecode($locationCode)));
        $userId = rawurldecode($userId);

        if (!$this->authorizationExistsExact($userId, $locationCode)) {
            return response()->json([
                'success' => false,
                'message' => 'Department authorisation was not found.',
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

        DB::table('internalstockauthusers')
            ->whereRaw('BINARY userid = ?', [$userId])
            ->whereRaw('BINARY loccode = ?', [$locationCode])
            ->update([
                'cancreate' => $data['canCreate'] ? 1 : 0,
                'canauthorise' => $data['canAuthorise'] ? 1 : 0,
                'canfullfill' => $data['canFulfill'] ? 1 : 0,
            ]);

        return $this->savedResponse('Department authorisation updated.', $data);
    }

    public function destroy(string $locationCode, string $userId)
    {
        if (!$this->hasRequiredTables()) {
            return $this->unavailableResponse();
        }

        $locationCode = strtoupper(trim(rawurldecode($locationCode)));
        $userId = rawurldecode($userId);

        if (!$this->authorizationExistsExact($userId, $locationCode)) {
            return response()->json([
                'success' => false,
                'message' => 'Department authorisation was not found.',
            ], 404);
        }

        DB::table('internalstockauthusers')
            ->whereRaw('BINARY userid = ?', [$userId])
            ->whereRaw('BINARY loccode = ?', [$locationCode])
            ->delete();

        return $this->savedResponse('Department authorisation removed.', [
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
        $assignmentOnlyUsers = DB::table('internalstockauthusers')
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

        $authorizations = DB::table('internalstockauthusers as auth')
            ->leftJoin('www_users as wu', function ($join) {
                $join->on(DB::raw('BINARY wu.userid'), '=', DB::raw('BINARY auth.userid'));
            })
            ->leftJoin('locations as loc', function ($join) {
                $join->on(DB::raw('BINARY loc.loccode'), '=', DB::raw('BINARY auth.loccode'));
            })
            ->select(
                'auth.userid',
                'auth.loccode',
                'auth.locationname',
                'auth.cancreate',
                'auth.canauthorise',
                'auth.canfullfill',
                DB::raw('COALESCE(wu.realname, auth.userid) as user_name'),
                DB::raw('COALESCE(wu.email, "") as user_email'),
                DB::raw('COALESCE(wu.blocked, 0) as user_blocked'),
                DB::raw('CASE WHEN wu.userid IS NULL THEN 1 ELSE 0 END as user_missing_record'),
                DB::raw('COALESCE(loc.locationname, auth.locationname, auth.loccode) as location_name')
            )
            ->orderBy('location_name')
            ->orderBy('user_name')
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
                    'canCreate' => (int) $row->cancreate === 1,
                    'canAuthorise' => (int) $row->canauthorise === 1,
                    'canFulfill' => (int) $row->canfullfill === 1,
                ];
            })
            ->values();

        $selectedLocationCode = (string) ($selected['locationCode'] ?? $locations->first()['code'] ?? $authorizations->first()['locationCode'] ?? '');
        $selectedUserId = (string) ($selected['userId'] ?? $users->first()['userId'] ?? $authorizations->first()['userId'] ?? '');

        return [
            'users' => $users,
            'locations' => $locations,
            'authorizations' => $authorizations,
            'defaults' => [
                'userId' => $selectedUserId,
                'locationCode' => $selectedLocationCode,
                'canCreate' => true,
                'canAuthorise' => true,
                'canFulfill' => true,
            ],
            'stats' => [
                'users' => $users->count(),
                'locations' => $locations->count(),
                'authorizations' => $authorizations->count(),
                'locationsWithUsers' => $authorizations->pluck('locationCode')->uniqueStrict()->count(),
                'createAccess' => $authorizations->where('canCreate', true)->count(),
                'authoriseAccess' => $authorizations->where('canAuthorise', true)->count(),
                'fulfillAccess' => $authorizations->where('canFulfill', true)->count(),
            ],
        ];
    }

    private function emptyPayload(): array
    {
        return [
            'users' => [],
            'locations' => [],
            'authorizations' => [],
            'defaults' => [
                'userId' => '',
                'locationCode' => '',
                'canCreate' => true,
                'canAuthorise' => true,
                'canFulfill' => true,
            ],
            'stats' => [
                'users' => 0,
                'locations' => 0,
                'authorizations' => 0,
                'locationsWithUsers' => 0,
                'createAccess' => 0,
                'authoriseAccess' => 0,
                'fulfillAccess' => 0,
            ],
        ];
    }

    private function prepareRequest(Request $request): void
    {
        $request->merge([
            'userId' => trim((string) $request->input('userId', '')),
            'locationCode' => strtoupper(trim((string) $request->input('locationCode', ''))),
            'canCreate' => filter_var($request->input('canCreate', true), FILTER_VALIDATE_BOOLEAN),
            'canAuthorise' => filter_var($request->input('canAuthorise', true), FILTER_VALIDATE_BOOLEAN),
            'canFulfill' => filter_var($request->input('canFulfill', true), FILTER_VALIDATE_BOOLEAN),
        ]);
    }

    private function validator(Request $request, bool $updating = false)
    {
        $rules = [
            'userId' => ['required', 'string', 'max:20'],
            'locationCode' => $updating ? ['required', 'string', 'max:5'] : ['required', 'string', 'max:5', Rule::exists('locations', 'loccode')],
            'canCreate' => ['required', 'boolean'],
            'canAuthorise' => ['required', 'boolean'],
            'canFulfill' => ['required', 'boolean'],
        ];

        $validator = Validator::make($request->all(), $rules);
        $validator->after(function ($validator) use ($request, $updating) {
            if (!$updating && !$this->knownUserExists((string) $request->input('userId'))) {
                $validator->errors()->add('userId', 'The selected user was not found.');
            }

            if (!$updating && $this->authorizationConflicts((string) $request->input('userId'), (string) $request->input('locationCode'))) {
                $validator->errors()->add('locationCode', 'This user is already authorised for the selected location.');
            }
        });

        return $validator;
    }

    private function normalizedData(array $data): array
    {
        return [
            'userId' => (string) $data['userId'],
            'locationCode' => strtoupper((string) $data['locationCode']),
            'canCreate' => filter_var($data['canCreate'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'canAuthorise' => filter_var($data['canAuthorise'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'canFulfill' => filter_var($data['canFulfill'] ?? true, FILTER_VALIDATE_BOOLEAN),
        ];
    }

    private function authorizationExistsExact(string $userId, string $locationCode): bool
    {
        if (!$this->hasRequiredTables()) {
            return false;
        }

        return DB::table('internalstockauthusers')
            ->whereRaw('BINARY userid = ?', [$userId])
            ->whereRaw('BINARY loccode = ?', [strtoupper($locationCode)])
            ->exists();
    }

    private function authorizationConflicts(string $userId, string $locationCode): bool
    {
        if (!$this->hasRequiredTables()) {
            return false;
        }

        return DB::table('internalstockauthusers')
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
            || DB::table('internalstockauthusers')->whereRaw('BINARY userid = ?', [$userId])->exists();
    }

    private function hasRequiredTables(): bool
    {
        foreach (['internalstockauthusers', 'locations', 'www_users'] as $table) {
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
            'message' => 'Department authorisation maintenance is not available.',
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
