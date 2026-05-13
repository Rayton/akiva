<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class SystemParametersController extends Controller
{
    private $parameterNames = [
        'DefaultDateFormat',
        'PastDueDays1',
        'PastDueDays2',
        'PastDueDays3',
        'DefaultCreditLimit',
        'CheckCreditLimits',
        'Show_Settled_LastMonth',
        'RomalpaClause',
        'QuickEntries',
        'MaxSerialItemsIssued',
        'FrequentlyOrderedItems',
        'SO_AllowSameItemMultipleTimes',
        'AllowOrderLineItemNarrative',
        'ItemDescriptionLanguages',
        'GoogleTranslatorAPIKey',
        'RequirePickingNote',
        'UpdateCurrencyRatesDaily',
        'ExchangeRateFeed',
        'PackNoteFormat',
        'PurchaseOrderPortraitFormat',
        'InvoicePortraitFormat',
        'InvoiceQuantityDefault',
        'DefaultBlindPackNote',
        'WorkingDaysWeek',
        'DispatchCutOffTime',
        'AllowSalesOfZeroCostItems',
        'CreditingControlledItems_MustExist',
        'DefaultPriceList',
        'Default_Shipper',
        'DoFreightCalc',
        'FreightChargeAppliesIfLessThan',
        'AutoDebtorNo',
        'AutoSupplierNo',
        'DefaultTaxCategory',
        'TaxAuthorityReferenceName',
        'CountryOfOperation',
        'StandardCostDecimalPlaces',
        'NumberOfPeriodsOfStockUsage',
        'ShowValueOnGRN',
        'PaymentVoucherSignatoryLevel',
        'Check_Qty_Charged_vs_Del_Qty',
        'Check_Price_Charged_vs_Order_Price',
        'OverChargeProportion',
        'OverReceiveProportion',
        'PO_AllowSameItemMultipleTimes',
        'AutoAuthorisePO',
        'SendPOEmailNotification',
        'SendPOSMSNotification',
        'YearEnd',
        'PageLength',
        'DefaultDisplayRecordsMax',
        'ShowStockidOnImages',
        'MaxImageSize',
        'NumberOfMonthMustBeShown',
        'part_pics_dir',
        'reports_dir',
        'HTTPS_Only',
        'DB_Maintenance',
        'WikiApp',
        'WikiPath',
        'geocode_integration',
        'Extended_CustomerInfo',
        'Extended_SupplierInfo',
        'ProhibitJournalsToControlAccounts',
        'ProhibitPostingsBefore',
        'WeightedAverageCosting',
        'AutoIssue',
        'ProhibitNegativeStock',
        'MonthsAuditTrail',
        'LogSeverity',
        'LogPath',
        'DefineControlledOnWOEntry',
        'AutoCreateWOs',
        'DefaultFactoryLocation',
        'FactoryManagerEmail',
        'PurchasingManagerEmail',
        'InventoryManagerEmail',
        'SmtpSetting',
        'QualityProdSpecText',
        'QualityCOAText',
        'QualityLogSamples',
        'ShortcutMenu',
        'LastDayOfWeek',
    ];

    public function show()
    {
        try {
            return response()->json([
                'success' => true,
                'data' => [
                    'parameters' => $this->parameters(),
                    'lookups' => $this->lookups(),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'System settings could not be loaded.',
                'data' => [
                    'parameters' => [],
                    'lookups' => $this->fallbackLookups(),
                ],
            ], 500);
        }
    }

    public function update(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'parameters' => ['required', 'array'],
            'parameters.*' => ['nullable'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $parameters = (array) $request->input('parameters', []);
        $allowed = array_flip($this->parameterNames);
        $updates = [];

        foreach ($parameters as $name => $value) {
            if (!isset($allowed[$name])) {
                continue;
            }

            $updates[$name] = is_array($value) ? implode(',', $value) : trim((string) $value);
        }

        $errors = $this->validateParameters($updates);
        if (count($errors) > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $errors,
            ], 422);
        }

        try {
            DB::transaction(function () use ($updates) {
                foreach ($updates as $name => $value) {
                    DB::table('config')->updateOrInsert(
                        ['confname' => $name],
                        ['confvalue' => $value]
                    );
                }
            });

            return response()->json([
                'success' => true,
                'message' => 'System settings updated.',
                'data' => [
                    'parameters' => $this->parameters(),
                    'lookups' => $this->lookups(),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'System settings could not be updated.',
            ], 500);
        }
    }

    private function parameters()
    {
        $rows = DB::table('config')
            ->whereIn('confname', $this->parameterNames)
            ->select('confname', 'confvalue')
            ->get();

        $values = [];
        foreach ($this->parameterNames as $name) {
            $values[$name] = '';
        }

        foreach ($rows as $row) {
            $values[(string) $row->confname] = (string) $row->confvalue;
        }

        if ($values['NumberOfMonthMustBeShown'] === '') {
            $legacyMonthValue = DB::table('config')
                ->where('confname', 'numberOfMonthMustBeShown')
                ->value('confvalue');
            if ($legacyMonthValue !== null) {
                $values['NumberOfMonthMustBeShown'] = (string) $legacyMonthValue;
            }
        }

        return $values;
    }

    private function validateParameters(array $parameters)
    {
        $errors = [];

        $numeric = [
            'PastDueDays1',
            'PastDueDays2',
            'PastDueDays3',
            'DefaultCreditLimit',
            'QuickEntries',
            'MaxSerialItemsIssued',
            'FrequentlyOrderedItems',
            'FreightChargeAppliesIfLessThan',
            'DefaultTaxCategory',
            'StandardCostDecimalPlaces',
            'NumberOfPeriodsOfStockUsage',
            'OverChargeProportion',
            'OverReceiveProportion',
            'YearEnd',
            'PageLength',
            'DefaultDisplayRecordsMax',
            'MaxImageSize',
            'NumberOfMonthMustBeShown',
            'MonthsAuditTrail',
            'DispatchCutOffTime',
        ];

        foreach ($numeric as $name) {
            if (isset($parameters[$name]) && $parameters[$name] !== '' && !is_numeric($parameters[$name])) {
                $errors[$name][] = $this->humanName($name) . ' must be numeric.';
            }
        }

        $rangeRules = [
            'QuickEntries' => [1, 99],
            'MaxSerialItemsIssued' => [1, null],
            'StandardCostDecimalPlaces' => [0, 4],
            'NumberOfPeriodsOfStockUsage' => [1, 12],
            'OverChargeProportion' => [0, 100],
            'OverReceiveProportion' => [0, 100],
            'PageLength' => [1, 999],
            'DefaultDisplayRecordsMax' => [1, 999],
            'MaxImageSize' => [1, 999],
            'MonthsAuditTrail' => [0, 99],
            'DispatchCutOffTime' => [0, 23],
        ];

        foreach ($rangeRules as $name => $range) {
            if (!isset($parameters[$name]) || !is_numeric($parameters[$name])) {
                continue;
            }
            $number = (float) $parameters[$name];
            if ($range[0] !== null && $number < $range[0]) {
                $errors[$name][] = $this->humanName($name) . ' is below the allowed minimum.';
            }
            if ($range[1] !== null && $number > $range[1]) {
                $errors[$name][] = $this->humanName($name) . ' is above the allowed maximum.';
            }
        }

        foreach (['FactoryManagerEmail', 'PurchasingManagerEmail', 'InventoryManagerEmail'] as $name) {
            if (!isset($parameters[$name]) || $parameters[$name] === '') {
                continue;
            }
            if (!filter_var($parameters[$name], FILTER_VALIDATE_EMAIL)) {
                $errors[$name][] = $this->humanName($name) . ' must be a valid email address.';
            }
        }

        foreach (['RomalpaClause', 'QualityProdSpecText', 'QualityCOAText'] as $name) {
            if (!isset($parameters[$name])) {
                continue;
            }
            if (strpos($parameters[$name], "'") !== false) {
                $errors[$name][] = $this->humanName($name) . ' may not contain single quotes.';
            }
            if (strlen($parameters[$name]) > 5000) {
                $errors[$name][] = $this->humanName($name) . ' may not exceed 5000 characters.';
            }
        }

        if (isset($parameters['TaxAuthorityReferenceName']) && strlen($parameters['TaxAuthorityReferenceName']) > 25) {
            $errors['TaxAuthorityReferenceName'][] = 'Tax authority reference name must be 25 characters or less.';
        }

        return $errors;
    }

    private function lookups()
    {
        return [
            'priceLists' => $this->keyValueRows('salestypes', 'typeabbrev', 'sales_type', 'sales_type'),
            'shippers' => $this->keyValueRows('shippers', 'shipper_id', 'shippername', 'shippername'),
            'taxCategories' => $this->keyValueRows('taxcategories', 'taxcatid', 'taxcatname', 'taxcatname'),
            'locations' => $this->keyValueRows('locations', 'loccode', 'locationname', 'locationname'),
            'periodLocks' => $this->periodLockOptions(),
        ];
    }

    private function fallbackLookups()
    {
        return [
            'priceLists' => [],
            'shippers' => [],
            'taxCategories' => [],
            'locations' => [],
            'periodLocks' => [],
        ];
    }

    private function keyValueRows($table, $valueColumn, $labelColumn, $orderColumn)
    {
        try {
            return DB::table($table)
                ->select($valueColumn . ' as value', $labelColumn . ' as label')
                ->orderBy($orderColumn)
                ->get()
                ->map(function ($row) {
                    return [
                        'value' => (string) $row->value,
                        'label' => (string) $row->label,
                    ];
                })
                ->all();
        } catch (\Throwable $e) {
            return [];
        }
    }

    private function periodLockOptions()
    {
        try {
            $options = [
                ['value' => '1900-01-01', 'label' => 'No period lock'],
            ];

            $rows = DB::table('periods')
                ->select('lastdate_in_period')
                ->orderBy('periodno', 'desc')
                ->limit(120)
                ->get();

            foreach ($rows as $row) {
                $date = (string) $row->lastdate_in_period;
                $options[] = ['value' => $date, 'label' => $date];
            }

            return $options;
        } catch (\Throwable $e) {
            return [];
        }
    }

    private function humanName($name)
    {
        $spaced = preg_replace('/(?<!^)[A-Z]/', ' $0', str_replace('_', ' ', $name));
        return trim((string) $spaced);
    }
}
