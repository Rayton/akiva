<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class InventorySetupController extends Controller
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
        $entity = $this->normalizeEntity($entity);
        $this->prepareRequest($request, $entity);

        $validator = $this->validator($request, $entity, null);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();

        if ($entity === 'stock-categories') {
            DB::table('stockcategory')->insert([
                'categoryid' => (string) $data['code'],
                'categorydescription' => trim((string) $data['name']),
                'stocktype' => (string) $data['stockType'],
                'stockact' => (string) $data['stockAct'],
                'adjglact' => (string) $data['adjustmentAct'],
                'issueglact' => (string) $data['issueAct'],
                'purchpricevaract' => (string) $data['purchasePriceVarianceAct'],
                'materialuseagevarac' => (string) $data['materialUsageVarianceAct'],
                'wipact' => (string) $data['wipAct'],
                'defaulttaxcatid' => (int) $data['defaultTaxCategoryId'],
            ]);

            return $this->savedResponse('Stock category created.', (string) $data['code'], 201);
        }

        if ($entity === 'locations') {
            DB::table('locations')->insert($this->locationPayload($data));

            return $this->savedResponse('Inventory location created.', (string) $data['code'], 201);
        }

        if ($entity === 'discount-categories') {
            DB::table('discountcategories')->insert([
                'code' => (string) $data['code'],
                'name' => trim((string) $data['name']),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return $this->savedResponse('Discount category created.', (string) $data['code'], 201);
        }

        $id = DB::table('unitsofmeasure')->insertGetId([
            'unitname' => trim((string) $data['name']),
        ], 'unitid');

        return $this->savedResponse('Unit of measure created.', $id, 201);
    }

    public function update(Request $request, string $entity, string $id)
    {
        $entity = $this->normalizeEntity($entity);
        $id = $this->normalizeId($entity, $id);
        $this->prepareRequest($request, $entity, $id);

        if (!$this->entityExists($entity, $id)) {
            return response()->json([
                'success' => false,
                'message' => $this->entityLabel($entity) . ' was not found.',
            ], 404);
        }

        $validator = $this->validator($request, $entity, $id);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();

        if ($entity === 'stock-categories') {
            DB::table('stockcategory')->where('categoryid', $id)->update([
                'categorydescription' => trim((string) $data['name']),
                'stocktype' => (string) $data['stockType'],
                'stockact' => (string) $data['stockAct'],
                'adjglact' => (string) $data['adjustmentAct'],
                'issueglact' => (string) $data['issueAct'],
                'purchpricevaract' => (string) $data['purchasePriceVarianceAct'],
                'materialuseagevarac' => (string) $data['materialUsageVarianceAct'],
                'wipact' => (string) $data['wipAct'],
                'defaulttaxcatid' => (int) $data['defaultTaxCategoryId'],
            ]);

            return $this->savedResponse('Stock category updated.', $id);
        }

        if ($entity === 'locations') {
            DB::table('locations')->where('loccode', $id)->update($this->locationPayload($data, true));

            return $this->savedResponse('Inventory location updated.', $id);
        }

        if ($entity === 'discount-categories') {
            DB::table('discountcategories')->updateOrInsert(
                ['code' => $id],
                ['name' => trim((string) $data['name']), 'updated_at' => now(), 'created_at' => now()]
            );

            return $this->savedResponse('Discount category updated.', $id);
        }

        DB::table('unitsofmeasure')->where('unitid', (int) $id)->update([
            'unitname' => trim((string) $data['name']),
        ]);

        return $this->savedResponse('Unit of measure updated.', (int) $id);
    }

    public function destroy(string $entity, string $id)
    {
        $entity = $this->normalizeEntity($entity);
        $id = $this->normalizeId($entity, $id);

        if (!$this->entityExists($entity, $id)) {
            return response()->json([
                'success' => false,
                'message' => $this->entityLabel($entity) . ' was not found.',
            ], 404);
        }

        $blockers = $this->deleteBlockers($entity, $id);
        if ($blockers !== []) {
            return response()->json([
                'success' => false,
                'message' => $this->entityLabel($entity) . ' cannot be deleted because it is in use.',
                'dependencies' => $blockers,
            ], 409);
        }

        if ($entity === 'stock-categories') {
            DB::table('stockcategory')->where('categoryid', $id)->delete();
        } elseif ($entity === 'locations') {
            DB::table('locations')->where('loccode', $id)->delete();
        } elseif ($entity === 'discount-categories') {
            DB::table('discountcategories')->where('code', $id)->delete();
        } else {
            DB::table('unitsofmeasure')->where('unitid', (int) $id)->delete();
        }

        return $this->savedResponse($this->entityLabel($entity) . ' deleted.', $id);
    }

    private function payload(): array
    {
        $stockCategories = DB::table('stockcategory')
            ->select('categoryid', 'categorydescription', 'stocktype', 'stockact', 'adjglact', 'issueglact', 'purchpricevaract', 'materialuseagevarac', 'wipact', 'defaulttaxcatid')
            ->orderBy('categoryid')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->categoryid,
                    'name' => (string) $row->categorydescription,
                    'stockType' => (string) $row->stocktype,
                    'stockAct' => (string) $row->stockact,
                    'adjustmentAct' => (string) $row->adjglact,
                    'issueAct' => (string) $row->issueglact,
                    'purchasePriceVarianceAct' => (string) $row->purchpricevaract,
                    'materialUsageVarianceAct' => (string) $row->materialuseagevarac,
                    'wipAct' => (string) $row->wipact,
                    'defaultTaxCategoryId' => (int) $row->defaulttaxcatid,
                ];
            })
            ->values();

        $locations = DB::table('locations')
            ->select('loccode', 'locationname', 'deladd1', 'deladd2', 'deladd3', 'deladd4', 'deladd5', 'deladd6', 'tel', 'fax', 'email', 'contact', 'taxprovinceid', 'managed', 'internalrequest', 'usedforwo', 'glaccountcode', 'allowinvoicing')
            ->orderBy('loccode')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->loccode,
                    'name' => (string) ($row->locationname ?? ''),
                    'address1' => (string) ($row->deladd1 ?? ''),
                    'address2' => (string) ($row->deladd2 ?? ''),
                    'address3' => (string) ($row->deladd3 ?? ''),
                    'address4' => (string) ($row->deladd4 ?? ''),
                    'address5' => (string) ($row->deladd5 ?? ''),
                    'address6' => (string) ($row->deladd6 ?? ''),
                    'telephone' => (string) ($row->tel ?? ''),
                    'fax' => (string) ($row->fax ?? ''),
                    'email' => (string) ($row->email ?? ''),
                    'contact' => (string) ($row->contact ?? ''),
                    'taxProvinceId' => (int) $row->taxprovinceid,
                    'managed' => (int) $row->managed === 1,
                    'internalRequest' => (int) $row->internalrequest === 1,
                    'usedForWorkOrders' => (int) $row->usedforwo === 1,
                    'glAccountCode' => (string) ($row->glaccountcode ?? ''),
                    'allowInvoicing' => (int) $row->allowinvoicing === 1,
                ];
            })
            ->values();

        $discountCategories = $this->discountCategories();

        $units = DB::table('unitsofmeasure')
            ->select('unitid', 'unitname')
            ->orderBy('unitname')
            ->get()
            ->map(static function ($row) {
                return [
                    'id' => (int) $row->unitid,
                    'name' => (string) $row->unitname,
                ];
            })
            ->values();

        return [
            'stockCategories' => $stockCategories,
            'locations' => $locations,
            'discountCategories' => $discountCategories,
            'unitsOfMeasure' => $units,
            'lookups' => [
                'accounts' => $this->lookupRows('chartmaster', 'accountcode', 'accountname', 'accountcode'),
                'taxCategories' => $this->lookupRows('taxcategories', 'taxcatid', 'taxcatname', 'taxcatid'),
                'taxProvinces' => $this->lookupRows('taxprovinces', 'taxprovinceid', 'taxprovincename', 'taxprovinceid'),
            ],
            'stats' => [
                'stockCategories' => $stockCategories->count(),
                'locations' => $locations->count(),
                'discountCategories' => $discountCategories->count(),
                'unitsOfMeasure' => $units->count(),
                'stockItems' => DB::table('stockmaster')->count(),
            ],
        ];
    }

    private function discountCategories()
    {
        if (!Schema::hasTable('discountcategories')) {
            return collect();
        }

        return DB::table('discountcategories')
            ->select('code', 'name')
            ->orderBy('code')
            ->get()
            ->map(function ($row) {
                $code = (string) $row->code;
                return [
                    'code' => $code,
                    'name' => (string) $row->name,
                    'stockItemCount' => DB::table('stockmaster')->where('discountcategory', $code)->count(),
                    'discountMatrixCount' => DB::table('discountmatrix')->where('discountcategory', $code)->count(),
                ];
            })
            ->values();
    }

    private function prepareRequest(Request $request, string $entity, ?string $id = null): void
    {
        $request->merge([
            'code' => strtoupper(str_replace(' ', '', trim((string) $request->input('code', $id ?? '')))),
            'name' => trim((string) $request->input('name', '')),
            'stockType' => strtoupper(trim((string) $request->input('stockType', 'F'))),
            'stockAct' => trim((string) $request->input('stockAct', '0')),
            'adjustmentAct' => trim((string) $request->input('adjustmentAct', '0')),
            'issueAct' => trim((string) $request->input('issueAct', '0')),
            'purchasePriceVarianceAct' => trim((string) $request->input('purchasePriceVarianceAct', '80000')),
            'materialUsageVarianceAct' => trim((string) $request->input('materialUsageVarianceAct', '80000')),
            'wipAct' => trim((string) $request->input('wipAct', '0')),
            'defaultTaxCategoryId' => (int) $request->input('defaultTaxCategoryId', 1),
            'address1' => trim((string) $request->input('address1', '')),
            'address2' => trim((string) $request->input('address2', '')),
            'address3' => trim((string) $request->input('address3', '')),
            'address4' => trim((string) $request->input('address4', '')),
            'address5' => trim((string) $request->input('address5', '')),
            'address6' => trim((string) $request->input('address6', '')),
            'telephone' => trim((string) $request->input('telephone', '')),
            'fax' => trim((string) $request->input('fax', '')),
            'email' => trim((string) $request->input('email', '')),
            'contact' => trim((string) $request->input('contact', '')),
            'taxProvinceId' => (int) $request->input('taxProvinceId', 1),
            'managed' => filter_var($request->input('managed', false), FILTER_VALIDATE_BOOLEAN),
            'internalRequest' => filter_var($request->input('internalRequest', true), FILTER_VALIDATE_BOOLEAN),
            'usedForWorkOrders' => filter_var($request->input('usedForWorkOrders', true), FILTER_VALIDATE_BOOLEAN),
            'glAccountCode' => trim((string) $request->input('glAccountCode', '')),
            'allowInvoicing' => filter_var($request->input('allowInvoicing', true), FILTER_VALIDATE_BOOLEAN),
        ]);
    }

    private function normalizeEntity(string $entity): string
    {
        $key = strtolower(str_replace('_', '-', trim($entity)));
        if (in_array($key, ['stock-categories', 'stockcategories'], true)) return 'stock-categories';
        if ($key === 'locations') return 'locations';
        if (in_array($key, ['discount-categories', 'discountcategories'], true)) return 'discount-categories';
        if (in_array($key, ['units-of-measure', 'unitsofmeasure'], true)) return 'units-of-measure';
        abort(404, 'Unknown setup area.');
    }

    private function normalizeId(string $entity, string $id): string
    {
        $id = trim(rawurldecode($id));
        return in_array($entity, ['stock-categories', 'locations', 'discount-categories'], true) ? strtoupper($id) : $id;
    }

    private function validator(Request $request, string $entity, ?string $id)
    {
        if ($entity === 'stock-categories') {
            $codeRules = ['required', 'string', 'max:6', 'regex:/^[A-Za-z0-9_]+$/'];
            $codeRules[] = $id === null ? Rule::unique('stockcategory', 'categoryid') : Rule::in([$id]);

            return Validator::make($request->all(), [
                'code' => $codeRules,
                'name' => ['required', 'string', 'max:20'],
                'stockType' => ['required', Rule::in(['F', 'D', 'L', 'M'])],
                'stockAct' => ['required', 'string', 'max:20'],
                'adjustmentAct' => ['required', 'string', 'max:20'],
                'issueAct' => ['required', 'string', 'max:20'],
                'purchasePriceVarianceAct' => ['required', 'string', 'max:20'],
                'materialUsageVarianceAct' => ['required', 'string', 'max:20'],
                'wipAct' => ['required', 'string', 'max:20'],
                'defaultTaxCategoryId' => ['required', 'integer', Rule::exists('taxcategories', 'taxcatid')],
            ]);
        }

        if ($entity === 'locations') {
            $codeRules = ['required', 'string', 'max:5', 'regex:/^[A-Za-z0-9_]+$/'];
            $codeRules[] = $id === null ? Rule::unique('locations', 'loccode') : Rule::in([$id]);

            return Validator::make($request->all(), [
                'code' => $codeRules,
                'name' => ['required', 'string', 'max:255'],
                'address1' => ['nullable', 'string', 'max:255'],
                'address2' => ['nullable', 'string', 'max:255'],
                'address3' => ['nullable', 'string', 'max:255'],
                'address4' => ['nullable', 'string', 'max:255'],
                'address5' => ['nullable', 'string', 'max:255'],
                'address6' => ['nullable', 'string', 'max:255'],
                'telephone' => ['nullable', 'string', 'max:30'],
                'fax' => ['nullable', 'string', 'max:255'],
                'email' => ['nullable', 'email', 'max:255'],
                'contact' => ['nullable', 'string', 'max:255'],
                'taxProvinceId' => ['required', 'integer', Rule::exists('taxprovinces', 'taxprovinceid')],
                'managed' => ['required', 'boolean'],
                'internalRequest' => ['required', 'boolean'],
                'usedForWorkOrders' => ['required', 'boolean'],
                'glAccountCode' => ['nullable', 'string', 'max:255'],
                'allowInvoicing' => ['required', 'boolean'],
            ]);
        }

        if ($entity === 'discount-categories') {
            $codeRules = ['required', 'string', 'max:2', 'regex:/^[A-Za-z0-9_]+$/'];
            $codeRules[] = $id === null ? Rule::unique('discountcategories', 'code') : Rule::in([$id]);

            return Validator::make($request->all(), [
                'code' => $codeRules,
                'name' => ['required', 'string', 'max:40'],
            ]);
        }

        $nameRules = ['required', 'string', 'max:15'];
        $nameRules[] = $id === null
            ? Rule::unique('unitsofmeasure', 'unitname')
            : Rule::unique('unitsofmeasure', 'unitname')->ignore((int) $id, 'unitid');

        return Validator::make($request->all(), ['name' => $nameRules]);
    }

    private function entityExists(string $entity, string $id): bool
    {
        if ($entity === 'stock-categories') return DB::table('stockcategory')->where('categoryid', $id)->exists();
        if ($entity === 'locations') return DB::table('locations')->where('loccode', $id)->exists();
        if ($entity === 'discount-categories') return Schema::hasTable('discountcategories') && DB::table('discountcategories')->where('code', $id)->exists();
        return DB::table('unitsofmeasure')->where('unitid', (int) $id)->exists();
    }

    private function deleteBlockers(string $entity, string $id): array
    {
        $blockers = [];
        if ($entity === 'stock-categories') {
            $this->addBlocker($blockers, 'Stock items', DB::table('stockmaster')->where('categoryid', $id)->count());
            $this->addBlocker($blockers, 'Sales GL postings', DB::table('salesglpostings')->where('stkcat', $id)->count());
            $this->addBlocker($blockers, 'COGS GL postings', DB::table('cogsglpostings')->where('stkcat', $id)->count());
            $this->addBlocker($blockers, 'Category properties', DB::table('stockcatproperties')->where('categoryid', $id)->count());
        } elseif ($entity === 'locations') {
            $this->addBlocker($blockers, 'Location stock balances', DB::table('locstock')->where('loccode', $id)->count());
            $this->addBlocker($blockers, 'Stock movements', DB::table('stockmoves')->where('loccode', $id)->count());
            $this->addBlocker($blockers, 'Location users', DB::table('locationusers')->where('loccode', $id)->count());
            $this->addBlocker($blockers, 'Customer branches', DB::table('custbranch')->where('defaultlocation', $id)->count());
            $this->addBlocker($blockers, 'System users', DB::table('www_users')->where('defaultlocation', $id)->count());
        } elseif ($entity === 'discount-categories') {
            $this->addBlocker($blockers, 'Stock items', DB::table('stockmaster')->where('discountcategory', $id)->count());
            $this->addBlocker($blockers, 'Discount matrix rows', DB::table('discountmatrix')->where('discountcategory', $id)->count());
        } elseif ($entity === 'units-of-measure') {
            $unitName = (string) DB::table('unitsofmeasure')->where('unitid', (int) $id)->value('unitname');
            $this->addBlocker($blockers, 'Stock items', DB::table('stockmaster')->where('units', $unitName)->count());
        }
        return $blockers;
    }

    private function locationPayload(array $data, bool $forUpdate = false): array
    {
        $payload = [
            'locationname' => trim((string) $data['name']),
            'deladd1' => (string) ($data['address1'] ?? ''),
            'deladd2' => (string) ($data['address2'] ?? ''),
            'deladd3' => (string) ($data['address3'] ?? ''),
            'deladd4' => (string) ($data['address4'] ?? ''),
            'deladd5' => (string) ($data['address5'] ?? ''),
            'deladd6' => (string) ($data['address6'] ?? ''),
            'tel' => (string) ($data['telephone'] ?? ''),
            'fax' => (string) ($data['fax'] ?? ''),
            'email' => (string) ($data['email'] ?? ''),
            'contact' => (string) ($data['contact'] ?? ''),
            'taxprovinceid' => (int) $data['taxProvinceId'],
            'managed' => $data['managed'] ? 1 : 0,
            'internalrequest' => $data['internalRequest'] ? 1 : 0,
            'usedforwo' => $data['usedForWorkOrders'] ? 1 : 0,
            'glaccountcode' => (string) ($data['glAccountCode'] ?? ''),
            'allowinvoicing' => $data['allowInvoicing'] ? 1 : 0,
        ];

        if (!$forUpdate) {
            $payload['loccode'] = (string) $data['code'];
            $payload['cashsalecustomer'] = '';
            $payload['cashsalebranch'] = '';
        }

        return $payload;
    }

    private function lookupRows(string $table, string $codeColumn, string $nameColumn, string $orderColumn)
    {
        return DB::table($table)
            ->select($codeColumn, $nameColumn)
            ->orderBy($orderColumn)
            ->get()
            ->map(static function ($row) use ($codeColumn, $nameColumn) {
                return [
                    'code' => (string) $row->{$codeColumn},
                    'name' => (string) $row->{$nameColumn},
                ];
            })
            ->values();
    }

    private function addBlocker(array &$blockers, string $name, $count): void
    {
        $count = (int) $count;
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

    private function savedResponse(string $message, $selectedId, int $status = 200)
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => array_merge($this->payload(), ['selectedId' => $selectedId]),
        ], $status);
    }

    private function entityLabel(string $entity): string
    {
        return [
            'stock-categories' => 'Stock category',
            'locations' => 'Inventory location',
            'discount-categories' => 'Discount category',
            'units-of-measure' => 'Unit of measure',
        ][$entity] ?? 'Setup record';
    }
}
