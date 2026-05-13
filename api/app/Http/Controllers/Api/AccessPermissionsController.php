<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class AccessPermissionsController extends Controller
{
    public function index()
    {
        return response()->json([
            'success' => true,
            'data' => $this->payload(),
        ]);
    }

    public function store(Request $request)
    {
        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();
        $roleId = DB::transaction(function () use ($data) {
            $roleId = (int) DB::table('securityroles')->insertGetId([
                'secrolename' => trim((string) $data['name']),
            ], 'secroleid');

            $this->syncTokens($roleId, $data['tokenIds'] ?? []);

            return $roleId;
        });

        return response()->json([
            'success' => true,
            'message' => 'Access role created.',
            'data' => array_merge($this->payload(), [
                'selectedRoleId' => $roleId,
            ]),
        ], 201);
    }

    public function update(Request $request, int $roleId)
    {
        if (!DB::table('securityroles')->where('secroleid', $roleId)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Access role was not found.',
            ], 404);
        }

        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();

        DB::transaction(function () use ($data, $roleId) {
            DB::table('securityroles')
                ->where('secroleid', $roleId)
                ->update(['secrolename' => trim((string) $data['name'])]);

            $this->syncTokens($roleId, $data['tokenIds'] ?? []);
        });

        return response()->json([
            'success' => true,
            'message' => 'Access role updated.',
            'data' => array_merge($this->payload(), [
                'selectedRoleId' => $roleId,
            ]),
        ]);
    }

    public function destroy(int $roleId)
    {
        $role = DB::table('securityroles')->where('secroleid', $roleId)->first();
        if (!$role) {
            return response()->json([
                'success' => false,
                'message' => 'Access role was not found.',
            ], 404);
        }

        $userCount = DB::table('www_users')->where('fullaccess', $roleId)->count();
        if ($userCount > 0) {
            return response()->json([
                'success' => false,
                'message' => "Cannot delete this access role because {$userCount} user account(s) use it.",
            ], 422);
        }

        DB::transaction(function () use ($roleId) {
            DB::table('securitygroups')->where('secroleid', $roleId)->delete();
            DB::table('securityroles')->where('secroleid', $roleId)->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Access role deleted.',
            'data' => $this->payload(),
        ]);
    }

    private function validator(Request $request)
    {
        return Validator::make($request->all(), [
            'name' => ['required', 'string', 'min:4', 'max:40'],
            'tokenIds' => ['present', 'array'],
            'tokenIds.*' => ['integer', Rule::exists('securitytokens', 'tokenid')],
        ], [
            'name.min' => 'Access role name must be at least 4 characters.',
        ]);
    }

    private function validationResponse($validator)
    {
        return response()->json([
            'success' => false,
            'message' => 'Validation failed.',
            'errors' => $validator->errors(),
        ], 422);
    }

    private function syncTokens(int $roleId, array $tokenIds): void
    {
        $uniqueTokenIds = collect($tokenIds)
            ->map(function ($tokenId) {
                return (int) $tokenId;
            })
            ->unique()
            ->values()
            ->all();

        DB::table('securitygroups')->where('secroleid', $roleId)->delete();

        if (count($uniqueTokenIds) === 0) {
            return;
        }

        DB::table('securitygroups')->insert(
            collect($uniqueTokenIds)
                ->map(function ($tokenId) use ($roleId) {
                    return [
                        'secroleid' => $roleId,
                        'tokenid' => $tokenId,
                    ];
                })
                ->all()
        );
    }

    private function payload(): array
    {
        $tokens = DB::table('securitytokens')
            ->select('tokenid', 'tokenname')
            ->orderBy('tokenid')
            ->get()
            ->map(function ($row) {
                return [
                    'id' => (int) $row->tokenid,
                    'name' => (string) $row->tokenname,
                ];
            })
            ->values();

        $groupsByRole = DB::table('securitygroups')
            ->select('secroleid', 'tokenid')
            ->orderBy('tokenid')
            ->get()
            ->groupBy(function ($row) {
                return (int) $row->secroleid;
            });

        $usersByRole = DB::table('www_users')
            ->select('userid', 'realname', 'email', 'phone', 'blocked', 'fullaccess')
            ->orderBy('realname')
            ->orderBy('userid')
            ->get()
            ->groupBy(function ($row) {
                return (int) $row->fullaccess;
            });

        $tokenNameById = $tokens->pluck('name', 'id');

        $roles = DB::table('securityroles')
            ->select('secroleid', 'secrolename')
            ->orderBy('secrolename')
            ->get()
            ->map(function ($row) use ($groupsByRole, $tokenNameById, $usersByRole) {
                $roleId = (int) $row->secroleid;
                $tokenIds = $groupsByRole
                    ->get($roleId, collect())
                    ->map(function ($group) {
                        return (int) $group->tokenid;
                    })
                    ->unique()
                    ->values()
                    ->all();

                $assignedUsers = $usersByRole
                    ->get($roleId, collect())
                    ->map(function ($user) {
                        return [
                            'userId' => (string) $user->userid,
                            'realName' => (string) $user->realname,
                            'email' => (string) ($user->email ?? ''),
                            'phone' => (string) ($user->phone ?? ''),
                            'blocked' => ((int) ($user->blocked ?? 0)) === 1,
                        ];
                    })
                    ->values()
                    ->all();

                return [
                    'id' => $roleId,
                    'name' => (string) $row->secrolename,
                    'tokenIds' => $tokenIds,
                    'tokenNames' => collect($tokenIds)
                        ->map(function ($tokenId) use ($tokenNameById) {
                            return (string) ($tokenNameById[$tokenId] ?? "Token {$tokenId}");
                        })
                        ->all(),
                    'assignedUsers' => $assignedUsers,
                    'userCount' => count($assignedUsers),
                    'tokenCount' => count($tokenIds),
                ];
            })
            ->values();

        return [
            'roles' => $roles->all(),
            'tokens' => $tokens->all(),
            'stats' => [
                'totalRoles' => $roles->count(),
                'rolesInUse' => $roles->filter(function ($role) {
                    return $role['userCount'] > 0;
                })->count(),
                'rolesWithTokens' => $roles->filter(function ($role) {
                    return $role['tokenCount'] > 0;
                })->count(),
                'rolesWithoutTokens' => $roles->filter(function ($role) {
                    return $role['tokenCount'] === 0;
                })->count(),
                'totalTokens' => $tokens->count(),
                'assignedLinks' => (int) DB::table('securitygroups')->count(),
            ],
        ];
    }
}
