<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class SalesCategoryController extends Controller
{
    public function index()
    {
        if (!Schema::hasTable('salescat')) {
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
        if (!Schema::hasTable('salescat')) {
            return response()->json([
                'success' => false,
                'message' => 'Sales categories are not available.',
            ], 503);
        }

        $this->prepareRequest($request);
        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();
        $id = DB::table('salescat')->insertGetId([
            'salescatname' => trim((string) $data['name']),
            'parentcatid' => $this->parentValue($data['parentId'] ?? null),
            'active' => $data['active'] ? 1 : 0,
        ], 'salescatid');

        return $this->savedResponse('Sales category created.', (int) $id, 201);
    }

    public function update(Request $request, string $id)
    {
        $id = (int) $id;
        if (!Schema::hasTable('salescat') || !$this->exists($id)) {
            return response()->json([
                'success' => false,
                'message' => 'Sales category was not found.',
            ], 404);
        }

        $this->prepareRequest($request);
        $validator = $this->validator($request, $id);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();
        $parentId = $this->parentValue($data['parentId'] ?? null);
        if ($parentId !== null && $this->wouldCreateCycle($id, $parentId)) {
            return response()->json([
                'success' => false,
                'message' => 'A category cannot be moved under itself or one of its subcategories.',
            ], 422);
        }

        DB::table('salescat')->where('salescatid', $id)->update([
            'salescatname' => trim((string) $data['name']),
            'parentcatid' => $parentId,
            'active' => $data['active'] ? 1 : 0,
        ]);

        return $this->savedResponse('Sales category updated.', $id);
    }

    public function destroy(string $id)
    {
        $id = (int) $id;
        if (!Schema::hasTable('salescat') || !$this->exists($id)) {
            return response()->json([
                'success' => false,
                'message' => 'Sales category was not found.',
            ], 404);
        }

        $blockers = [];
        $this->addBlocker($blockers, 'Product links', $this->productCount($id));
        $this->addBlocker($blockers, 'Subcategories', DB::table('salescat')->where('parentcatid', $id)->count());

        if ($blockers !== []) {
            return response()->json([
                'success' => false,
                'message' => 'Sales category cannot be deleted because it is in use.',
                'dependencies' => $blockers,
            ], 409);
        }

        DB::table('salescat')->where('salescatid', $id)->delete();

        return $this->savedResponse('Sales category deleted.', $id);
    }

    private function payload(): array
    {
        $rows = DB::table('salescat as sc')
            ->leftJoin('salescat as parent', 'parent.salescatid', '=', 'sc.parentcatid')
            ->select(
                'sc.salescatid',
                'sc.parentcatid',
                'sc.salescatname',
                'sc.active',
                DB::raw('COALESCE(parent.salescatname, "") as parent_name')
            )
            ->orderBy('sc.salescatname')
            ->get();

        $productCounts = $this->productCounts();
        $childCounts = DB::table('salescat')
            ->select('parentcatid', DB::raw('COUNT(*) as children'))
            ->whereNotNull('parentcatid')
            ->groupBy('parentcatid')
            ->pluck('children', 'parentcatid');

        $categories = $rows->map(function ($row) use ($productCounts, $childCounts, $rows) {
            $id = (int) $row->salescatid;
            $parentId = $row->parentcatid === null || (int) $row->parentcatid === 0 ? null : (int) $row->parentcatid;
            return [
                'id' => $id,
                'name' => (string) ($row->salescatname ?? ''),
                'parentId' => $parentId,
                'parentName' => $parentId === null ? '' : (string) ($row->parent_name ?? ''),
                'active' => (int) $row->active === 1,
                'productCount' => (int) ($productCounts[$id] ?? 0),
                'childCount' => (int) ($childCounts[$id] ?? 0),
                'path' => $this->pathFor($rows, $id),
            ];
        })->values();

        return [
            'categories' => $categories,
            'lookups' => [
                'parents' => $categories->map(function ($row) {
                    return ['code' => (string) $row['id'], 'name' => $row['path']];
                })->values(),
            ],
            'stats' => [
                'total' => $categories->count(),
                'active' => $categories->where('active', true)->count(),
                'inactive' => $categories->where('active', false)->count(),
                'productLinks' => array_sum($productCounts),
            ],
        ];
    }

    private function emptyPayload(): array
    {
        return [
            'categories' => [],
            'lookups' => ['parents' => []],
            'stats' => ['total' => 0, 'active' => 0, 'inactive' => 0, 'productLinks' => 0],
        ];
    }

    private function prepareRequest(Request $request): void
    {
        $request->merge([
            'name' => trim((string) $request->input('name', '')),
            'parentId' => $request->input('parentId') === '' ? null : $request->input('parentId'),
            'active' => filter_var($request->input('active', true), FILTER_VALIDATE_BOOLEAN),
        ]);
    }

    private function validator(Request $request, ?int $id = null)
    {
        return Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:50'],
            'parentId' => ['nullable', 'integer', Rule::exists('salescat', 'salescatid')->where(function ($query) use ($id) {
                if ($id !== null) {
                    $query->where('salescatid', '<>', $id);
                }
            })],
            'active' => ['required', 'boolean'],
        ]);
    }

    private function parentValue($value): ?int
    {
        if ($value === null || $value === '' || (int) $value === 0) {
            return null;
        }

        return (int) $value;
    }

    private function exists(int $id): bool
    {
        return DB::table('salescat')->where('salescatid', $id)->exists();
    }

    private function productCount(int $id): int
    {
        if (!Schema::hasTable('salescatprod')) {
            return 0;
        }

        return DB::table('salescatprod')->where('salescatid', $id)->count();
    }

    private function productCounts(): array
    {
        if (!Schema::hasTable('salescatprod')) {
            return [];
        }

        return DB::table('salescatprod')
            ->select('salescatid', DB::raw('COUNT(*) as products'))
            ->groupBy('salescatid')
            ->pluck('products', 'salescatid')
            ->map(fn ($count) => (int) $count)
            ->all();
    }

    private function pathFor($rows, int $id): string
    {
        $byId = $rows->keyBy('salescatid');
        $names = [];
        $seen = [];
        $current = $id;

        while ($current && isset($byId[$current]) && !isset($seen[$current])) {
            $seen[$current] = true;
            $row = $byId[$current];
            array_unshift($names, (string) ($row->salescatname ?? $current));
            $current = $row->parentcatid === null || (int) $row->parentcatid === 0 ? 0 : (int) $row->parentcatid;
        }

        return implode(' / ', $names);
    }

    private function wouldCreateCycle(int $id, int $parentId): bool
    {
        $current = $parentId;
        $seen = [];
        while ($current !== 0 && !isset($seen[$current])) {
            if ($current === $id) {
                return true;
            }
            $seen[$current] = true;
            $parent = DB::table('salescat')->where('salescatid', $current)->value('parentcatid');
            $current = $parent === null || (int) $parent === 0 ? 0 : (int) $parent;
        }

        return false;
    }

    private function addBlocker(array &$blockers, string $name, int $count): void
    {
        if ($count > 0) {
            $blockers[] = ['name' => $name, 'count' => $count];
        }
    }

    private function validationResponse($validator)
    {
        return response()->json([
            'success' => false,
            'message' => 'Validation failed.',
            'errors' => $validator->errors(),
        ], 422);
    }

    private function savedResponse(string $message, int $selectedId, int $status = 200)
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => array_merge($this->payload(), ['selectedId' => $selectedId]),
        ], $status);
    }
}
