<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class SalesReceivablesSetupController extends Controller
{
    public function index()
    {
        return response()->json([
            'success' => true,
            'data' => $this->payload(),
        ]);
    }

    public function store(Request $request, string $entity)
    {
        $normalized = $this->normalizeEntity($entity);
        $request->merge([
            'code' => strtoupper(str_replace(' ', '', trim((string) $request->input('code', '')))),
            'name' => trim((string) $request->input('name', '')),
        ]);

        $validator = $this->validator($request, $normalized, null);

        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();
        if ($normalized === 'customer-types') {
            $id = DB::table('debtortype')->insertGetId([
                'typename' => trim((string) $data['name']),
            ], 'typeid');

            $this->ensureDefaultCustomerType((int) $id);

            return response()->json([
                'success' => true,
                'message' => 'Customer type created.',
                'data' => array_merge($this->payload(), ['selectedId' => $id]),
            ], 201);
        }

        $id = strtoupper(str_replace(' ', '', trim((string) $data['code'])));
        DB::table('salestypes')->insert([
            'typeabbrev' => $id,
            'sales_type' => trim((string) $data['name']),
        ]);

        $this->ensureDefaultPriceList($id);

        return response()->json([
            'success' => true,
            'message' => 'Sales type created.',
            'data' => array_merge($this->payload(), ['selectedId' => $id]),
        ], 201);
    }

    public function update(Request $request, string $entity, string $id)
    {
        $normalized = $this->normalizeEntity($entity);
        $id = strtoupper(trim($id));
        $request->merge([
            'code' => strtoupper(str_replace(' ', '', trim((string) $request->input('code', $id)))),
            'name' => trim((string) $request->input('name', '')),
        ]);

        if (!$this->entityExists($normalized, $id)) {
            return response()->json([
                'success' => false,
                'message' => $this->entityLabel($normalized) . ' was not found.',
            ], 404);
        }

        $validator = $this->validator($request, $normalized, $id);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();
        if ($normalized === 'customer-types') {
            DB::table('debtortype')
                ->where('typeid', (int) $id)
                ->update(['typename' => trim((string) $data['name'])]);

            return response()->json([
                'success' => true,
                'message' => 'Customer type updated.',
                'data' => array_merge($this->payload(), ['selectedId' => (int) $id]),
            ]);
        }

        DB::table('salestypes')
            ->where('typeabbrev', $id)
            ->update(['sales_type' => trim((string) $data['name'])]);

        return response()->json([
            'success' => true,
            'message' => 'Sales type updated.',
            'data' => array_merge($this->payload(), ['selectedId' => $id]),
        ]);
    }

    public function destroy(string $entity, string $id)
    {
        $normalized = $this->normalizeEntity($entity);
        $id = strtoupper(trim($id));

        if (!$this->entityExists($normalized, $id)) {
            return response()->json([
                'success' => false,
                'message' => $this->entityLabel($normalized) . ' was not found.',
            ], 404);
        }

        $blocked = $this->deleteBlockers($normalized, $id);
        if (count($blocked) > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot delete this ' . strtolower($this->entityLabel($normalized)) . ' because related records exist.',
                'dependencies' => $blocked,
            ], 409);
        }

        if ($normalized === 'customer-types') {
            DB::table('debtortype')->where('typeid', (int) $id)->delete();

            return response()->json([
                'success' => true,
                'message' => 'Customer type deleted.',
                'data' => $this->payload(),
            ]);
        }

        DB::transaction(function () use ($id) {
            DB::table('prices')->where('typeabbrev', $id)->delete();
            DB::table('salestypes')->where('typeabbrev', $id)->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Sales type and related prices deleted.',
            'data' => $this->payload(),
        ]);
    }

    private function payload(): array
    {
        $salesTypes = DB::table('salestypes')
            ->select('typeabbrev', 'sales_type')
            ->orderBy('typeabbrev')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->typeabbrev,
                    'name' => (string) $row->sales_type,
                ];
            })
            ->values();

        $customerTypes = DB::table('debtortype')
            ->select('typeid', 'typename')
            ->orderBy('typeid')
            ->get()
            ->map(static function ($row) {
                return [
                    'id' => (int) $row->typeid,
                    'name' => (string) $row->typename,
                ];
            })
            ->values();

        return [
            'salesTypes' => $salesTypes->all(),
            'customerTypes' => $customerTypes->all(),
            'stats' => [
                'salesTypes' => $salesTypes->count(),
                'customerTypes' => $customerTypes->count(),
                'priceRows' => DB::table('prices')->count(),
                'customers' => DB::table('debtorsmaster')->count(),
                'transactions' => DB::table('debtortrans')->count(),
            ],
        ];
    }

    private function normalizeEntity(string $entity): string
    {
        $key = strtolower(str_replace('_', '-', trim($entity)));
        if (in_array($key, ['sales-types', 'salestypes'], true)) {
            return 'sales-types';
        }
        if (in_array($key, ['customer-types', 'customertypes'], true)) {
            return 'customer-types';
        }

        abort(404, 'Unknown setup area.');
    }

    private function validator(Request $request, string $entity, ?string $id)
    {
        if ($entity === 'customer-types') {
            $nameRules = ['required', 'string', 'max:100'];
            $nameRules[] = $id === null
                ? Rule::unique('debtortype', 'typename')
                : Rule::unique('debtortype', 'typename')->ignore((int) $id, 'typeid');

            return Validator::make($request->all(), [
                'name' => $nameRules,
            ]);
        }

        $codeRules = ['required', 'string', 'max:2', 'not_in:AN'];
        $codeRules[] = $id === null ? Rule::unique('salestypes', 'typeabbrev') : Rule::in([$id]);

        return Validator::make($request->all(), [
            'code' => $codeRules,
            'name' => ['required', 'string', 'max:40'],
        ], [
            'code.not_in' => 'The sales type code cannot be AN because it is reserved by the GL interface.',
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

    private function entityExists(string $entity, string $id): bool
    {
        if ($entity === 'sales-types') {
            return DB::table('salestypes')->where('typeabbrev', strtoupper($id))->exists();
        }
        if ($entity === 'customer-types') {
            return DB::table('debtortype')->where('typeid', (int) $id)->exists();
        }
        return false;
    }

    private function deleteBlockers(string $entity, string $id): array
    {
        $blockers = [];

        if ($entity === 'customer-types') {
            $typeId = (int) $id;
            $this->addBlocker($blockers, 'Customer transactions', DB::table('debtortrans')->where('type', $typeId)->count());
            $this->addBlocker($blockers, 'Customers', DB::table('debtorsmaster')->where('typeid', $typeId)->count());
            return $blockers;
        }

        $this->addBlocker($blockers, 'Customer transactions', DB::table('debtortrans')->where('tpe', $id)->count());
        $this->addBlocker($blockers, 'Customers', DB::table('debtorsmaster')->where('salestype', $id)->count());
        $this->addBlocker($blockers, 'Recurring sales orders', DB::table('recurringsalesorders')->where('ordertype', $id)->count());
        $this->addBlocker($blockers, 'Contracts', DB::table('contracts')->where('typeabbrev', $id)->count());
        $this->addBlocker($blockers, 'Discount matrix rows', DB::table('discountmatrix')->where('salestype', $id)->count());
        return $blockers;
    }

    private function addBlocker(array &$blockers, string $name, $count): void
    {
        $count = (int) $count;
        if ($count > 0) {
            $blockers[] = ['name' => $name, 'count' => $count];
        }
    }

    private function ensureDefaultPriceList(string $fallbackCode): void
    {
        $defaultPriceList = (string) DB::table('config')
            ->where('confname', 'DefaultPriceList')
            ->value('confvalue');

        if ($defaultPriceList !== '' && DB::table('salestypes')->where('typeabbrev', $defaultPriceList)->exists()) {
            return;
        }

        DB::table('config')->updateOrInsert(
            ['confname' => 'DefaultPriceList'],
            ['confvalue' => $fallbackCode]
        );
    }

    private function ensureDefaultCustomerType(int $fallbackId): void
    {
        $defaultCustomerType = (int) DB::table('config')
            ->where('confname', 'DefaultCustomerType')
            ->value('confvalue');

        if ($defaultCustomerType > 0 && DB::table('debtortype')->where('typeid', $defaultCustomerType)->exists()) {
            return;
        }

        DB::table('config')->updateOrInsert(
            ['confname' => 'DefaultCustomerType'],
            ['confvalue' => (string) $fallbackId]
        );
    }

    private function entityLabel(string $entity): string
    {
        return [
            'sales-types' => 'Sales type',
            'customer-types' => 'Customer type',
        ][$entity] ?? 'Setup record';
    }
}
