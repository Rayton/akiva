<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class GeneralLedgerSetupController extends Controller
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
        if ($normalized === 'periods') {
            return $this->readOnlyResponse();
        }

        $validator = $this->validator($request, $normalized, null);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();
        $id = $this->insertEntity($normalized, $data);

        return response()->json([
            'success' => true,
            'message' => $this->entityLabel($normalized) . ' created.',
            'data' => array_merge($this->payload(), ['selectedId' => $id]),
        ], 201);
    }

    public function update(Request $request, string $entity, string $id)
    {
        $normalized = $this->normalizeEntity($entity);
        if ($normalized === 'periods') {
            return $this->readOnlyResponse();
        }

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

        $this->updateEntity($normalized, $id, $validator->validated());

        return response()->json([
            'success' => true,
            'message' => $this->entityLabel($normalized) . ' updated.',
            'data' => array_merge($this->payload(), ['selectedId' => $id]),
        ]);
    }

    public function destroy(string $entity, string $id)
    {
        $normalized = $this->normalizeEntity($entity);
        if ($normalized === 'periods') {
            return $this->readOnlyResponse();
        }

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
                'message' => 'Cannot delete because related records exist.',
                'dependencies' => $blocked,
            ], 409);
        }

        $this->deleteEntity($normalized, $id);

        return response()->json([
            'success' => true,
            'message' => $this->entityLabel($normalized) . ' deleted.',
            'data' => $this->payload(),
        ]);
    }

    private function payload(): array
    {
        $accounts = DB::table('chartmaster')
            ->select('accountcode', 'accountname')
            ->orderBy('accountcode')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->accountcode,
                    'name' => (string) $row->accountname,
                ];
            })
            ->values();

        $currencies = DB::table('currencies')
            ->select('currency', 'currabrev', 'country', 'hundredsname', 'decimalplaces', 'rate', 'webcart')
            ->orderBy('currabrev')
            ->get()
            ->map(static function ($row) {
                return [
                    'code' => (string) $row->currabrev,
                    'name' => (string) $row->currency,
                    'country' => (string) $row->country,
                    'hundredsName' => (string) $row->hundredsname,
                    'decimalPlaces' => (int) $row->decimalplaces,
                    'rate' => (float) $row->rate,
                    'webcart' => ((int) $row->webcart) === 1,
                ];
            })
            ->values();

        $bankAccounts = DB::table('bankaccounts as ba')
            ->leftJoin('chartmaster as cm', 'cm.accountcode', '=', 'ba.accountcode')
            ->leftJoin('currencies as cur', 'cur.currabrev', '=', 'ba.currcode')
            ->select(
                'ba.accountcode',
                'cm.accountname',
                'ba.currcode',
                'cur.currency',
                'ba.invoice',
                'ba.bankaccountcode',
                'ba.bankaccountname',
                'ba.bankaccountnumber',
                'ba.bankaddress',
                'ba.importformat'
            )
            ->orderBy('ba.accountcode')
            ->get()
            ->map(static function ($row) {
                return [
                    'accountCode' => (string) $row->accountcode,
                    'accountName' => (string) ($row->accountname ?? ''),
                    'currencyCode' => (string) $row->currcode,
                    'currencyName' => (string) ($row->currency ?? ''),
                    'invoiceMode' => (int) $row->invoice,
                    'bankAccountCode' => (string) $row->bankaccountcode,
                    'bankAccountName' => (string) $row->bankaccountname,
                    'bankAccountNumber' => (string) $row->bankaccountnumber,
                    'bankAddress' => (string) $row->bankaddress,
                    'importFormat' => (string) $row->importformat,
                ];
            })
            ->values();

        $taxAuthorities = DB::table('taxauthorities as ta')
            ->leftJoin('chartmaster as sales_cm', 'sales_cm.accountcode', '=', 'ta.taxglcode')
            ->leftJoin('chartmaster as purchase_cm', 'purchase_cm.accountcode', '=', 'ta.purchtaxglaccount')
            ->select(
                'ta.taxid',
                'ta.description',
                'ta.taxglcode',
                'ta.purchtaxglaccount',
                'ta.bank',
                'ta.bankacctype',
                'ta.bankacc',
                'ta.bankswift',
                'sales_cm.accountname as sales_account_name',
                'purchase_cm.accountname as purchase_account_name'
            )
            ->orderBy('ta.taxid')
            ->get()
            ->map(static function ($row) {
                return [
                    'taxId' => (int) $row->taxid,
                    'description' => (string) $row->description,
                    'salesTaxAccountCode' => (string) $row->taxglcode,
                    'salesTaxAccountName' => (string) ($row->sales_account_name ?? ''),
                    'purchaseTaxAccountCode' => (string) $row->purchtaxglaccount,
                    'purchaseTaxAccountName' => (string) ($row->purchase_account_name ?? ''),
                    'bank' => (string) $row->bank,
                    'bankAccountType' => (string) $row->bankacctype,
                    'bankAccount' => (string) $row->bankacc,
                    'bankSwift' => (string) $row->bankswift,
                ];
            })
            ->values();

        $taxGroups = DB::table('taxgroups')
            ->select('taxgroupid', 'taxgroupdescription')
            ->orderBy('taxgroupid')
            ->get()
            ->map(static function ($row) {
                return [
                    'taxGroupId' => (int) $row->taxgroupid,
                    'description' => (string) $row->taxgroupdescription,
                ];
            })
            ->values();

        $taxProvinces = DB::table('taxprovinces')
            ->select('taxprovinceid', 'taxprovincename')
            ->orderBy('taxprovinceid')
            ->get()
            ->map(static function ($row) {
                return [
                    'taxProvinceId' => (int) $row->taxprovinceid,
                    'name' => (string) $row->taxprovincename,
                ];
            })
            ->values();

        $taxCategories = DB::table('taxcategories')
            ->select('taxcatid', 'taxcatname')
            ->orderBy('taxcatid')
            ->get()
            ->map(static function ($row) {
                return [
                    'taxCategoryId' => (int) $row->taxcatid,
                    'name' => (string) $row->taxcatname,
                ];
            })
            ->values();

        $periods = DB::table('periods')
            ->select('periodno', 'lastdate_in_period')
            ->orderByDesc('periodno')
            ->limit(250)
            ->get()
            ->map(static function ($row) {
                return [
                    'periodNo' => (int) $row->periodno,
                    'lastDateInPeriod' => (string) $row->lastdate_in_period,
                ];
            })
            ->values();

        return [
            'bankAccounts' => $bankAccounts->all(),
            'currencies' => $currencies->all(),
            'taxAuthorities' => $taxAuthorities->all(),
            'taxGroups' => $taxGroups->all(),
            'taxProvinces' => $taxProvinces->all(),
            'taxCategories' => $taxCategories->all(),
            'periods' => $periods->all(),
            'lookups' => [
                'accounts' => $accounts->all(),
                'currencies' => $currencies->map(static function ($row) {
                    return [
                        'code' => $row['code'],
                        'name' => $row['name'],
                    ];
                })->all(),
            ],
            'stats' => [
                'bankAccounts' => $bankAccounts->count(),
                'currencies' => $currencies->count(),
                'taxAuthorities' => $taxAuthorities->count(),
                'taxGroups' => $taxGroups->count(),
                'taxProvinces' => $taxProvinces->count(),
                'taxCategories' => $taxCategories->count(),
                'periods' => $periods->count(),
            ],
        ];
    }

    private function normalizeEntity(string $entity): string
    {
        $key = strtolower(str_replace('_', '-', trim($entity)));
        $allowed = [
            'bank-accounts',
            'currencies',
            'tax-authorities',
            'tax-groups',
            'tax-provinces',
            'tax-categories',
            'periods',
        ];

        abort_unless(in_array($key, $allowed, true), 404, 'Unknown setup area.');
        return $key;
    }

    private function validator(Request $request, string $entity, ?string $id)
    {
        $rules = [];

        if ($entity === 'bank-accounts') {
            $accountRule = $id === null
                ? ['required', 'string', 'max:20', 'exists:chartmaster,accountcode', 'unique:bankaccounts,accountcode']
                : ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'];
            $rules = [
                'accountCode' => $accountRule,
                'currencyCode' => ['required', 'string', 'size:3', 'exists:currencies,currabrev'],
                'invoiceMode' => ['required', 'integer', 'between:0,2'],
                'bankAccountCode' => ['nullable', 'string', 'max:50'],
                'bankAccountName' => ['required', 'string', 'max:50'],
                'bankAccountNumber' => ['nullable', 'string', 'max:50'],
                'bankAddress' => ['nullable', 'string', 'max:50'],
                'importFormat' => ['nullable', 'string', 'max:10'],
            ];
        } elseif ($entity === 'currencies') {
            $codeRules = ['required', 'string', 'size:3'];
            $codeRules[] = $id === null ? 'unique:currencies,currabrev' : Rule::in([strtoupper($id)]);
            $rules = [
                'code' => $codeRules,
                'name' => ['required', 'string', 'max:20'],
                'country' => ['nullable', 'string', 'max:50'],
                'hundredsName' => ['nullable', 'string', 'max:15'],
                'decimalPlaces' => ['required', 'integer', 'between:0,8'],
                'rate' => ['required', 'numeric', 'min:0'],
                'webcart' => ['boolean'],
            ];
        } elseif ($entity === 'tax-authorities') {
            $rules = [
                'description' => ['required', 'string', 'max:20'],
                'salesTaxAccountCode' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
                'purchaseTaxAccountCode' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
                'bank' => ['nullable', 'string', 'max:50'],
                'bankAccountType' => ['nullable', 'string', 'max:20'],
                'bankAccount' => ['nullable', 'string', 'max:50'],
                'bankSwift' => ['nullable', 'string', 'max:30'],
            ];
        } elseif ($entity === 'tax-groups') {
            $rules = ['description' => ['required', 'string', 'max:30']];
        } elseif ($entity === 'tax-provinces') {
            $rules = ['name' => ['required', 'string', 'max:30']];
        } elseif ($entity === 'tax-categories') {
            $rules = ['name' => ['required', 'string', 'max:30']];
        }

        return Validator::make($request->all(), $rules);
    }

    private function validationResponse($validator)
    {
        return response()->json([
            'success' => false,
            'message' => 'Validation failed.',
            'errors' => $validator->errors(),
        ], 422);
    }

    private function insertEntity(string $entity, array $data)
    {
        if ($entity === 'bank-accounts') {
            $id = strtoupper(trim((string) $data['accountCode']));
            DB::table('bankaccounts')->insert($this->bankAccountRow($data, $id));
            return $id;
        }

        if ($entity === 'currencies') {
            $id = strtoupper(trim((string) $data['code']));
            DB::table('currencies')->insert($this->currencyRow($data, $id));
            return $id;
        }

        if ($entity === 'tax-authorities') {
            return DB::table('taxauthorities')->insertGetId($this->taxAuthorityRow($data), 'taxid');
        }

        if ($entity === 'tax-groups') {
            return DB::table('taxgroups')->insertGetId(['taxgroupdescription' => trim((string) $data['description'])], 'taxgroupid');
        }

        if ($entity === 'tax-provinces') {
            return DB::table('taxprovinces')->insertGetId(['taxprovincename' => trim((string) $data['name'])], 'taxprovinceid');
        }

        if ($entity === 'tax-categories') {
            return DB::table('taxcategories')->insertGetId(['taxcatname' => trim((string) $data['name'])], 'taxcatid');
        }

        return null;
    }

    private function updateEntity(string $entity, string $id, array $data): void
    {
        if ($entity === 'bank-accounts') {
            DB::table('bankaccounts')->where('accountcode', strtoupper($id))->update($this->bankAccountRow($data, strtoupper($id)));
        } elseif ($entity === 'currencies') {
            DB::table('currencies')->where('currabrev', strtoupper($id))->update($this->currencyRow($data, strtoupper($id)));
        } elseif ($entity === 'tax-authorities') {
            DB::table('taxauthorities')->where('taxid', (int) $id)->update($this->taxAuthorityRow($data));
        } elseif ($entity === 'tax-groups') {
            DB::table('taxgroups')->where('taxgroupid', (int) $id)->update(['taxgroupdescription' => trim((string) $data['description'])]);
        } elseif ($entity === 'tax-provinces') {
            DB::table('taxprovinces')->where('taxprovinceid', (int) $id)->update(['taxprovincename' => trim((string) $data['name'])]);
        } elseif ($entity === 'tax-categories') {
            DB::table('taxcategories')->where('taxcatid', (int) $id)->update(['taxcatname' => trim((string) $data['name'])]);
        }
    }

    private function deleteEntity(string $entity, string $id): void
    {
        if ($entity === 'bank-accounts') {
            DB::table('bankaccounts')->where('accountcode', strtoupper($id))->delete();
        } elseif ($entity === 'currencies') {
            DB::table('currencies')->where('currabrev', strtoupper($id))->delete();
        } elseif ($entity === 'tax-authorities') {
            DB::table('taxauthorities')->where('taxid', (int) $id)->delete();
        } elseif ($entity === 'tax-groups') {
            DB::table('taxgroups')->where('taxgroupid', (int) $id)->delete();
        } elseif ($entity === 'tax-provinces') {
            DB::table('taxprovinces')->where('taxprovinceid', (int) $id)->delete();
        } elseif ($entity === 'tax-categories') {
            DB::table('taxcategories')->where('taxcatid', (int) $id)->delete();
        }
    }

    private function entityExists(string $entity, string $id): bool
    {
        if ($entity === 'bank-accounts') return DB::table('bankaccounts')->where('accountcode', strtoupper($id))->exists();
        if ($entity === 'currencies') return DB::table('currencies')->where('currabrev', strtoupper($id))->exists();
        if ($entity === 'tax-authorities') return DB::table('taxauthorities')->where('taxid', (int) $id)->exists();
        if ($entity === 'tax-groups') return DB::table('taxgroups')->where('taxgroupid', (int) $id)->exists();
        if ($entity === 'tax-provinces') return DB::table('taxprovinces')->where('taxprovinceid', (int) $id)->exists();
        if ($entity === 'tax-categories') return DB::table('taxcategories')->where('taxcatid', (int) $id)->exists();
        return false;
    }

    private function deleteBlockers(string $entity, string $id): array
    {
        $blockers = [];

        if ($entity === 'bank-accounts') {
            $code = strtoupper($id);
            $this->addBlocker($blockers, 'Bank transactions', DB::table('banktrans')->where('bankact', $code)->count());
            $this->addBlocker($blockers, 'User authorisations', DB::table('bankaccountusers')->where('accountcode', $code)->count());
        } elseif ($entity === 'currencies') {
            $code = strtoupper($id);
            $this->addBlocker($blockers, 'Bank accounts', DB::table('bankaccounts')->where('currcode', $code)->count());
            $this->addBlocker($blockers, 'Company preferences', DB::table('companies')->where('currencydefault', $code)->count());
        } elseif ($entity === 'tax-authorities') {
            $taxId = (int) $id;
            $this->addBlocker($blockers, 'Tax group links', DB::table('taxgrouptaxes')->where('taxauthid', $taxId)->count());
        } elseif ($entity === 'tax-groups') {
            $groupId = (int) $id;
            $this->addBlocker($blockers, 'Tax group links', DB::table('taxgrouptaxes')->where('taxgroupid', $groupId)->count());
            $this->addBlocker($blockers, 'Customer branches', DB::table('custbranch')->where('taxgroupid', $groupId)->count());
            $this->addBlocker($blockers, 'Suppliers', DB::table('suppliers')->where('taxgroupid', $groupId)->count());
        } elseif ($entity === 'tax-provinces') {
            $provinceId = (int) $id;
            $this->addBlocker($blockers, 'Tax group links', DB::table('taxgrouptaxes')->where('taxprovinceid', $provinceId)->count());
            $this->addBlocker($blockers, 'Locations', DB::table('locations')->where('taxprovinceid', $provinceId)->count());
        } elseif ($entity === 'tax-categories') {
            $categoryId = (int) $id;
            $this->addBlocker($blockers, 'Tax group links', DB::table('taxgrouptaxes')->where('taxcatid', $categoryId)->count());
            $this->addBlocker($blockers, 'Stock categories', DB::table('stockcategory')->where('defaulttaxcatid', $categoryId)->count());
            $this->addBlocker($blockers, 'Stock items', DB::table('stockmaster')->where('taxcatid', $categoryId)->count());
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

    private function bankAccountRow(array $data, string $accountCode): array
    {
        return [
            'accountcode' => strtoupper(trim($accountCode)),
            'currcode' => strtoupper(trim((string) $data['currencyCode'])),
            'invoice' => (int) $data['invoiceMode'],
            'bankaccountcode' => trim((string) ($data['bankAccountCode'] ?? '')),
            'bankaccountname' => trim((string) $data['bankAccountName']),
            'bankaccountnumber' => trim((string) ($data['bankAccountNumber'] ?? '')),
            'bankaddress' => trim((string) ($data['bankAddress'] ?? '')),
            'importformat' => trim((string) ($data['importFormat'] ?? '')),
        ];
    }

    private function currencyRow(array $data, string $code): array
    {
        return [
            'currabrev' => strtoupper(trim($code)),
            'currency' => trim((string) $data['name']),
            'country' => trim((string) ($data['country'] ?? '')),
            'hundredsname' => trim((string) ($data['hundredsName'] ?? '')),
            'decimalplaces' => (int) $data['decimalPlaces'],
            'rate' => (float) $data['rate'],
            'webcart' => !empty($data['webcart']) ? 1 : 0,
        ];
    }

    private function taxAuthorityRow(array $data): array
    {
        return [
            'description' => trim((string) $data['description']),
            'taxglcode' => strtoupper(trim((string) $data['salesTaxAccountCode'])),
            'purchtaxglaccount' => strtoupper(trim((string) $data['purchaseTaxAccountCode'])),
            'bank' => trim((string) ($data['bank'] ?? '')),
            'bankacctype' => trim((string) ($data['bankAccountType'] ?? '')),
            'bankacc' => trim((string) ($data['bankAccount'] ?? '')),
            'bankswift' => trim((string) ($data['bankSwift'] ?? '')),
        ];
    }

    private function entityLabel(string $entity): string
    {
        return [
            'bank-accounts' => 'Bank account',
            'currencies' => 'Currency',
            'tax-authorities' => 'Tax authority',
            'tax-groups' => 'Tax group',
            'tax-provinces' => 'Tax province',
            'tax-categories' => 'Tax category',
            'periods' => 'Period',
        ][$entity] ?? 'Record';
    }

    private function readOnlyResponse()
    {
        return response()->json([
            'success' => false,
            'message' => 'Accounting periods are maintained automatically and are read-only here.',
        ], 422);
    }
}
