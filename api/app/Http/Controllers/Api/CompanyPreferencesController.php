<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class CompanyPreferencesController extends Controller
{
    public function show()
    {
        try {
            return response()->json([
                'success' => true,
                'data' => $this->preferencesPayload(),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Company preferences could not be loaded.',
                'data' => $this->fallbackPayload(),
            ], 500);
        }
    }

    public function update(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'coyName' => ['required', 'string', 'max:50'],
            'companyNumber' => ['nullable', 'string', 'max:20'],
            'gstNo' => ['nullable', 'string', 'max:20'],
            'regOffice1' => ['required', 'string', 'max:40'],
            'regOffice2' => ['nullable', 'string', 'max:40'],
            'regOffice3' => ['nullable', 'string', 'max:40'],
            'regOffice4' => ['nullable', 'string', 'max:40'],
            'regOffice5' => ['nullable', 'string', 'max:20'],
            'regOffice6' => ['nullable', 'string', 'max:15'],
            'telephone' => ['required', 'string', 'max:25'],
            'fax' => ['nullable', 'string', 'max:25'],
            'email' => ['required', 'email', 'max:55'],
            'location1' => ['nullable', 'string', 'max:255'],
            'location2' => ['nullable', 'string', 'max:255'],
            'office1' => ['nullable', 'string', 'max:255'],
            'office2' => ['nullable', 'string', 'max:255'],
            'fax2' => ['nullable', 'string', 'max:255'],
            'telephone2' => ['nullable', 'string', 'max:255'],
            'website' => ['nullable', 'string', 'max:255'],
            'currencyDefault' => ['required', 'string', 'max:3', 'exists:currencies,currabrev'],
            'debtorsAct' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'creditorsAct' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'payrollAct' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'grnAct' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'retainedEarnings' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'freightAct' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'exchangeDiffAct' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'purchasesExchangeDiffAct' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'pytDiscountAct' => ['required', 'string', 'max:20', 'exists:chartmaster,accountcode'],
            'glLinkDebtors' => ['required', 'boolean'],
            'glLinkCreditors' => ['required', 'boolean'],
            'glLinkStock' => ['required', 'boolean'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $payload = $validator->validated();

        try {
            DB::transaction(function () use ($payload) {
                DB::table('companies')->updateOrInsert(
                    ['coycode' => 1],
                    [
                        'coyname' => $payload['coyName'],
                        'companynumber' => $payload['companyNumber'] ?? '',
                        'gstno' => $payload['gstNo'] ?? '',
                        'regoffice1' => $payload['regOffice1'],
                        'regoffice2' => $payload['regOffice2'] ?? '',
                        'regoffice3' => $payload['regOffice3'] ?? '',
                        'regoffice4' => $payload['regOffice4'] ?? '',
                        'regoffice5' => $payload['regOffice5'] ?? '',
                        'regoffice6' => $payload['regOffice6'] ?? '',
                        'telephone' => $payload['telephone'],
                        'fax' => $payload['fax'] ?? '',
                        'email' => $payload['email'],
                        'currencydefault' => strtoupper($payload['currencyDefault']),
                        'debtorsact' => $payload['debtorsAct'],
                        'pytdiscountact' => $payload['pytDiscountAct'],
                        'creditorsact' => $payload['creditorsAct'],
                        'payrollact' => $payload['payrollAct'],
                        'grnact' => $payload['grnAct'],
                        'exchangediffact' => $payload['exchangeDiffAct'],
                        'purchasesexchangediffact' => $payload['purchasesExchangeDiffAct'],
                        'retainedearnings' => $payload['retainedEarnings'],
                        'gllink_debtors' => $payload['glLinkDebtors'] ? 1 : 0,
                        'gllink_creditors' => $payload['glLinkCreditors'] ? 1 : 0,
                        'gllink_stock' => $payload['glLinkStock'] ? 1 : 0,
                        'freightact' => $payload['freightAct'],
                        'location_1' => $payload['location1'] ?? '',
                        'location_2' => $payload['location2'] ?? '',
                        'office_1' => $payload['office1'] ?? '',
                        'office_2' => $payload['office2'] ?? '',
                        'fax_2' => $payload['fax2'] ?? '',
                        'telephone_2' => $payload['telephone2'] ?? '',
                        'website' => $payload['website'] ?? '',
                    ]
                );

                $newCurrencyRate = (float) (DB::table('currencies')
                    ->where('currabrev', strtoupper($payload['currencyDefault']))
                    ->value('rate') ?? 0);

                if ($newCurrencyRate > 0) {
                    DB::table('currencies')->update([
                        'rate' => DB::raw('rate / ' . $newCurrencyRate),
                    ]);
                }
            });

            return response()->json([
                'success' => true,
                'message' => 'Company preferences updated.',
                'data' => $this->preferencesPayload(),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Company preferences could not be updated.',
            ], 500);
        }
    }

    private function preferencesPayload(): array
    {
        $company = DB::table('companies')->where('coycode', 1)->first();

        return [
            'preferences' => $this->mapCompany($company),
            'currencies' => $this->currencyOptions(),
            'balanceSheetAccounts' => $this->accountOptions(0),
            'profitLossAccounts' => $this->accountOptions(1),
        ];
    }

    private function fallbackPayload(): array
    {
        return [
            'preferences' => $this->mapCompany(null),
            'currencies' => [],
            'balanceSheetAccounts' => [],
            'profitLossAccounts' => [],
        ];
    }

    private function mapCompany(?object $company): array
    {
        return [
            'coyName' => (string) ($company->coyname ?? 'Company'),
            'companyNumber' => (string) ($company->companynumber ?? ''),
            'gstNo' => (string) ($company->gstno ?? ''),
            'regOffice1' => (string) ($company->regoffice1 ?? ''),
            'regOffice2' => (string) ($company->regoffice2 ?? ''),
            'regOffice3' => (string) ($company->regoffice3 ?? ''),
            'regOffice4' => (string) ($company->regoffice4 ?? ''),
            'regOffice5' => (string) ($company->regoffice5 ?? ''),
            'regOffice6' => (string) ($company->regoffice6 ?? ''),
            'telephone' => (string) ($company->telephone ?? ''),
            'fax' => (string) ($company->fax ?? ''),
            'email' => (string) ($company->email ?? ''),
            'location1' => (string) ($company->location_1 ?? ''),
            'location2' => (string) ($company->location_2 ?? ''),
            'office1' => (string) ($company->office_1 ?? ''),
            'office2' => (string) ($company->office_2 ?? ''),
            'fax2' => (string) ($company->fax_2 ?? ''),
            'telephone2' => (string) ($company->telephone_2 ?? ''),
            'website' => (string) ($company->website ?? ''),
            'currencyDefault' => (string) ($company->currencydefault ?? 'USD'),
            'debtorsAct' => (string) ($company->debtorsact ?? ''),
            'creditorsAct' => (string) ($company->creditorsact ?? ''),
            'payrollAct' => (string) ($company->payrollact ?? ''),
            'grnAct' => (string) ($company->grnact ?? ''),
            'retainedEarnings' => (string) ($company->retainedearnings ?? ''),
            'freightAct' => (string) ($company->freightact ?? ''),
            'exchangeDiffAct' => (string) ($company->exchangediffact ?? ''),
            'purchasesExchangeDiffAct' => (string) ($company->purchasesexchangediffact ?? ''),
            'pytDiscountAct' => (string) ($company->pytdiscountact ?? ''),
            'glLinkDebtors' => ((int) ($company->gllink_debtors ?? 1)) === 1,
            'glLinkCreditors' => ((int) ($company->gllink_creditors ?? 1)) === 1,
            'glLinkStock' => ((int) ($company->gllink_stock ?? 1)) === 1,
        ];
    }

    private function currencyOptions(): array
    {
        return DB::table('currencies')
            ->select('currabrev', 'currency')
            ->orderBy('currency')
            ->get()
            ->map(function ($row) {
                return [
                'code' => (string) $row->currabrev,
                'name' => (string) $row->currency,
                ];
            })
            ->all();
    }

    private function accountOptions(int $pandL): array
    {
        return DB::table('chartmaster as cm')
            ->join('accountgroups as ag', 'cm.group_', '=', 'ag.groupname')
            ->where('ag.pandl', $pandL)
            ->select('cm.accountcode', 'cm.accountname')
            ->orderBy('cm.accountcode')
            ->get()
            ->map(function ($row) {
                return [
                'code' => (string) $row->accountcode,
                'name' => (string) $row->accountname,
                'label' => trim((string) $row->accountname) . ' (' . (string) $row->accountcode . ')',
                ];
            })
            ->all();
    }
}
