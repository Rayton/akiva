<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class InternalStockCategoryRoleController extends Controller
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
        if ($this->assignmentConflicts($data['roleId'], $data['categoryId'])) {
            return response()->json([
                'success' => false,
                'message' => 'This stock category is already allowed for the selected security role.',
            ], 409);
        }

        DB::table('internalstockcatrole')->insert([
            'secroleid' => $data['roleId'],
            'categoryid' => $data['categoryId'],
        ]);

        return $this->savedResponse('Internal stock category role added.', $data, 201);
    }

    public function destroy(string $roleId, string $categoryId)
    {
        if (!$this->hasRequiredTables()) {
            return $this->unavailableResponse();
        }

        $roleId = (int) rawurldecode($roleId);
        $categoryId = strtoupper(trim(rawurldecode($categoryId)));

        if (!$this->assignmentExistsExact($roleId, $categoryId)) {
            return response()->json([
                'success' => false,
                'message' => 'Internal stock category role was not found.',
            ], 404);
        }

        DB::table('internalstockcatrole')
            ->where('secroleid', $roleId)
            ->whereRaw('BINARY categoryid = ?', [$categoryId])
            ->delete();

        return $this->savedResponse('Internal stock category role removed.', [
            'roleId' => $roleId,
            'categoryId' => $categoryId,
        ]);
    }

    private function payload(array $selected = []): array
    {
        $roles = DB::table('securityroles')
            ->select('secroleid', 'secrolename', 'canviewprices')
            ->orderBy('secroleid')
            ->get()
            ->map(static function ($row) {
                return [
                    'roleId' => (int) $row->secroleid,
                    'name' => html_entity_decode((string) ($row->secrolename ?: $row->secroleid)),
                    'canViewPrices' => (int) $row->canviewprices === 1,
                    'missingRoleRecord' => false,
                ];
            });

        $roleIds = $roles->pluck('roleId')->map(fn ($roleId) => (int) $roleId)->all();
        $assignmentOnlyRoles = DB::table('internalstockcatrole')
            ->orderBy('secroleid')
            ->pluck('secroleid')
            ->map(fn ($roleId) => (int) $roleId)
            ->uniqueStrict()
            ->filter(static function (int $roleId) use ($roleIds) {
                return !in_array($roleId, $roleIds, true);
            })
            ->map(static function (int $roleId) {
                return [
                    'roleId' => $roleId,
                    'name' => 'Role ' . $roleId,
                    'canViewPrices' => false,
                    'missingRoleRecord' => true,
                ];
            });

        $roles = $roles->concat($assignmentOnlyRoles)->values();

        $categories = DB::table('stockcategory')
            ->select('categoryid', 'categorydescription', 'stocktype')
            ->orderBy('categoryid')
            ->get()
            ->map(static function ($row) {
                return [
                    'categoryId' => (string) $row->categoryid,
                    'description' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
                    'stockType' => (string) $row->stocktype,
                    'missingCategoryRecord' => false,
                ];
            });

        $categoryIds = $categories->pluck('categoryId')->map(fn ($categoryId) => (string) $categoryId)->all();
        $assignmentOnlyCategories = DB::table('internalstockcatrole')
            ->orderBy('categoryid')
            ->pluck('categoryid')
            ->map(fn ($categoryId) => (string) $categoryId)
            ->uniqueStrict()
            ->filter(static function (string $categoryId) use ($categoryIds) {
                return !in_array($categoryId, $categoryIds, true);
            })
            ->map(static function (string $categoryId) {
                return [
                    'categoryId' => $categoryId,
                    'description' => $categoryId,
                    'stockType' => '',
                    'missingCategoryRecord' => true,
                ];
            });

        $categories = $categories->concat($assignmentOnlyCategories)->values();

        $assignments = DB::table('internalstockcatrole as rolecat')
            ->leftJoin('securityroles as roles', 'roles.secroleid', '=', 'rolecat.secroleid')
            ->leftJoin('stockcategory as category', function ($join) {
                $join->on(DB::raw('BINARY category.categoryid'), '=', DB::raw('BINARY rolecat.categoryid'));
            })
            ->select(
                'rolecat.secroleid',
                'rolecat.categoryid',
                DB::raw('COALESCE(roles.secrolename, CONCAT("Role ", rolecat.secroleid)) as role_name'),
                DB::raw('CASE WHEN roles.secroleid IS NULL THEN 1 ELSE 0 END as role_missing_record'),
                DB::raw('COALESCE(category.categorydescription, rolecat.categoryid) as category_description'),
                DB::raw('COALESCE(category.stocktype, "") as stock_type'),
                DB::raw('CASE WHEN category.categoryid IS NULL THEN 1 ELSE 0 END as category_missing_record')
            )
            ->orderBy('rolecat.secroleid')
            ->orderBy('rolecat.categoryid')
            ->get()
            ->map(static function ($row) {
                return [
                    'roleId' => (int) $row->secroleid,
                    'roleName' => html_entity_decode((string) $row->role_name),
                    'roleMissingRecord' => (int) $row->role_missing_record === 1,
                    'categoryId' => (string) $row->categoryid,
                    'categoryDescription' => html_entity_decode((string) $row->category_description),
                    'stockType' => (string) $row->stock_type,
                    'categoryMissingRecord' => (int) $row->category_missing_record === 1,
                ];
            })
            ->values();

        $selectedRoleId = (int) ($selected['roleId'] ?? $roles->first()['roleId'] ?? $assignments->first()['roleId'] ?? 0);
        $selectedCategoryId = (string) ($selected['categoryId'] ?? $categories->first()['categoryId'] ?? '');

        return [
            'roles' => $roles,
            'categories' => $categories,
            'assignments' => $assignments,
            'defaults' => [
                'roleId' => $selectedRoleId,
                'categoryId' => $selectedCategoryId,
            ],
            'stats' => [
                'roles' => $roles->count(),
                'categories' => $categories->count(),
                'assignments' => $assignments->count(),
                'rolesWithCategories' => $assignments->pluck('roleId')->uniqueStrict()->count(),
                'categoriesAssigned' => $assignments->pluck('categoryId')->uniqueStrict()->count(),
            ],
        ];
    }

    private function emptyPayload(): array
    {
        return [
            'roles' => [],
            'categories' => [],
            'assignments' => [],
            'defaults' => [
                'roleId' => 0,
                'categoryId' => '',
            ],
            'stats' => [
                'roles' => 0,
                'categories' => 0,
                'assignments' => 0,
                'rolesWithCategories' => 0,
                'categoriesAssigned' => 0,
            ],
        ];
    }

    private function prepareRequest(Request $request): void
    {
        $request->merge([
            'roleId' => (int) $request->input('roleId', 0),
            'categoryId' => strtoupper(trim((string) $request->input('categoryId', ''))),
        ]);
    }

    private function validator(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'roleId' => ['required', 'integer', 'min:1', Rule::exists('securityroles', 'secroleid')],
            'categoryId' => ['required', 'string', 'max:6', Rule::exists('stockcategory', 'categoryid')],
        ]);

        $validator->after(function ($validator) use ($request) {
            if ($this->assignmentConflicts((int) $request->input('roleId'), (string) $request->input('categoryId'))) {
                $validator->errors()->add('categoryId', 'This stock category is already allowed for the selected security role.');
            }
        });

        return $validator;
    }

    private function normalizedData(array $data): array
    {
        return [
            'roleId' => (int) $data['roleId'],
            'categoryId' => strtoupper((string) $data['categoryId']),
        ];
    }

    private function assignmentExistsExact(int $roleId, string $categoryId): bool
    {
        if (!$this->hasRequiredTables()) {
            return false;
        }

        return DB::table('internalstockcatrole')
            ->where('secroleid', $roleId)
            ->whereRaw('BINARY categoryid = ?', [strtoupper($categoryId)])
            ->exists();
    }

    private function assignmentConflicts(int $roleId, string $categoryId): bool
    {
        if (!$this->hasRequiredTables()) {
            return false;
        }

        return DB::table('internalstockcatrole')
            ->where('secroleid', $roleId)
            ->where('categoryid', strtoupper($categoryId))
            ->exists();
    }

    private function hasRequiredTables(): bool
    {
        foreach (['internalstockcatrole', 'securityroles', 'stockcategory'] as $table) {
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
            'message' => 'Internal stock category role maintenance is not available.',
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
