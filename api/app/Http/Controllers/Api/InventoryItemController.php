<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class InventoryItemController extends Controller
{
    public function workbench(Request $request)
    {
        if (!Schema::hasTable('stockmaster')) {
            return response()->json([
                'success' => true,
                'data' => [
                    'items' => [],
                    'lookups' => $this->lookups(),
                    'stats' => $this->emptyStats(),
                ],
            ]);
        }

        try {
            return response()->json([
                'success' => true,
                'data' => $this->payload($request),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Inventory items could not be loaded.',
            ], 500);
        }
    }

    public function store(Request $request)
    {
        if (!Schema::hasTable('stockmaster')) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory item maintenance is not available.',
            ], 503);
        }

        $this->prepareRequest($request);
        $validator = $this->validator($request, null);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();

        try {
            DB::table('stockmaster')->insert($this->stockmasterPayload($data, true));

            return $this->savedResponse('Inventory item created.', (string) $data['stockId'], 201);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Inventory item could not be created.',
            ], 500);
        }
    }

    public function update(Request $request, string $stockId)
    {
        if (!Schema::hasTable('stockmaster')) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory item maintenance is not available.',
            ], 503);
        }

        $stockId = strtoupper(trim(rawurldecode($stockId)));
        if (!DB::table('stockmaster')->where('stockid', $stockId)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory item was not found.',
            ], 404);
        }

        $this->prepareRequest($request, $stockId);
        $validator = $this->validator($request, $stockId);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();

        try {
            DB::table('stockmaster')
                ->where('stockid', $stockId)
                ->update($this->stockmasterPayload($data, false));

            return $this->savedResponse('Inventory item updated.', $stockId);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Inventory item could not be updated.',
            ], 500);
        }
    }

    private function payload(?Request $request = null): array
    {
        return [
            'items' => $this->items($request),
            'lookups' => $this->lookups(),
            'stats' => $this->stats(),
        ];
    }

    private function items(?Request $request = null)
    {
        $search = trim((string) ($request?->query('q', '') ?? ''));
        $category = strtoupper(trim((string) ($request?->query('category', '') ?? '')));
        $type = strtoupper(trim((string) ($request?->query('type', '') ?? '')));
        $status = strtolower(trim((string) ($request?->query('status', '') ?? '')));
        $limit = $this->safeLimit($request?->query('limit', 2000) ?? 2000, 50, 5000);

        $query = DB::table('stockmaster as sm')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->leftJoin('taxcategories as tc', 'tc.taxcatid', '=', 'sm.taxcatid');

        if (Schema::hasTable('discountcategories')) {
            $query->leftJoin('discountcategories as dc', 'dc.code', '=', 'sm.discountcategory');
        }

        if (Schema::hasTable('locstock')) {
            $locationTotals = DB::table('locstock')
                ->select('stockid', DB::raw('SUM(quantity) as on_hand'), DB::raw('COUNT(*) as location_count'))
                ->groupBy('stockid');

            $query->leftJoinSub($locationTotals, 'ls', function ($join) {
                $join->on('ls.stockid', '=', 'sm.stockid');
            });
        }

        if (Schema::hasTable('prices')) {
            $priceTotals = DB::table('prices')
                ->select('stockid', DB::raw('COUNT(*) as price_count'))
                ->groupBy('stockid');

            $query->leftJoinSub($priceTotals, 'pr', function ($join) {
                $join->on('pr.stockid', '=', 'sm.stockid');
            });
        }

        if (Schema::hasTable('purchdata')) {
            $supplierTotals = DB::table('purchdata')
                ->select('stockid', DB::raw('COUNT(*) as supplier_count'))
                ->groupBy('stockid');

            $query->leftJoinSub($supplierTotals, 'pd', function ($join) {
                $join->on('pd.stockid', '=', 'sm.stockid');
            });
        }

        $query->select(
            'sm.stockid',
            'sm.categoryid',
            'sm.description',
            'sm.longdescription',
            'sm.units',
            'sm.mbflag',
            'sm.actualcost',
            'sm.lastcost',
            'sm.materialcost',
            'sm.labourcost',
            'sm.overheadcost',
            'sm.discontinued',
            'sm.controlled',
            'sm.eoq',
            'sm.volume',
            'sm.grossweight',
            'sm.kgs',
            'sm.barcode',
            'sm.discountcategory',
            'sm.taxcatid',
            'sm.serialised',
            'sm.perishable',
            'sm.decimalplaces',
            'sm.netweight',
            DB::raw('COALESCE(sc.categorydescription, sm.categoryid) as category_name'),
            DB::raw('COALESCE(tc.taxcatname, sm.taxcatid) as tax_category_name')
        );

        $query->addSelect(Schema::hasTable('discountcategories')
            ? DB::raw('COALESCE(dc.name, sm.discountcategory, "") as discount_category_name')
            : DB::raw('COALESCE(sm.discountcategory, "") as discount_category_name'));

        $query->addSelect(Schema::hasTable('locstock')
            ? DB::raw('COALESCE(ls.on_hand, 0) as on_hand')
            : DB::raw('0 as on_hand'));

        $query->addSelect(Schema::hasTable('locstock')
            ? DB::raw('COALESCE(ls.location_count, 0) as location_count')
            : DB::raw('0 as location_count'));

        $query->addSelect(Schema::hasTable('prices')
            ? DB::raw('COALESCE(pr.price_count, 0) as price_count')
            : DB::raw('0 as price_count'));

        $query->addSelect(Schema::hasTable('purchdata')
            ? DB::raw('COALESCE(pd.supplier_count, 0) as supplier_count')
            : DB::raw('0 as supplier_count'));

        if ($search !== '') {
            $query->where(function ($inner) use ($search) {
                $inner
                    ->where('sm.stockid', 'like', "%{$search}%")
                    ->orWhere('sm.description', 'like', "%{$search}%")
                    ->orWhere('sm.longdescription', 'like', "%{$search}%")
                    ->orWhere('sm.barcode', 'like', "%{$search}%")
                    ->orWhere('sc.categorydescription', 'like', "%{$search}%");
            });
        }

        if ($category !== '') {
            $query->where('sm.categoryid', $category);
        }

        if ($type !== '') {
            $query->where('sm.mbflag', $type);
        }

        if ($status === 'active') {
            $query->where('sm.discontinued', 0);
        } elseif ($status === 'discontinued') {
            $query->where('sm.discontinued', 1);
        } elseif ($status === 'controlled') {
            $query->where('sm.controlled', 1);
        } elseif ($status === 'serialised') {
            $query->where('sm.serialised', 1);
        }

        return $query
            ->orderBy('sm.stockid')
            ->limit($limit)
            ->get()
            ->map(function ($row) {
                return [
                    'stockId' => (string) $row->stockid,
                    'categoryId' => (string) $row->categoryid,
                    'categoryName' => html_entity_decode((string) $row->category_name),
                    'description' => html_entity_decode((string) $row->description),
                    'longDescription' => html_entity_decode((string) ($row->longdescription ?? '')),
                    'units' => (string) $row->units,
                    'mbFlag' => (string) $row->mbflag,
                    'mbFlagLabel' => $this->itemTypeLabel((string) $row->mbflag),
                    'actualCost' => (float) $row->actualcost,
                    'lastCost' => (float) $row->lastcost,
                    'materialCost' => (float) $row->materialcost,
                    'labourCost' => (float) $row->labourcost,
                    'overheadCost' => (float) $row->overheadcost,
                    'discontinued' => (int) $row->discontinued === 1,
                    'controlled' => (int) $row->controlled === 1,
                    'eoq' => (float) $row->eoq,
                    'volume' => (float) $row->volume,
                    'grossWeight' => (float) $row->grossweight,
                    'kgs' => (float) $row->kgs,
                    'barcode' => (string) ($row->barcode ?? ''),
                    'discountCategory' => (string) ($row->discountcategory ?? ''),
                    'discountCategoryName' => html_entity_decode((string) ($row->discount_category_name ?? '')),
                    'taxCatId' => (int) $row->taxcatid,
                    'taxCategoryName' => html_entity_decode((string) $row->tax_category_name),
                    'serialised' => (int) $row->serialised === 1,
                    'perishable' => (int) $row->perishable === 1,
                    'decimalPlaces' => (int) $row->decimalplaces,
                    'netWeight' => (float) $row->netweight,
                    'onHand' => (float) $row->on_hand,
                    'locationCount' => (int) $row->location_count,
                    'priceCount' => (int) $row->price_count,
                    'supplierCount' => (int) $row->supplier_count,
                ];
            })
            ->values();
    }

    private function lookups(): array
    {
        return [
            'categories' => $this->lookupRows('stockcategory', 'categoryid', 'categorydescription', 'categoryid'),
            'units' => $this->lookupRows('unitsofmeasure', 'unitname', 'unitname', 'unitname'),
            'taxCategories' => $this->lookupRows('taxcategories', 'taxcatid', 'taxcatname', 'taxcatid'),
            'discountCategories' => Schema::hasTable('discountcategories')
                ? $this->lookupRows('discountcategories', 'code', 'name', 'code')
                : [],
            'itemTypes' => collect($this->itemTypes())->map(function ($label, $code) {
                return ['code' => (string) $code, 'name' => $label];
            })->values(),
        ];
    }

    private function stats(): array
    {
        if (!Schema::hasTable('stockmaster')) {
            return $this->emptyStats();
        }

        return [
            'totalItems' => DB::table('stockmaster')->count(),
            'activeItems' => DB::table('stockmaster')->where('discontinued', 0)->count(),
            'discontinuedItems' => DB::table('stockmaster')->where('discontinued', 1)->count(),
            'controlledItems' => DB::table('stockmaster')->where('controlled', 1)->count(),
            'serialisedItems' => DB::table('stockmaster')->where('serialised', 1)->count(),
            'categories' => Schema::hasTable('stockcategory') ? DB::table('stockcategory')->count() : 0,
        ];
    }

    private function emptyStats(): array
    {
        return [
            'totalItems' => 0,
            'activeItems' => 0,
            'discontinuedItems' => 0,
            'controlledItems' => 0,
            'serialisedItems' => 0,
            'categories' => 0,
        ];
    }

    private function prepareRequest(Request $request, ?string $stockId = null): void
    {
        $request->merge([
            'stockId' => strtoupper(preg_replace('/\s+/', '', trim((string) $request->input('stockId', $stockId ?? '')))),
            'description' => trim((string) $request->input('description', '')),
            'longDescription' => trim((string) $request->input('longDescription', '')),
            'categoryId' => strtoupper(trim((string) $request->input('categoryId', ''))),
            'units' => trim((string) $request->input('units', 'each')),
            'mbFlag' => strtoupper(trim((string) $request->input('mbFlag', 'B'))),
            'taxCatId' => (int) $request->input('taxCatId', 1),
            'discountCategory' => strtoupper(trim((string) $request->input('discountCategory', ''))),
            'controlled' => filter_var($request->input('controlled', false), FILTER_VALIDATE_BOOLEAN),
            'serialised' => filter_var($request->input('serialised', false), FILTER_VALIDATE_BOOLEAN),
            'perishable' => filter_var($request->input('perishable', false), FILTER_VALIDATE_BOOLEAN),
            'discontinued' => filter_var($request->input('discontinued', false), FILTER_VALIDATE_BOOLEAN),
            'decimalPlaces' => (int) $request->input('decimalPlaces', 0),
            'eoq' => $this->numberValue($request->input('eoq', 0)),
            'volume' => $this->numberValue($request->input('volume', 0)),
            'grossWeight' => $this->numberValue($request->input('grossWeight', 0)),
            'kgs' => $this->numberValue($request->input('kgs', 0)),
            'netWeight' => $this->numberValue($request->input('netWeight', 0)),
            'barcode' => trim((string) $request->input('barcode', '')),
        ]);
    }

    private function validator(Request $request, ?string $stockId)
    {
        $stockIdRules = ['required', 'string', 'max:20', 'regex:/^[A-Za-z0-9._-]+$/'];
        $stockIdRules[] = $stockId === null ? Rule::unique('stockmaster', 'stockid') : Rule::in([$stockId]);

        $discountRules = ['nullable', 'string', 'max:2'];
        if (Schema::hasTable('discountcategories') && $request->input('discountCategory', '') !== '') {
            $discountRules[] = Rule::exists('discountcategories', 'code');
        }

        return Validator::make($request->all(), [
            'stockId' => $stockIdRules,
            'description' => ['required', 'string', 'max:50'],
            'longDescription' => ['nullable', 'string'],
            'categoryId' => ['required', 'string', Rule::exists('stockcategory', 'categoryid')],
            'units' => ['required', 'string', 'max:20', Rule::exists('unitsofmeasure', 'unitname')],
            'mbFlag' => ['required', Rule::in(array_keys($this->itemTypes()))],
            'taxCatId' => ['required', 'integer', Rule::exists('taxcategories', 'taxcatid')],
            'discountCategory' => $discountRules,
            'controlled' => ['required', 'boolean'],
            'serialised' => ['required', 'boolean'],
            'perishable' => ['required', 'boolean'],
            'discontinued' => ['required', 'boolean'],
            'decimalPlaces' => ['required', 'integer', 'min:0', 'max:6'],
            'eoq' => ['required', 'numeric', 'min:0'],
            'volume' => ['required', 'numeric', 'min:0'],
            'grossWeight' => ['required', 'numeric', 'min:0'],
            'kgs' => ['required', 'numeric', 'min:0'],
            'netWeight' => ['required', 'numeric', 'min:0'],
            'barcode' => ['nullable', 'string', 'max:50'],
        ]);
    }

    private function stockmasterPayload(array $data, bool $creating): array
    {
        $description = trim((string) $data['description']);
        $longDescription = trim((string) ($data['longDescription'] ?? ''));
        if ($longDescription === '') {
            $longDescription = $description;
        }

        $payload = [
            'categoryid' => (string) $data['categoryId'],
            'lastcategoryupdate' => now()->toDateString(),
            'description' => $description,
            'longdescription' => $longDescription,
            'units' => (string) $data['units'],
            'mbflag' => (string) $data['mbFlag'],
            'discontinued' => $data['discontinued'] ? 1 : 0,
            'controlled' => $data['controlled'] ? 1 : 0,
            'eoq' => (float) $data['eoq'],
            'volume' => (float) $data['volume'],
            'grossweight' => (float) $data['grossWeight'],
            'kgs' => (float) $data['kgs'],
            'barcode' => (string) ($data['barcode'] ?? ''),
            'discountcategory' => (string) ($data['discountCategory'] ?? ''),
            'taxcatid' => (int) $data['taxCatId'],
            'serialised' => $data['serialised'] ? 1 : 0,
            'perishable' => $data['perishable'] ? 1 : 0,
            'decimalplaces' => (int) $data['decimalPlaces'],
            'netweight' => (float) $data['netWeight'],
        ];

        if ($creating) {
            $payload = array_merge([
                'stockid' => (string) $data['stockId'],
                'lastcurcostdate' => '1800-01-01',
                'actualcost' => 0,
                'lastcost' => 0,
                'materialcost' => 0,
                'labourcost' => 0,
                'overheadcost' => 0,
                'lowestlevel' => 0,
                'appendfile' => null,
                'pansize' => 0,
                'shrinkfactor' => 0,
                'nextserialno' => 0,
                'lastcostupdate' => '0000-00-00',
            ], $payload);
        }

        return $this->filterTableColumns('stockmaster', $payload);
    }

    private function lookupRows(string $table, string $codeColumn, string $nameColumn, string $orderColumn)
    {
        if (!Schema::hasTable($table)) {
            return [];
        }

        return DB::table($table)
            ->select($codeColumn, $nameColumn)
            ->orderBy($orderColumn)
            ->get()
            ->map(static function ($row) use ($codeColumn, $nameColumn) {
                return [
                    'code' => (string) $row->{$codeColumn},
                    'name' => html_entity_decode((string) $row->{$nameColumn}),
                ];
            })
            ->values();
    }

    private function itemTypes(): array
    {
        return [
            'B' => 'Bought stock',
            'M' => 'Manufactured stock',
            'D' => 'Dummy item',
            'L' => 'Labour or service',
            'A' => 'Assembly',
            'K' => 'Kit set',
        ];
    }

    private function itemTypeLabel(string $code): string
    {
        return $this->itemTypes()[strtoupper($code)] ?? strtoupper($code);
    }

    private function filterTableColumns(string $table, array $payload): array
    {
        $columns = array_flip(Schema::getColumnListing($table));
        return array_intersect_key($payload, $columns);
    }

    private function numberValue($value): float
    {
        if (is_numeric($value)) {
            return (float) $value;
        }

        return (float) str_replace(',', '', (string) $value);
    }

    private function safeLimit($value, int $min, int $max): int
    {
        $limit = (int) $value;
        if ($limit < $min) return $min;
        if ($limit > $max) return $max;
        return $limit;
    }

    private function validationResponse($validator)
    {
        return response()->json([
            'success' => false,
            'message' => 'Validation failed.',
            'errors' => $validator->errors(),
        ], 422);
    }

    private function savedResponse(string $message, string $selectedId, int $status = 200)
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => array_merge($this->payload(), ['selectedId' => $selectedId]),
        ], $status);
    }
}
