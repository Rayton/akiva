<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class MenuAccessController extends Controller
{
    public function index()
    {
        return response()->json([
            'success' => true,
            'data' => $this->payload(),
        ]);
    }

    public function update(Request $request, string $userId)
    {
        if (!Schema::hasTable('usermenurights')) {
            return response()->json([
                'success' => false,
                'message' => 'Menu access rights table is not available.',
            ], 422);
        }

        if (!DB::table('www_users')->where('userid', $userId)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'User account was not found.',
            ], 404);
        }

        $validator = Validator::make($request->all(), [
            'allowedMenuIds' => ['present', 'array'],
            'allowedMenuIds.*' => ['integer', Rule::exists('menu', 'id')],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $allowedMenuIds = collect($validator->validated()['allowedMenuIds'] ?? [])
            ->map(function ($menuId) {
                return (int) $menuId;
            })
            ->unique()
            ->values()
            ->all();

        DB::transaction(function () use ($userId, $allowedMenuIds) {
            DB::table('usermenurights')->where('userid', $userId)->delete();

            if (count($allowedMenuIds) === 0) {
                return;
            }

            DB::table('usermenurights')->insert(
                collect($allowedMenuIds)
                    ->map(function ($menuId) use ($userId) {
                        return [
                            'userid' => $userId,
                            'menuid' => $menuId,
                            'access' => 1,
                        ];
                    })
                    ->all()
            );
        });

        return response()->json([
            'success' => true,
            'message' => 'Menu access saved.',
            'data' => array_merge($this->payload(), [
                'selectedUserId' => $userId,
            ]),
        ]);
    }

    private function payload(): array
    {
        $menuRows = DB::table('menu')
            ->select('id', 'caption', 'parent', 'href')
            ->orderBy('parent')
            ->orderBy('id')
            ->get();

        $rightsByUser = Schema::hasTable('usermenurights')
            ? DB::table('usermenurights')
                ->select('userid', 'menuid', 'access')
                ->where('access', 1)
                ->orderBy('menuid')
                ->get()
                ->groupBy(function ($right) {
                    return (string) $right->userid;
                })
            : collect();

        $users = DB::table('www_users')
            ->select('userid', 'realname', 'email', 'blocked')
            ->orderBy('realname')
            ->orderBy('userid')
            ->get()
            ->map(function ($user) use ($rightsByUser) {
                $userId = (string) $user->userid;
                $allowedMenuIds = $rightsByUser
                    ->get($userId, collect())
                    ->map(function ($right) {
                        return (int) $right->menuid;
                    })
                    ->unique()
                    ->values()
                    ->all();

                return [
                    'userId' => $userId,
                    'realName' => (string) ($user->realname ?? ''),
                    'email' => (string) ($user->email ?? ''),
                    'blocked' => ((int) ($user->blocked ?? 0)) === 1,
                    'allowedMenuIds' => $allowedMenuIds,
                    'allowedCount' => count($allowedMenuIds),
                ];
            })
            ->values();

        $menu = $this->buildMenuTree($menuRows->all());
        $assignedLinks = $users->sum(function ($user) {
            return (int) $user['allowedCount'];
        });

        return [
            'users' => $users->all(),
            'menu' => $menu,
            'stats' => [
                'totalUsers' => $users->count(),
                'usersWithAccess' => $users->filter(function ($user) {
                    return $user['allowedCount'] > 0;
                })->count(),
                'usersWithoutAccess' => $users->filter(function ($user) {
                    return $user['allowedCount'] === 0;
                })->count(),
                'blockedUsers' => $users->filter(function ($user) {
                    return $user['blocked'];
                })->count(),
                'menuItems' => $menuRows->count(),
                'assignedLinks' => (int) $assignedLinks,
            ],
        ];
    }

    private function buildMenuTree(array $items): array
    {
        $grouped = [];
        foreach ($items as $item) {
            $grouped[(int) $item->parent][] = $item;
        }

        return $this->buildMenuNodes($grouped, -1, '');
    }

    private function buildMenuNodes(array &$grouped, int $parentId, string $parentPath): array
    {
        if (!isset($grouped[$parentId])) {
            return [];
        }

        $nodes = [];
        foreach ($grouped[$parentId] as $item) {
            $caption = trim((string) $item->caption);
            $path = $parentPath === '' ? $caption : $parentPath . ' / ' . $caption;

            $nodes[] = [
                'id' => (int) $item->id,
                'caption' => $caption,
                'parent' => (int) $item->parent,
                'href' => (string) ($item->href ?? '#'),
                'path' => $path,
                'children' => $this->buildMenuNodes($grouped, (int) $item->id, $path),
            ];
        }

        return $nodes;
    }
}
