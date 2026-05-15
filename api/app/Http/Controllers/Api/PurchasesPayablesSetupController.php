<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class PurchasesPayablesSetupController extends Controller
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

        if ($entity === 'supplier-types') {
            $id = DB::table('suppliertype')->insertGetId([
                'typename' => trim((string) $data['name']),
            ], 'typeid');

            return $this->savedResponse('Supplier type created.', $id, 201);
        }

        if ($entity === 'payment-terms') {
            $id = (string) $data['code'];
            DB::table('paymentterms')->insert([
                'termsindicator' => $id,
                'terms' => trim((string) $data['name']),
                'daysbeforedue' => $data['dueMode'] === 'days' ? (int) $data['dayNumber'] : 0,
                'dayinfollowingmonth' => $data['dueMode'] === 'following-month' ? (int) $data['dayNumber'] : 0,
            ]);

            return $this->savedResponse('Payment term created.', $id, 201);
        }

        if ($entity === 'po-authorisation-levels') {
            DB::table('purchorderauth')->insert([
                'userid' => (string) $data['userId'],
                'currabrev' => (string) $data['currencyCode'],
                'cancreate' => $data['canCreate'] ? 1 : 0,
                'canreview' => $data['canReview'] ? 1 : 0,
                'authlevel' => (float) $data['authLevel'],
                'offhold' => $data['offHold'] ? 1 : 0,
            ]);

            return $this->savedResponse('Purchase order authorisation level created.', $this->poAuthKey((string) $data['userId'], (string) $data['currencyCode']), 201);
        }

        if ($entity === 'payment-methods') {
            $id = DB::table('paymentmethods')->insertGetId([
                'paymentname' => trim((string) $data['name']),
                'paymenttype' => $data['paymentType'] ? 1 : 0,
                'receipttype' => $data['receiptType'] ? 1 : 0,
                'usepreprintedstationery' => $data['usePreprintedStationery'] ? 1 : 0,
                'opencashdrawer' => $data['openCashDrawer'] ? 1 : 0,
                'percentdiscount' => (float) $data['percentDiscount'],
            ], 'paymentid');

            return $this->savedResponse('Payment method created.', $id, 201);
        }

        if ($entity === 'shippers') {
            $id = DB::table('shippers')->insertGetId([
                'shippername' => trim((string) $data['name']),
                'mincharge' => (float) $data['minimumCharge'],
            ], 'shipper_id');

            return $this->savedResponse('Shipper created.', $id, 201);
        }

        $id = DB::table('freightcosts')->insertGetId([
            'locationfrom' => (string) $data['locationFrom'],
            'destinationcountry' => trim((string) ($data['destinationCountry'] ?? '')),
            'destination' => trim((string) $data['destination']),
            'shipperid' => (int) $data['shipperId'],
            'cubrate' => (float) $data['cubRate'],
            'kgrate' => (float) $data['kgRate'],
            'maxkgs' => (float) $data['maxKgs'],
            'maxcub' => (float) $data['maxCub'],
            'fixedprice' => (float) $data['fixedPrice'],
            'minimumchg' => (float) $data['minimumCharge'],
        ], 'shipcostfromid');

        return $this->savedResponse('Freight cost created.', $id, 201);
    }

    public function update(Request $request, string $entity, string $id)
    {
        $entity = $this->normalizeEntity($entity);
        $id = trim(rawurldecode($id));
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

        if ($entity === 'supplier-types') {
            DB::table('suppliertype')->where('typeid', (int) $id)->update([
                'typename' => trim((string) $data['name']),
            ]);

            return $this->savedResponse('Supplier type updated.', (int) $id);
        }

        if ($entity === 'payment-terms') {
            DB::table('paymentterms')->where('termsindicator', $id)->update([
                'terms' => trim((string) $data['name']),
                'daysbeforedue' => $data['dueMode'] === 'days' ? (int) $data['dayNumber'] : 0,
                'dayinfollowingmonth' => $data['dueMode'] === 'following-month' ? (int) $data['dayNumber'] : 0,
            ]);

            return $this->savedResponse('Payment term updated.', $id);
        }

        if ($entity === 'po-authorisation-levels') {
            $current = $this->decodePoAuthKey($id);
            DB::table('purchorderauth')
                ->where('userid', $current['userId'])
                ->where('currabrev', $current['currencyCode'])
                ->update([
                    'cancreate' => $data['canCreate'] ? 1 : 0,
                    'canreview' => $data['canReview'] ? 1 : 0,
                    'authlevel' => (float) $data['authLevel'],
                    'offhold' => $data['offHold'] ? 1 : 0,
                ]);

            return $this->savedResponse('Purchase order authorisation level updated.', $id);
        }

        if ($entity === 'payment-methods') {
            DB::table('paymentmethods')->where('paymentid', (int) $id)->update([
                'paymentname' => trim((string) $data['name']),
                'paymenttype' => $data['paymentType'] ? 1 : 0,
                'receipttype' => $data['receiptType'] ? 1 : 0,
                'usepreprintedstationery' => $data['usePreprintedStationery'] ? 1 : 0,
                'opencashdrawer' => $data['openCashDrawer'] ? 1 : 0,
                'percentdiscount' => (float) $data['percentDiscount'],
            ]);

            return $this->savedResponse('Payment method updated.', (int) $id);
        }

        if ($entity === 'shippers') {
            DB::table('shippers')->where('shipper_id', (int) $id)->update([
                'shippername' => trim((string) $data['name']),
                'mincharge' => (float) $data['minimumCharge'],
            ]);

            return $this->savedResponse('Shipper updated.', (int) $id);
        }

        DB::table('freightcosts')->where('shipcostfromid', (int) $id)->update([
            'locationfrom' => (string) $data['locationFrom'],
            'destinationcountry' => trim((string) ($data['destinationCountry'] ?? '')),
            'destination' => trim((string) $data['destination']),
            'shipperid' => (int) $data['shipperId'],
            'cubrate' => (float) $data['cubRate'],
            'kgrate' => (float) $data['kgRate'],
            'maxkgs' => (float) $data['maxKgs'],
            'maxcub' => (float) $data['maxCub'],
            'fixedprice' => (float) $data['fixedPrice'],
            'minimumchg' => (float) $data['minimumCharge'],
        ]);

        return $this->savedResponse('Freight cost updated.', (int) $id);
    }

    public function destroy(string $entity, string $id)
    {
        $entity = $this->normalizeEntity($entity);
        $id = trim(rawurldecode($id));

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

        if ($entity === 'supplier-types') {
            DB::table('suppliertype')->where('typeid', (int) $id)->delete();
        } elseif ($entity === 'payment-terms') {
            DB::table('paymentterms')->where('termsindicator', $id)->delete();
        } elseif ($entity === 'po-authorisation-levels') {
            $current = $this->decodePoAuthKey($id);
            DB::table('purchorderauth')->where('userid', $current['userId'])->where('currabrev', $current['currencyCode'])->delete();
        } elseif ($entity === 'payment-methods') {
            DB::table('paymentmethods')->where('paymentid', (int) $id)->delete();
        } elseif ($entity === 'shippers') {
            DB::table('shippers')->where('shipper_id', (int) $id)->delete();
        } else {
            DB::table('freightcosts')->where('shipcostfromid', (int) $id)->delete();
        }

        return $this->savedResponse($this->entityLabel($entity) . ' deleted.', $id);
    }

    private function payload(): array
    {
        $supplierTypes = DB::table('suppliertype')
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

        $poAuthorisationLevels = DB::table('purchorderauth')
            ->leftJoin('www_users', 'purchorderauth.userid', '=', 'www_users.userid')
            ->leftJoin('currencies', 'purchorderauth.currabrev', '=', 'currencies.currabrev')
            ->select(
                'purchorderauth.userid',
                'purchorderauth.currabrev',
                'purchorderauth.cancreate',
                'purchorderauth.canreview',
                'purchorderauth.authlevel',
                'purchorderauth.offhold',
                'www_users.realname',
                'currencies.currency'
            )
            ->orderBy('purchorderauth.userid')
            ->orderBy('purchorderauth.currabrev')
            ->get()
            ->map(function ($row) {
                return [
                'id' => $this->poAuthKey((string) $row->userid, (string) $row->currabrev),
                'userId' => (string) $row->userid,
                'userName' => (string) ($row->realname ?? ''),
                'currencyCode' => (string) $row->currabrev,
                'currencyName' => (string) ($row->currency ?? ''),
                'canCreate' => (int) $row->cancreate === 1,
                'canReview' => (int) $row->canreview === 1,
                'authLevel' => (float) $row->authlevel,
                'offHold' => (int) $row->offhold === 1,
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

        $shippers = DB::table('shippers')
            ->select('shipper_id', 'shippername', 'mincharge')
            ->orderBy('shipper_id')
            ->get()
            ->map(static function ($row) {
                return [
                'id' => (int) $row->shipper_id,
                'name' => (string) $row->shippername,
                'minimumCharge' => (float) $row->mincharge,
                ];
            })
            ->values();

        $freightCosts = DB::table('freightcosts')
            ->leftJoin('locations', 'freightcosts.locationfrom', '=', 'locations.loccode')
            ->leftJoin('shippers', 'freightcosts.shipperid', '=', 'shippers.shipper_id')
            ->select(
                'freightcosts.shipcostfromid',
                'freightcosts.locationfrom',
                'freightcosts.destinationcountry',
                'freightcosts.destination',
                'freightcosts.shipperid',
                'freightcosts.cubrate',
                'freightcosts.kgrate',
                'freightcosts.maxkgs',
                'freightcosts.maxcub',
                'freightcosts.fixedprice',
                'freightcosts.minimumchg',
                'locations.locationname',
                'shippers.shippername'
            )
            ->orderBy('freightcosts.locationfrom')
            ->orderBy('freightcosts.destination')
            ->get()
            ->map(static function ($row) {
                return [
                'id' => (int) $row->shipcostfromid,
                'locationFrom' => (string) $row->locationfrom,
                'locationName' => (string) ($row->locationname ?? ''),
                'destinationCountry' => (string) ($row->destinationcountry ?? ''),
                'destination' => (string) $row->destination,
                'shipperId' => (int) $row->shipperid,
                'shipperName' => (string) ($row->shippername ?? ''),
                'cubRate' => (float) $row->cubrate,
                'kgRate' => (float) $row->kgrate,
                'maxKgs' => (float) $row->maxkgs,
                'maxCub' => (float) $row->maxcub,
                'fixedPrice' => (float) $row->fixedprice,
                'minimumCharge' => (float) $row->minimumchg,
                ];
            })
            ->values();

        $users = DB::table('www_users')
            ->select('userid', 'realname')
            ->orderBy('userid')
            ->get()
            ->map(static function ($row) {
                return [
                'code' => (string) $row->userid,
                'name' => (string) $row->realname,
                ];
            })
            ->values();

        $currencies = DB::table('currencies')
            ->select('currabrev', 'currency')
            ->orderBy('currabrev')
            ->get()
            ->map(static function ($row) {
                return [
                'code' => (string) $row->currabrev,
                'name' => (string) $row->currency,
                ];
            })
            ->values();

        $locations = DB::table('locations')
            ->select('loccode', 'locationname')
            ->orderBy('loccode')
            ->get()
            ->map(static function ($row) {
                return [
                'code' => (string) $row->loccode,
                'name' => (string) $row->locationname,
                ];
            })
            ->values();

        return [
            'supplierTypes' => $supplierTypes,
            'paymentTerms' => $paymentTerms,
            'poAuthorisationLevels' => $poAuthorisationLevels,
            'paymentMethods' => $paymentMethods,
            'shippers' => $shippers,
            'freightCosts' => $freightCosts,
            'lookups' => [
                'users' => $users,
                'currencies' => $currencies,
                'locations' => $locations,
            ],
            'stats' => [
                'supplierTypes' => $supplierTypes->count(),
                'paymentTerms' => $paymentTerms->count(),
                'poAuthorisationLevels' => $poAuthorisationLevels->count(),
                'paymentMethods' => $paymentMethods->count(),
                'shippers' => $shippers->count(),
                'freightCosts' => $freightCosts->count(),
                'suppliers' => DB::table('suppliers')->count(),
                'bankTransactions' => DB::table('banktrans')->count(),
            ],
        ];
    }

    private function prepareRequest(Request $request, string $entity, ?string $id = null): void
    {
        $request->merge([
            'code' => strtoupper(str_replace(' ', '', trim((string) $request->input('code', $id ?? '')))),
            'name' => trim((string) $request->input('name', '')),
            'dueMode' => trim((string) $request->input('dueMode', 'days')),
            'dayNumber' => (int) $request->input('dayNumber', 0),
            'userId' => trim((string) $request->input('userId', '')),
            'currencyCode' => strtoupper(trim((string) $request->input('currencyCode', ''))),
            'canCreate' => filter_var($request->input('canCreate', false), FILTER_VALIDATE_BOOLEAN),
            'canReview' => filter_var($request->input('canReview', false), FILTER_VALIDATE_BOOLEAN),
            'authLevel' => $request->input('authLevel', 0),
            'offHold' => filter_var($request->input('offHold', false), FILTER_VALIDATE_BOOLEAN),
            'paymentType' => filter_var($request->input('paymentType', true), FILTER_VALIDATE_BOOLEAN),
            'receiptType' => filter_var($request->input('receiptType', true), FILTER_VALIDATE_BOOLEAN),
            'usePreprintedStationery' => filter_var($request->input('usePreprintedStationery', false), FILTER_VALIDATE_BOOLEAN),
            'openCashDrawer' => filter_var($request->input('openCashDrawer', false), FILTER_VALIDATE_BOOLEAN),
            'percentDiscount' => $request->input('percentDiscount', 0),
            'minimumCharge' => $request->input('minimumCharge', 0),
            'locationFrom' => strtoupper(trim((string) $request->input('locationFrom', ''))),
            'destinationCountry' => trim((string) $request->input('destinationCountry', '')),
            'destination' => trim((string) $request->input('destination', '')),
            'shipperId' => (int) $request->input('shipperId', 0),
            'cubRate' => $request->input('cubRate', 0),
            'kgRate' => $request->input('kgRate', 0),
            'maxKgs' => $request->input('maxKgs', 999999),
            'maxCub' => $request->input('maxCub', 999999),
            'fixedPrice' => $request->input('fixedPrice', 0),
        ]);
    }

    private function normalizeEntity(string $entity): string
    {
        $key = strtolower(str_replace('_', '-', trim($entity)));
        if (in_array($key, ['supplier-types', 'suppliertypes'], true)) return 'supplier-types';
        if (in_array($key, ['payment-terms', 'paymentterms'], true)) return 'payment-terms';
        if (in_array($key, ['po-authorisation-levels', 'po-authorisationlevels', 'po-authorization-levels', 'poauthorizationlevels', 'po-authorisationlevels'], true)) return 'po-authorisation-levels';
        if (in_array($key, ['payment-methods', 'paymentmethods'], true)) return 'payment-methods';
        if ($key === 'shippers') return 'shippers';
        if (in_array($key, ['freight-costs', 'freightcosts'], true)) return 'freight-costs';
        abort(404, 'Unknown setup area.');
    }

    private function validator(Request $request, string $entity, ?string $id)
    {
        if ($entity === 'supplier-types') {
            $nameRules = ['required', 'string', 'max:100'];
            $nameRules[] = $id === null
                ? Rule::unique('suppliertype', 'typename')
                : Rule::unique('suppliertype', 'typename')->ignore((int) $id, 'typeid');

            return Validator::make($request->all(), ['name' => $nameRules]);
        }

        if ($entity === 'payment-terms') {
            $codeRules = ['required', 'string', 'max:2', 'regex:/^[A-Za-z0-9_]+$/'];
            $codeRules[] = $id === null ? Rule::unique('paymentterms', 'termsindicator') : Rule::in([$id]);
            $dayNumberRules = ['required', 'integer', 'min:1', $request->input('dueMode') === 'days' ? 'max:360' : 'max:31'];

            return Validator::make($request->all(), [
                'code' => $codeRules,
                'name' => ['required', 'string', 'max:40'],
                'dueMode' => ['required', Rule::in(['days', 'following-month'])],
                'dayNumber' => $dayNumberRules,
            ]);
        }

        if ($entity === 'po-authorisation-levels') {
            $current = $id === null ? null : $this->decodePoAuthKey($id);
            $validator = Validator::make($request->all(), [
                'userId' => ['required', 'string', 'max:20', Rule::exists('www_users', 'userid')],
                'currencyCode' => ['required', 'string', 'size:3', Rule::exists('currencies', 'currabrev')],
                'canCreate' => ['required', 'boolean'],
                'canReview' => ['required', 'boolean'],
                'authLevel' => ['required', 'numeric', 'min:0'],
                'offHold' => ['required', 'boolean'],
            ]);

            $validator->after(function ($validator) use ($request, $current) {
                $query = DB::table('purchorderauth')
                    ->where('userid', (string) $request->input('userId'))
                    ->where('currabrev', (string) $request->input('currencyCode'));

                if ($current !== null) {
                    $query->where(function ($query) use ($current) {
                        $query->where('userid', '<>', $current['userId'])->orWhere('currabrev', '<>', $current['currencyCode']);
                    });
                }

                if ($query->exists()) {
                    $validator->errors()->add('userId', 'This user already has an authorisation level for the selected currency.');
                }
            });

            return $validator;
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

        if ($entity === 'shippers') {
            $nameRules = ['required', 'string', 'max:40'];
            $nameRules[] = $id === null
                ? Rule::unique('shippers', 'shippername')
                : Rule::unique('shippers', 'shippername')->ignore((int) $id, 'shipper_id');

            return Validator::make($request->all(), [
                'name' => $nameRules,
                'minimumCharge' => ['required', 'numeric', 'min:0'],
            ]);
        }

        return Validator::make($request->all(), [
            'locationFrom' => ['required', 'string', 'max:5', Rule::exists('locations', 'loccode')],
            'destinationCountry' => ['nullable', 'string', 'max:40'],
            'destination' => ['required', 'string', 'max:40'],
            'shipperId' => ['required', 'integer', Rule::exists('shippers', 'shipper_id')],
            'cubRate' => ['required', 'numeric', 'min:0'],
            'kgRate' => ['required', 'numeric', 'min:0'],
            'maxKgs' => ['required', 'numeric', 'min:0'],
            'maxCub' => ['required', 'numeric', 'min:0'],
            'fixedPrice' => ['required', 'numeric', 'min:0'],
            'minimumCharge' => ['required', 'numeric', 'min:0'],
        ]);
    }

    private function entityExists(string $entity, string $id): bool
    {
        if ($entity === 'supplier-types') return DB::table('suppliertype')->where('typeid', (int) $id)->exists();
        if ($entity === 'payment-terms') return DB::table('paymentterms')->where('termsindicator', $id)->exists();
        if ($entity === 'po-authorisation-levels') {
            $current = $this->decodePoAuthKey($id);
            return DB::table('purchorderauth')->where('userid', $current['userId'])->where('currabrev', $current['currencyCode'])->exists();
        }
        if ($entity === 'payment-methods') return DB::table('paymentmethods')->where('paymentid', (int) $id)->exists();
        if ($entity === 'shippers') return DB::table('shippers')->where('shipper_id', (int) $id)->exists();
        return DB::table('freightcosts')->where('shipcostfromid', (int) $id)->exists();
    }

    private function deleteBlockers(string $entity, string $id): array
    {
        $blockers = [];
        if ($entity === 'supplier-types') {
            $this->addBlocker($blockers, 'Suppliers', DB::table('suppliers')->where('supptype', (int) $id)->count());
        } elseif ($entity === 'payment-terms') {
            $this->addBlocker($blockers, 'Customers', DB::table('debtorsmaster')->where('paymentterms', $id)->count());
            $this->addBlocker($blockers, 'Suppliers', DB::table('suppliers')->where('paymentterms', $id)->count());
        } elseif ($entity === 'payment-methods') {
            $paymentName = (string) DB::table('paymentmethods')->where('paymentid', (int) $id)->value('paymentname');
            $this->addBlocker($blockers, 'Bank transactions', DB::table('banktrans')->where('banktranstype', $paymentName)->count());
        } elseif ($entity === 'shippers') {
            $this->addBlocker($blockers, 'Sales orders', DB::table('salesorders')->where('shipvia', (int) $id)->count());
            $this->addBlocker($blockers, 'Customer transactions', DB::table('debtortrans')->where('shipvia', (int) $id)->count());
            $this->addBlocker($blockers, 'Freight costs', DB::table('freightcosts')->where('shipperid', (int) $id)->count());
        }
        return $blockers;
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

    private function poAuthKey(string $userId, string $currencyCode): string
    {
        return $userId . '::' . $currencyCode;
    }

    private function decodePoAuthKey(string $id): array
    {
        $parts = explode('::', $id, 2);
        return [
            'userId' => $parts[0] ?? '',
            'currencyCode' => $parts[1] ?? '',
        ];
    }

    private function entityLabel(string $entity): string
    {
        return [
            'supplier-types' => 'Supplier type',
            'payment-terms' => 'Payment term',
            'po-authorisation-levels' => 'Purchase order authorisation level',
            'payment-methods' => 'Payment method',
            'shippers' => 'Shipper',
            'freight-costs' => 'Freight cost',
        ][$entity] ?? 'Setup record';
    }
}
