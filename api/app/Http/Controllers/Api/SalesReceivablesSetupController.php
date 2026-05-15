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
            'code' => in_array($normalized, ['sales-types', 'sales-people', 'areas'], true)
                ? strtoupper(str_replace(' ', '', trim((string) $request->input('code', ''))))
                : str_replace(' ', '', trim((string) $request->input('code', ''))),
            'name' => trim((string) $request->input('name', '')),
            'disallowInvoices' => (int) $request->input('disallowInvoices', 0),
            'dueMode' => trim((string) $request->input('dueMode', 'days')),
            'dayNumber' => (int) $request->input('dayNumber', 0),
            'paymentType' => filter_var($request->input('paymentType', true), FILTER_VALIDATE_BOOLEAN),
            'receiptType' => filter_var($request->input('receiptType', true), FILTER_VALIDATE_BOOLEAN),
            'usePreprintedStationery' => filter_var($request->input('usePreprintedStationery', false), FILTER_VALIDATE_BOOLEAN),
            'openCashDrawer' => filter_var($request->input('openCashDrawer', false), FILTER_VALIDATE_BOOLEAN),
            'percentDiscount' => $request->input('percentDiscount', 0),
            'telephone' => trim((string) $request->input('telephone', '')),
            'fax' => trim((string) $request->input('fax', '')),
            'commissionRate1' => $request->input('commissionRate1', 0),
            'breakpoint' => $request->input('breakpoint', 0),
            'commissionRate2' => $request->input('commissionRate2', 0),
            'current' => filter_var($request->input('current', true), FILTER_VALIDATE_BOOLEAN),
            'area' => strtoupper(str_replace(' ', '', trim((string) $request->input('area', 'AN')))),
            'stockCategory' => strtoupper(str_replace(' ', '', trim((string) $request->input('stockCategory', 'ANY')))),
            'salesType' => strtoupper(str_replace(' ', '', trim((string) $request->input('salesType', 'AN')))),
            'salesGlCode' => trim((string) $request->input('salesGlCode', '')),
            'discountGlCode' => trim((string) $request->input('discountGlCode', '')),
            'cogsGlCode' => trim((string) $request->input('cogsGlCode', '')),
            'discountCategory' => strtoupper(str_replace(' ', '', trim((string) $request->input('discountCategory', '')))),
            'quantityBreak' => $request->input('quantityBreak', 1),
            'discountRatePercent' => $request->input('discountRatePercent', 0),
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

        if ($normalized === 'credit-status') {
            $id = (int) $data['code'];
            DB::table('holdreasons')->insert([
                'reasoncode' => $id,
                'reasondescription' => trim((string) $data['name']),
                'dissallowinvoices' => (int) $data['disallowInvoices'],
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Credit status created.',
                'data' => array_merge($this->payload(), ['selectedId' => $id]),
            ], 201);
        }

        if ($normalized === 'payment-terms') {
            $id = (string) $data['code'];
            $dayNumber = (int) $data['dayNumber'];
            DB::table('paymentterms')->insert([
                'termsindicator' => $id,
                'terms' => trim((string) $data['name']),
                'daysbeforedue' => $data['dueMode'] === 'days' ? $dayNumber : 0,
                'dayinfollowingmonth' => $data['dueMode'] === 'following-month' ? $dayNumber : 0,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Payment term created.',
                'data' => array_merge($this->payload(), ['selectedId' => $id]),
            ], 201);
        }

        if ($normalized === 'payment-methods') {
            $id = DB::table('paymentmethods')->insertGetId([
                'paymentname' => trim((string) $data['name']),
                'paymenttype' => $data['paymentType'] ? 1 : 0,
                'receipttype' => $data['receiptType'] ? 1 : 0,
                'usepreprintedstationery' => $data['usePreprintedStationery'] ? 1 : 0,
                'opencashdrawer' => $data['openCashDrawer'] ? 1 : 0,
                'percentdiscount' => (float) $data['percentDiscount'],
            ], 'paymentid');

            return response()->json([
                'success' => true,
                'message' => 'Payment method created.',
                'data' => array_merge($this->payload(), ['selectedId' => $id]),
            ], 201);
        }

        if ($normalized === 'sales-people') {
            $id = (string) $data['code'];
            DB::table('salesman')->insert([
                'salesmancode' => $id,
                'salesmanname' => trim((string) $data['name']),
                'smantel' => trim((string) $data['telephone']),
                'smanfax' => trim((string) $data['fax']),
                'commissionrate1' => (float) $data['commissionRate1'],
                'breakpoint' => (float) $data['breakpoint'],
                'commissionrate2' => (float) $data['commissionRate2'],
                'current' => $data['current'] ? 1 : 0,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Salesperson created.',
                'data' => array_merge($this->payload(), ['selectedId' => $id]),
            ], 201);
        }

        if ($normalized === 'areas') {
            $id = (string) $data['code'];
            DB::table('areas')->insert([
                'areacode' => $id,
                'areadescription' => trim((string) $data['name']),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Area created.',
                'data' => array_merge($this->payload(), ['selectedId' => $id]),
            ], 201);
        }

        if ($normalized === 'sales-gl-postings') {
            $id = DB::table('salesglpostings')->insertGetId([
                'area' => (string) $data['area'],
                'stkcat' => (string) $data['stockCategory'],
                'salestype' => (string) $data['salesType'],
                'salesglcode' => (string) $data['salesGlCode'],
                'discountglcode' => (string) $data['discountGlCode'],
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Sales GL posting created.',
                'data' => array_merge($this->payload(), ['selectedId' => $id]),
            ], 201);
        }

        if ($normalized === 'cogs-gl-postings') {
            $id = DB::table('cogsglpostings')->insertGetId([
                'area' => (string) $data['area'],
                'stkcat' => (string) $data['stockCategory'],
                'salestype' => (string) $data['salesType'],
                'glcode' => (string) $data['cogsGlCode'],
            ]);

            return response()->json([
                'success' => true,
                'message' => 'COGS GL posting created.',
                'data' => array_merge($this->payload(), ['selectedId' => $id]),
            ], 201);
        }

        if ($normalized === 'discount-matrix') {
            $quantityBreak = (int) $data['quantityBreak'];
            DB::table('discountmatrix')->insert([
                'salestype' => (string) $data['salesType'],
                'discountcategory' => (string) $data['discountCategory'],
                'quantitybreak' => $quantityBreak,
                'discountrate' => ((float) $data['discountRatePercent']) / 100,
            ]);

            $selectedId = $this->discountMatrixKey((string) $data['salesType'], (string) $data['discountCategory'], $quantityBreak);

            return response()->json([
                'success' => true,
                'message' => 'Discount matrix row created.',
                'data' => array_merge($this->payload(), ['selectedId' => $selectedId]),
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
        $id = in_array($normalized, ['sales-types', 'sales-people', 'areas'], true) ? strtoupper(trim($id)) : trim($id);
        $request->merge([
            'code' => in_array($normalized, ['sales-types', 'sales-people', 'areas'], true)
                ? strtoupper(str_replace(' ', '', trim((string) $request->input('code', $id))))
                : str_replace(' ', '', trim((string) $request->input('code', $id))),
            'name' => trim((string) $request->input('name', '')),
            'disallowInvoices' => (int) $request->input('disallowInvoices', 0),
            'dueMode' => trim((string) $request->input('dueMode', 'days')),
            'dayNumber' => (int) $request->input('dayNumber', 0),
            'paymentType' => filter_var($request->input('paymentType', true), FILTER_VALIDATE_BOOLEAN),
            'receiptType' => filter_var($request->input('receiptType', true), FILTER_VALIDATE_BOOLEAN),
            'usePreprintedStationery' => filter_var($request->input('usePreprintedStationery', false), FILTER_VALIDATE_BOOLEAN),
            'openCashDrawer' => filter_var($request->input('openCashDrawer', false), FILTER_VALIDATE_BOOLEAN),
            'percentDiscount' => $request->input('percentDiscount', 0),
            'telephone' => trim((string) $request->input('telephone', '')),
            'fax' => trim((string) $request->input('fax', '')),
            'commissionRate1' => $request->input('commissionRate1', 0),
            'breakpoint' => $request->input('breakpoint', 0),
            'commissionRate2' => $request->input('commissionRate2', 0),
            'current' => filter_var($request->input('current', true), FILTER_VALIDATE_BOOLEAN),
            'area' => strtoupper(str_replace(' ', '', trim((string) $request->input('area', 'AN')))),
            'stockCategory' => strtoupper(str_replace(' ', '', trim((string) $request->input('stockCategory', 'ANY')))),
            'salesType' => strtoupper(str_replace(' ', '', trim((string) $request->input('salesType', 'AN')))),
            'salesGlCode' => trim((string) $request->input('salesGlCode', '')),
            'discountGlCode' => trim((string) $request->input('discountGlCode', '')),
            'cogsGlCode' => trim((string) $request->input('cogsGlCode', '')),
            'discountCategory' => strtoupper(str_replace(' ', '', trim((string) $request->input('discountCategory', '')))),
            'quantityBreak' => $request->input('quantityBreak', 1),
            'discountRatePercent' => $request->input('discountRatePercent', 0),
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

        if ($normalized === 'credit-status') {
            DB::table('holdreasons')
                ->where('reasoncode', (int) $id)
                ->update([
                    'reasondescription' => trim((string) $data['name']),
                    'dissallowinvoices' => (int) $data['disallowInvoices'],
                ]);

            return response()->json([
                'success' => true,
                'message' => 'Credit status updated.',
                'data' => array_merge($this->payload(), ['selectedId' => (int) $id]),
            ]);
        }

        if ($normalized === 'payment-terms') {
            $dayNumber = (int) $data['dayNumber'];
            DB::table('paymentterms')
                ->where('termsindicator', $id)
                ->update([
                    'terms' => trim((string) $data['name']),
                    'daysbeforedue' => $data['dueMode'] === 'days' ? $dayNumber : 0,
                    'dayinfollowingmonth' => $data['dueMode'] === 'following-month' ? $dayNumber : 0,
                ]);

            return response()->json([
                'success' => true,
                'message' => 'Payment term updated.',
                'data' => array_merge($this->payload(), ['selectedId' => $id]),
            ]);
        }

        if ($normalized === 'payment-methods') {
            DB::table('paymentmethods')
                ->where('paymentid', (int) $id)
                ->update([
                    'paymentname' => trim((string) $data['name']),
                    'paymenttype' => $data['paymentType'] ? 1 : 0,
                    'receipttype' => $data['receiptType'] ? 1 : 0,
                    'usepreprintedstationery' => $data['usePreprintedStationery'] ? 1 : 0,
                    'opencashdrawer' => $data['openCashDrawer'] ? 1 : 0,
                    'percentdiscount' => (float) $data['percentDiscount'],
                ]);

            return response()->json([
                'success' => true,
                'message' => 'Payment method updated.',
                'data' => array_merge($this->payload(), ['selectedId' => (int) $id]),
            ]);
        }

        if ($normalized === 'sales-people') {
            DB::table('salesman')
                ->where('salesmancode', $id)
                ->update([
                    'salesmanname' => trim((string) $data['name']),
                    'smantel' => trim((string) $data['telephone']),
                    'smanfax' => trim((string) $data['fax']),
                    'commissionrate1' => (float) $data['commissionRate1'],
                    'breakpoint' => (float) $data['breakpoint'],
                    'commissionrate2' => (float) $data['commissionRate2'],
                    'current' => $data['current'] ? 1 : 0,
                ]);

            return response()->json([
                'success' => true,
                'message' => 'Salesperson updated.',
                'data' => array_merge($this->payload(), ['selectedId' => $id]),
            ]);
        }

        if ($normalized === 'areas') {
            DB::table('areas')
                ->where('areacode', $id)
                ->update(['areadescription' => trim((string) $data['name'])]);

            return response()->json([
                'success' => true,
                'message' => 'Area updated.',
                'data' => array_merge($this->payload(), ['selectedId' => $id]),
            ]);
        }

        if ($normalized === 'sales-gl-postings') {
            DB::table('salesglpostings')
                ->where('id', (int) $id)
                ->update([
                    'area' => (string) $data['area'],
                    'stkcat' => (string) $data['stockCategory'],
                    'salestype' => (string) $data['salesType'],
                    'salesglcode' => (string) $data['salesGlCode'],
                    'discountglcode' => (string) $data['discountGlCode'],
                ]);

            return response()->json([
                'success' => true,
                'message' => 'Sales GL posting updated.',
                'data' => array_merge($this->payload(), ['selectedId' => (int) $id]),
            ]);
        }

        if ($normalized === 'cogs-gl-postings') {
            DB::table('cogsglpostings')
                ->where('id', (int) $id)
                ->update([
                    'area' => (string) $data['area'],
                    'stkcat' => (string) $data['stockCategory'],
                    'salestype' => (string) $data['salesType'],
                    'glcode' => (string) $data['cogsGlCode'],
                ]);

            return response()->json([
                'success' => true,
                'message' => 'COGS GL posting updated.',
                'data' => array_merge($this->payload(), ['selectedId' => (int) $id]),
            ]);
        }

        if ($normalized === 'discount-matrix') {
            $current = $this->decodeDiscountMatrixKey($id);
            $quantityBreak = (int) $data['quantityBreak'];
            DB::table('discountmatrix')
                ->where('salestype', $current['salesType'])
                ->where('discountcategory', $current['discountCategory'])
                ->where('quantitybreak', $current['quantityBreak'])
                ->update([
                    'salestype' => (string) $data['salesType'],
                    'discountcategory' => (string) $data['discountCategory'],
                    'quantitybreak' => $quantityBreak,
                    'discountrate' => ((float) $data['discountRatePercent']) / 100,
                ]);

            $selectedId = $this->discountMatrixKey((string) $data['salesType'], (string) $data['discountCategory'], $quantityBreak);

            return response()->json([
                'success' => true,
                'message' => 'Discount matrix row updated.',
                'data' => array_merge($this->payload(), ['selectedId' => $selectedId]),
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
        $id = in_array($normalized, ['sales-types', 'sales-people', 'areas'], true) ? strtoupper(trim($id)) : trim($id);

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

        if ($normalized === 'credit-status') {
            DB::table('holdreasons')->where('reasoncode', (int) $id)->delete();

            return response()->json([
                'success' => true,
                'message' => 'Credit status deleted.',
                'data' => $this->payload(),
            ]);
        }

        if ($normalized === 'payment-terms') {
            DB::table('paymentterms')->where('termsindicator', $id)->delete();

            return response()->json([
                'success' => true,
                'message' => 'Payment term deleted.',
                'data' => $this->payload(),
            ]);
        }

        if ($normalized === 'payment-methods') {
            DB::table('paymentmethods')->where('paymentid', (int) $id)->delete();

            return response()->json([
                'success' => true,
                'message' => 'Payment method deleted.',
                'data' => $this->payload(),
            ]);
        }

        if ($normalized === 'sales-people') {
            DB::table('salesman')->where('salesmancode', $id)->delete();

            return response()->json([
                'success' => true,
                'message' => 'Salesperson deleted.',
                'data' => $this->payload(),
            ]);
        }

        if ($normalized === 'areas') {
            DB::table('areas')->where('areacode', $id)->delete();

            return response()->json([
                'success' => true,
                'message' => 'Area deleted.',
                'data' => $this->payload(),
            ]);
        }

        if ($normalized === 'sales-gl-postings') {
            DB::table('salesglpostings')->where('id', (int) $id)->delete();

            return response()->json([
                'success' => true,
                'message' => 'Sales GL posting deleted.',
                'data' => $this->payload(),
            ]);
        }

        if ($normalized === 'cogs-gl-postings') {
            DB::table('cogsglpostings')->where('id', (int) $id)->delete();

            return response()->json([
                'success' => true,
                'message' => 'COGS GL posting deleted.',
                'data' => $this->payload(),
            ]);
        }

        if ($normalized === 'discount-matrix') {
            $current = $this->decodeDiscountMatrixKey($id);
            DB::table('discountmatrix')
                ->where('salestype', $current['salesType'])
                ->where('discountcategory', $current['discountCategory'])
                ->where('quantitybreak', $current['quantityBreak'])
                ->delete();

            return response()->json([
                'success' => true,
                'message' => 'Discount matrix row deleted.',
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
        $this->ensureDefaultSalesGlPosting();
        $this->ensureDefaultCogsGlPosting();

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

        $creditStatuses = DB::table('holdreasons')
            ->select('reasoncode', 'reasondescription', 'dissallowinvoices')
            ->orderBy('reasoncode')
            ->get()
            ->map(static function ($row) {
                return [
                    'id' => (int) $row->reasoncode,
                    'name' => (string) $row->reasondescription,
                    'disallowInvoices' => (int) $row->dissallowinvoices,
                ];
            })
            ->values();

        $paymentTerms = DB::table('paymentterms')
            ->select('termsindicator', 'terms', 'daysbeforedue', 'dayinfollowingmonth')
            ->orderBy('termsindicator')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->termsindicator,
                    'name' => (string) $row->terms,
                    'daysBeforeDue' => (int) $row->daysbeforedue,
                    'dayInFollowingMonth' => (int) $row->dayinfollowingmonth,
                ];
            })
            ->values();

        $paymentMethods = DB::table('paymentmethods')
            ->select('paymentid', 'paymentname', 'paymenttype', 'receipttype', 'usepreprintedstationery', 'opencashdrawer', 'percentdiscount')
            ->orderBy('paymentid')
            ->get()
            ->map(static function ($row) {
                return [
                    'id' => (int) $row->paymentid,
                    'name' => (string) $row->paymentname,
                    'paymentType' => (int) $row->paymenttype === 1,
                    'receiptType' => (int) $row->receipttype === 1,
                    'usePreprintedStationery' => (int) $row->usepreprintedstationery === 1,
                    'openCashDrawer' => (int) $row->opencashdrawer === 1,
                    'percentDiscount' => (float) $row->percentdiscount,
                ];
            })
            ->values();

        $salesPeople = DB::table('salesman')
            ->select('salesmancode', 'salesmanname', 'smantel', 'smanfax', 'commissionrate1', 'breakpoint', 'commissionrate2', 'current')
            ->orderBy('salesmancode')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->salesmancode,
                    'name' => (string) $row->salesmanname,
                    'telephone' => (string) $row->smantel,
                    'fax' => (string) $row->smanfax,
                    'commissionRate1' => (float) $row->commissionrate1,
                    'breakpoint' => (float) $row->breakpoint,
                    'commissionRate2' => (float) $row->commissionrate2,
                    'current' => (int) $row->current === 1,
                ];
            })
            ->values();

        $areas = DB::table('areas')
            ->select('areacode', 'areadescription')
            ->orderBy('areacode')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->areacode,
                    'name' => (string) $row->areadescription,
                ];
            })
            ->values();

        $stockCategories = DB::table('stockcategory')
            ->select('categoryid', 'categorydescription')
            ->orderBy('categoryid')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->categoryid,
                    'name' => (string) $row->categorydescription,
                ];
            })
            ->values();

        $profitLossAccounts = DB::table('chartmaster')
            ->join('accountgroups', 'chartmaster.group_', '=', 'accountgroups.groupname')
            ->where('accountgroups.pandl', 1)
            ->select('chartmaster.accountcode', 'chartmaster.accountname')
            ->orderBy('accountgroups.sequenceintb')
            ->orderBy('chartmaster.accountcode')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->accountcode,
                    'name' => (string) $row->accountname,
                ];
            })
            ->values();

        $discountCategories = DB::table('stockmaster')
            ->select('discountcategory')
            ->where('discountcategory', '<>', '')
            ->distinct()
            ->orderBy('discountcategory')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->discountcategory,
                    'name' => (string) $row->discountcategory,
                ];
            })
            ->values();

        $salesGlPostings = DB::table('salesglpostings')
            ->leftJoin('areas', 'salesglpostings.area', '=', 'areas.areacode')
            ->leftJoin('stockcategory', 'salesglpostings.stkcat', '=', 'stockcategory.categoryid')
            ->leftJoin('salestypes', 'salesglpostings.salestype', '=', 'salestypes.typeabbrev')
            ->leftJoin('chartmaster as sales_account', 'salesglpostings.salesglcode', '=', 'sales_account.accountcode')
            ->leftJoin('chartmaster as discount_account', 'salesglpostings.discountglcode', '=', 'discount_account.accountcode')
            ->select(
                'salesglpostings.id',
                'salesglpostings.area',
                'salesglpostings.stkcat',
                'salesglpostings.salestype',
                'salesglpostings.salesglcode',
                'salesglpostings.discountglcode',
                'areas.areadescription',
                'stockcategory.categorydescription',
                'salestypes.sales_type',
                'sales_account.accountname as sales_account_name',
                'discount_account.accountname as discount_account_name'
            )
            ->orderBy('salesglpostings.area')
            ->orderBy('salesglpostings.stkcat')
            ->orderBy('salesglpostings.salestype')
            ->get()
            ->map(static function ($row) {
                return [
                    'id' => (int) $row->id,
                    'area' => (string) $row->area,
                    'areaName' => (string) $row->area === 'AN' ? 'Any Other' : (string) ($row->areadescription ?: 'Missing area'),
                    'stockCategory' => (string) $row->stkcat,
                    'stockCategoryName' => (string) $row->stkcat === 'ANY' ? 'Any Other' : (string) ($row->categorydescription ?: 'Missing category'),
                    'salesType' => (string) $row->salestype,
                    'salesTypeName' => (string) $row->salestype === 'AN' ? 'Any Other' : (string) ($row->sales_type ?: 'Missing sales type'),
                    'salesGlCode' => (string) $row->salesglcode,
                    'salesGlName' => (string) ($row->sales_account_name ?: 'Missing account'),
                    'discountGlCode' => (string) $row->discountglcode,
                    'discountGlName' => (string) ($row->discount_account_name ?: 'Missing account'),
                    'hasInvalidAccounts' => $row->sales_account_name === null || $row->discount_account_name === null,
                ];
            })
            ->values();

        $cogsGlPostings = DB::table('cogsglpostings')
            ->leftJoin('areas', 'cogsglpostings.area', '=', 'areas.areacode')
            ->leftJoin('stockcategory', 'cogsglpostings.stkcat', '=', 'stockcategory.categoryid')
            ->leftJoin('salestypes', 'cogsglpostings.salestype', '=', 'salestypes.typeabbrev')
            ->leftJoin('chartmaster as cogs_account', 'cogsglpostings.glcode', '=', 'cogs_account.accountcode')
            ->select(
                'cogsglpostings.id',
                'cogsglpostings.area',
                'cogsglpostings.stkcat',
                'cogsglpostings.salestype',
                'cogsglpostings.glcode',
                'areas.areadescription',
                'stockcategory.categorydescription',
                'salestypes.sales_type',
                'cogs_account.accountname as cogs_account_name'
            )
            ->orderBy('cogsglpostings.area')
            ->orderBy('cogsglpostings.stkcat')
            ->orderBy('cogsglpostings.salestype')
            ->get()
            ->map(static function ($row) {
                return [
                    'id' => (int) $row->id,
                    'area' => (string) $row->area,
                    'areaName' => (string) $row->area === 'AN' ? 'Any Other' : (string) ($row->areadescription ?: 'Missing area'),
                    'stockCategory' => (string) $row->stkcat,
                    'stockCategoryName' => (string) $row->stkcat === 'ANY' ? 'Any Other' : (string) ($row->categorydescription ?: 'Missing category'),
                    'salesType' => (string) $row->salestype,
                    'salesTypeName' => (string) $row->salestype === 'AN' ? 'Any Other' : (string) ($row->sales_type ?: 'Missing sales type'),
                    'cogsGlCode' => (string) $row->glcode,
                    'cogsGlName' => (string) ($row->cogs_account_name ?: 'Missing account'),
                    'hasInvalidAccount' => $row->cogs_account_name === null,
                ];
            })
            ->values();

        $discountMatrix = DB::table('discountmatrix')
            ->leftJoin('salestypes', 'discountmatrix.salestype', '=', 'salestypes.typeabbrev')
            ->select(
                'discountmatrix.salestype',
                'discountmatrix.discountcategory',
                'discountmatrix.quantitybreak',
                'discountmatrix.discountrate',
                'salestypes.sales_type'
            )
            ->orderBy('discountmatrix.salestype')
            ->orderBy('discountmatrix.discountcategory')
            ->orderBy('discountmatrix.quantitybreak')
            ->get()
            ->map(function ($row) {
                $quantityBreak = (int) $row->quantitybreak;
                $discountRate = (float) $row->discountrate;
                return [
                    'id' => $this->discountMatrixKey((string) $row->salestype, (string) $row->discountcategory, $quantityBreak),
                    'salesType' => (string) $row->salestype,
                    'salesTypeName' => (string) ($row->sales_type ?: 'Missing sales type'),
                    'discountCategory' => (string) $row->discountcategory,
                    'quantityBreak' => $quantityBreak,
                    'discountRate' => $discountRate,
                    'discountRatePercent' => $discountRate * 100,
                ];
            })
            ->values();

        return [
            'salesTypes' => $salesTypes->all(),
            'customerTypes' => $customerTypes->all(),
            'creditStatuses' => $creditStatuses->all(),
            'paymentTerms' => $paymentTerms->all(),
            'paymentMethods' => $paymentMethods->all(),
            'salesPeople' => $salesPeople->all(),
            'areas' => $areas->all(),
            'salesGlPostings' => $salesGlPostings->all(),
            'cogsGlPostings' => $cogsGlPostings->all(),
            'discountMatrix' => $discountMatrix->all(),
            'lookups' => [
                'stockCategories' => $stockCategories->all(),
                'profitLossAccounts' => $profitLossAccounts->all(),
                'discountCategories' => $discountCategories->all(),
            ],
            'stats' => [
                'salesTypes' => $salesTypes->count(),
                'customerTypes' => $customerTypes->count(),
                'creditStatuses' => $creditStatuses->count(),
                'paymentTerms' => $paymentTerms->count(),
                'paymentMethods' => $paymentMethods->count(),
                'salesPeople' => $salesPeople->count(),
                'areas' => $areas->count(),
                'salesGlPostings' => $salesGlPostings->count(),
                'cogsGlPostings' => $cogsGlPostings->count(),
                'discountMatrix' => $discountMatrix->count(),
                'priceRows' => DB::table('prices')->count(),
                'customers' => DB::table('debtorsmaster')->count(),
                'suppliers' => DB::table('suppliers')->count(),
                'bankTransactions' => DB::table('banktrans')->count(),
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
        if (in_array($key, ['credit-status', 'creditstatus', 'hold-reasons', 'holdreasons'], true)) {
            return 'credit-status';
        }
        if (in_array($key, ['payment-terms', 'paymentterms'], true)) {
            return 'payment-terms';
        }
        if (in_array($key, ['payment-methods', 'paymentmethods'], true)) {
            return 'payment-methods';
        }
        if (in_array($key, ['sales-people', 'salespeople', 'sales-persons', 'salespersons', 'salesman'], true)) {
            return 'sales-people';
        }
        if (in_array($key, ['areas', 'sales-areas', 'salesareas'], true)) {
            return 'areas';
        }
        if (in_array($key, ['sales-gl-postings', 'salesglpostings', 'sales-gl-posting', 'salesglposting'], true)) {
            return 'sales-gl-postings';
        }
        if (in_array($key, ['cogs-gl-postings', 'cogsglpostings', 'cogs-gl-posting', 'cogsglposting'], true)) {
            return 'cogs-gl-postings';
        }
        if (in_array($key, ['discount-matrix', 'discountmatrix'], true)) {
            return 'discount-matrix';
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

        if ($entity === 'credit-status') {
            $codeRules = ['required', 'integer', 'min:0', 'max:32767'];
            $codeRules[] = $id === null ? Rule::unique('holdreasons', 'reasoncode') : Rule::in([(int) $id, (string) (int) $id]);

            return Validator::make($request->all(), [
                'code' => $codeRules,
                'name' => ['required', 'string', 'max:30'],
                'disallowInvoices' => ['required', 'integer', Rule::in([0, 1, 2])],
            ]);
        }

        if ($entity === 'payment-terms') {
            $codeRules = ['required', 'string', 'max:2', 'regex:/^[A-Za-z0-9_]+$/'];
            $codeRules[] = $id === null ? Rule::unique('paymentterms', 'termsindicator') : Rule::in([$id]);
            $dayNumberRules = ['required', 'integer', 'min:1'];
            if ($request->input('dueMode') === 'days') {
                $dayNumberRules[] = 'max:360';
            } else {
                $dayNumberRules[] = 'max:31';
            }

            return Validator::make($request->all(), [
                'code' => $codeRules,
                'name' => ['required', 'string', 'max:40'],
                'dueMode' => ['required', Rule::in(['days', 'following-month'])],
                'dayNumber' => $dayNumberRules,
            ], [
                'code.regex' => 'The payment term code may contain letters, numbers, and underscores only.',
                'dayNumber.max' => $request->input('dueMode') === 'days'
                    ? 'Payment terms due after days must be 360 days or less.'
                    : 'Payment terms due in the following month must use a day from 1 to 31.',
            ]);
        }

        if ($entity === 'payment-methods') {
            $nameRules = ['required', 'string', 'max:15'];
            $nameRules[] = $id === null
                ? Rule::unique('paymentmethods', 'paymentname')
                : Rule::unique('paymentmethods', 'paymentname')->ignore((int) $id, 'paymentid');

            return Validator::make($request->all(), [
                'name' => $nameRules,
                'paymentType' => ['required', 'boolean'],
                'receiptType' => ['required', 'boolean'],
                'usePreprintedStationery' => ['required', 'boolean'],
                'openCashDrawer' => ['required', 'boolean'],
                'percentDiscount' => ['required', 'numeric', 'min:0', 'max:1'],
            ]);
        }

        if ($entity === 'sales-people') {
            $codeRules = ['required', 'string', 'max:3'];
            $codeRules[] = $id === null ? Rule::unique('salesman', 'salesmancode') : Rule::in([$id]);

            return Validator::make($request->all(), [
                'code' => $codeRules,
                'name' => ['required', 'string', 'max:30'],
                'telephone' => ['nullable', 'string', 'max:20'],
                'fax' => ['nullable', 'string', 'max:20'],
                'commissionRate1' => ['required', 'numeric'],
                'breakpoint' => ['required', 'numeric'],
                'commissionRate2' => ['required', 'numeric'],
                'current' => ['required', 'boolean'],
            ]);
        }

        if ($entity === 'areas') {
            $codeRules = ['required', 'string', 'max:3'];
            $codeRules[] = $id === null ? Rule::unique('areas', 'areacode') : Rule::in([$id]);

            return Validator::make($request->all(), [
                'code' => $codeRules,
                'name' => ['required', 'string', 'max:25'],
            ]);
        }

        if ($entity === 'sales-gl-postings') {
            $areaCodes = DB::table('areas')->pluck('areacode')->map(static function ($code) {
                return strtoupper((string) $code);
            })->all();
            $stockCategoryCodes = DB::table('stockcategory')->pluck('categoryid')->map(static function ($code) {
                return strtoupper((string) $code);
            })->all();
            $salesTypeCodes = DB::table('salestypes')->pluck('typeabbrev')->map(static function ($code) {
                return strtoupper((string) $code);
            })->all();

            $validator = Validator::make($request->all(), [
                'area' => ['required', 'string', 'max:3', Rule::in(array_merge(['AN'], $areaCodes))],
                'stockCategory' => ['required', 'string', 'max:6', Rule::in(array_merge(['ANY'], $stockCategoryCodes))],
                'salesType' => ['required', 'string', 'max:2', Rule::in(array_merge(['AN'], $salesTypeCodes))],
                'salesGlCode' => ['required', 'string', 'max:20', Rule::exists('chartmaster', 'accountcode')],
                'discountGlCode' => ['required', 'string', 'max:20', Rule::exists('chartmaster', 'accountcode')],
            ], [
                'area.in' => 'Select a valid area or Any Other.',
                'stockCategory.in' => 'Select a valid stock category or Any Other.',
                'salesType.in' => 'Select a valid sales type or Any Other.',
                'salesGlCode.exists' => 'Select a valid sales GL account.',
                'discountGlCode.exists' => 'Select a valid discount GL account.',
            ]);

            $validator->after(function ($validator) use ($request, $id) {
                $query = DB::table('salesglpostings')
                    ->where('area', (string) $request->input('area'))
                    ->where('stkcat', (string) $request->input('stockCategory'))
                    ->where('salestype', (string) $request->input('salesType'));

                if ($id !== null) {
                    $query->where('id', '<>', (int) $id);
                }

                if ($query->exists()) {
                    $validator->errors()->add('area', 'A sales GL posting account already exists for the selected area, stock category, and sales type.');
                }
            });

            return $validator;
        }

        if ($entity === 'cogs-gl-postings') {
            $areaCodes = DB::table('areas')->pluck('areacode')->map(static function ($code) {
                return strtoupper((string) $code);
            })->all();
            $stockCategoryCodes = DB::table('stockcategory')->pluck('categoryid')->map(static function ($code) {
                return strtoupper((string) $code);
            })->all();
            $salesTypeCodes = DB::table('salestypes')->pluck('typeabbrev')->map(static function ($code) {
                return strtoupper((string) $code);
            })->all();

            $validator = Validator::make($request->all(), [
                'area' => ['required', 'string', 'max:3', Rule::in(array_merge(['AN'], $areaCodes))],
                'stockCategory' => ['required', 'string', 'max:6', Rule::in(array_merge(['ANY'], $stockCategoryCodes))],
                'salesType' => ['required', 'string', 'max:2', Rule::in(array_merge(['AN'], $salesTypeCodes))],
                'cogsGlCode' => ['required', 'string', 'max:20', Rule::exists('chartmaster', 'accountcode')],
            ], [
                'area.in' => 'Select a valid area or Any Other.',
                'stockCategory.in' => 'Select a valid stock category or Any Other.',
                'salesType.in' => 'Select a valid sales type or Any Other.',
                'cogsGlCode.exists' => 'Select a valid COGS GL account.',
            ]);

            $validator->after(function ($validator) use ($request, $id) {
                $query = DB::table('cogsglpostings')
                    ->where('area', (string) $request->input('area'))
                    ->where('stkcat', (string) $request->input('stockCategory'))
                    ->where('salestype', (string) $request->input('salesType'));

                if ($id !== null) {
                    $query->where('id', '<>', (int) $id);
                }

                if ($query->exists()) {
                    $validator->errors()->add('area', 'A COGS GL posting account already exists for the selected area, stock category, and sales type.');
                }
            });

            return $validator;
        }

        if ($entity === 'discount-matrix') {
            $discountCategories = DB::table('stockmaster')
                ->where('discountcategory', '<>', '')
                ->distinct()
                ->pluck('discountcategory')
                ->map(static function ($code) {
                    return strtoupper((string) $code);
                })
                ->all();

            $validator = Validator::make($request->all(), [
                'salesType' => ['required', 'string', 'max:2', Rule::exists('salestypes', 'typeabbrev')],
                'discountCategory' => ['nullable', 'string', 'max:2', Rule::in(array_merge([''], $discountCategories))],
                'quantityBreak' => ['required', 'integer', 'min:1'],
                'discountRatePercent' => ['required', 'numeric', 'min:0.0001', 'max:100'],
            ], [
                'salesType.exists' => 'Select a valid customer price list.',
                'discountCategory.in' => 'Select a valid discount category.',
                'quantityBreak.min' => 'The quantity break must be greater than zero.',
                'discountRatePercent.min' => 'The discount rate must be greater than zero.',
                'discountRatePercent.max' => 'The discount rate cannot be greater than 100%.',
            ]);

            $validator->after(function ($validator) use ($request, $id) {
                $query = DB::table('discountmatrix')
                    ->where('salestype', (string) $request->input('salesType'))
                    ->where('discountcategory', (string) $request->input('discountCategory', ''))
                    ->where('quantitybreak', (int) $request->input('quantityBreak'));

                if ($id !== null) {
                    $current = $this->decodeDiscountMatrixKey($id);
                    $query
                        ->where(function ($query) use ($current) {
                            $query
                                ->where('salestype', '<>', $current['salesType'])
                                ->orWhere('discountcategory', '<>', $current['discountCategory'])
                                ->orWhere('quantitybreak', '<>', $current['quantityBreak']);
                        });
                }

                if ($query->exists()) {
                    $validator->errors()->add('salesType', 'A discount matrix row already exists for the selected price list, discount category, and quantity break.');
                }
            });

            return $validator;
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
        if ($entity === 'credit-status') {
            return DB::table('holdreasons')->where('reasoncode', (int) $id)->exists();
        }
        if ($entity === 'payment-terms') {
            return DB::table('paymentterms')->where('termsindicator', $id)->exists();
        }
        if ($entity === 'payment-methods') {
            return DB::table('paymentmethods')->where('paymentid', (int) $id)->exists();
        }
        if ($entity === 'sales-people') {
            return DB::table('salesman')->where('salesmancode', strtoupper($id))->exists();
        }
        if ($entity === 'areas') {
            return DB::table('areas')->where('areacode', strtoupper($id))->exists();
        }
        if ($entity === 'sales-gl-postings') {
            return DB::table('salesglpostings')->where('id', (int) $id)->exists();
        }
        if ($entity === 'cogs-gl-postings') {
            return DB::table('cogsglpostings')->where('id', (int) $id)->exists();
        }
        if ($entity === 'discount-matrix') {
            $current = $this->decodeDiscountMatrixKey($id);
            return DB::table('discountmatrix')
                ->where('salestype', $current['salesType'])
                ->where('discountcategory', $current['discountCategory'])
                ->where('quantitybreak', $current['quantityBreak'])
                ->exists();
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

        if ($entity === 'credit-status') {
            $this->addBlocker($blockers, 'Customers', DB::table('debtorsmaster')->where('holdreason', (int) $id)->count());
            return $blockers;
        }

        if ($entity === 'payment-terms') {
            $this->addBlocker($blockers, 'Customers', DB::table('debtorsmaster')->where('paymentterms', $id)->count());
            $this->addBlocker($blockers, 'Suppliers', DB::table('suppliers')->where('paymentterms', $id)->count());
            return $blockers;
        }

        if ($entity === 'payment-methods') {
            $paymentName = (string) DB::table('paymentmethods')->where('paymentid', (int) $id)->value('paymentname');
            $this->addBlocker($blockers, 'Bank transactions', DB::table('banktrans')->where('banktranstype', $paymentName)->count());
            return $blockers;
        }

        if ($entity === 'sales-people') {
            $this->addBlocker($blockers, 'Customer branches', DB::table('custbranch')->where('salesman', $id)->count());
            $this->addBlocker($blockers, 'Sales analysis records', DB::table('salesanalysis')->where('salesperson', $id)->count());
            $this->addBlocker($blockers, 'Users', DB::table('www_users')->where('salesman', $id)->count());
            return $blockers;
        }

        if ($entity === 'areas') {
            $this->addBlocker($blockers, 'Customer branches', DB::table('custbranch')->where('area', $id)->count());
            $this->addBlocker($blockers, 'Sales analysis records', DB::table('salesanalysis')->where('area', $id)->count());
            return $blockers;
        }

        if ($entity === 'sales-gl-postings') {
            return $blockers;
        }

        if ($entity === 'cogs-gl-postings') {
            return $blockers;
        }

        if ($entity === 'discount-matrix') {
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

    private function discountMatrixKey(string $salesType, string $discountCategory, int $quantityBreak): string
    {
        return $salesType . '|' . $discountCategory . '|' . $quantityBreak;
    }

    private function decodeDiscountMatrixKey(string $id): array
    {
        $parts = explode('|', $id);
        return [
            'salesType' => (string) ($parts[0] ?? ''),
            'discountCategory' => (string) ($parts[1] ?? ''),
            'quantityBreak' => (int) ($parts[2] ?? 0),
        ];
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

    private function ensureDefaultSalesGlPosting(): void
    {
        if (DB::table('salesglpostings')->exists()) {
            return;
        }

        if (!DB::table('accountgroups')->where('groupname', 'Sales')->exists()) {
            DB::table('accountgroups')->insert([
                'groupname' => 'Sales',
                'sectioninaccounts' => 1,
                'pandl' => 1,
                'sequenceintb' => 600,
                'parentgroupname' => '',
            ]);
        }

        if (!DB::table('chartmaster')->where('accountcode', '1')->exists()) {
            DB::table('chartmaster')->insert([
                'accountcode' => '1',
                'accountname' => 'Default Sales/Discounts',
                'group_' => 'Sales',
            ]);
        }

        DB::table('salesglpostings')->insert([
            'area' => 'AN',
            'stkcat' => 'ANY',
            'salestype' => 'AN',
            'salesglcode' => '1',
            'discountglcode' => '1',
        ]);
    }

    private function ensureDefaultCogsGlPosting(): void
    {
        if (DB::table('cogsglpostings')->exists()) {
            return;
        }

        if (!DB::table('accountgroups')->where('groupname', 'Sales')->exists()) {
            DB::table('accountgroups')->insert([
                'groupname' => 'Sales',
                'sectioninaccounts' => 1,
                'pandl' => 1,
                'sequenceintb' => 600,
                'parentgroupname' => '',
            ]);
        }

        if (!DB::table('chartmaster')->where('accountcode', '1')->exists()) {
            DB::table('chartmaster')->insert([
                'accountcode' => '1',
                'accountname' => 'Default Sales/Discounts',
                'group_' => 'Sales',
            ]);
        }

        DB::table('cogsglpostings')->insert([
            'area' => 'AN',
            'stkcat' => 'ANY',
            'salestype' => 'AN',
            'glcode' => '1',
        ]);
    }

    private function entityLabel(string $entity): string
    {
        return [
            'sales-types' => 'Sales type',
            'customer-types' => 'Customer type',
            'credit-status' => 'Credit status',
            'payment-terms' => 'Payment term',
            'payment-methods' => 'Payment method',
            'sales-people' => 'Salesperson',
            'areas' => 'Area',
            'sales-gl-postings' => 'Sales GL posting',
            'cogs-gl-postings' => 'COGS GL posting',
            'discount-matrix' => 'Discount matrix row',
        ][$entity] ?? 'Setup record';
    }
}
