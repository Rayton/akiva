<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class MarkupPriceController extends Controller
{
    private const OPEN_END_DATE = '9999-12-31';

    public function workbench()
    {
        return response()->json([
            'success' => true,
            'data' => [
                'lookups' => $this->lookups(),
                'defaults' => $this->defaults(),
                'stats' => $this->stats(),
            ],
        ]);
    }

    public function preview(Request $request)
    {
        if (!$this->hasRequiredTables()) {
            return $this->unavailableResponse();
        }

        $this->prepareRequest($request);
        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $this->normalizeData($validator->validated());

        try {
            return response()->json([
                'success' => true,
                'data' => $this->runPayload($data),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Markup price preview could not be calculated.',
            ], 500);
        }
    }

    public function apply(Request $request)
    {
        if (!$this->hasRequiredTables()) {
            return $this->unavailableResponse();
        }

        $this->prepareRequest($request);
        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $this->normalizeData($validator->validated());

        try {
            $payload = DB::transaction(function () use ($data) {
                $payload = $this->runPayload($data);
                $closed = 0;
                $inserted = 0;
                $updated = 0;

                foreach ($payload['rows'] as $row) {
                    if ($row['status'] !== 'ready') {
                        continue;
                    }

                    $closed += $this->closeCurrentPrice($row, $data);
                    $result = $this->upsertPrice($row, $data);
                    $inserted += $result === 'inserted' ? 1 : 0;
                    $updated += $result === 'updated' ? 1 : 0;
                }

                $payload['summary']['currentRowsClosed'] = $closed;
                $payload['summary']['insertedCount'] = $inserted;
                $payload['summary']['updatedPriceCount'] = $updated;

                return $payload;
            });

            return response()->json([
                'success' => true,
                'message' => 'Markup prices applied.',
                'data' => $payload,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Markup prices could not be applied.',
            ], 500);
        }
    }

    private function runPayload(array $data): array
    {
        $rows = $this->previewRows($data);

        return [
            'form' => $data,
            'rows' => $rows,
            'summary' => $this->summary($rows),
        ];
    }

    private function previewRows(array $data): array
    {
        $items = $this->stockItems((string) $data['categoryFrom'], (string) $data['categoryTo']);
        $currencyRate = $this->currencyRate((string) $data['currency']);
        $currentPrices = $this->activePriceMap((string) $data['priceList'], (string) $data['currency']);
        $basePrices = $data['costBasis'] === 'other-price-list'
            ? $this->activePriceMap((string) $data['basePriceList'], (string) $data['currency'])
            : [];
        $preferredCosts = $data['costBasis'] === 'preferred-supplier' ? $this->preferredCostMap() : [];

        return $items->map(function ($item) use ($data, $currencyRate, $currentPrices, $basePrices, $preferredCosts) {
            $stockId = (string) $item->stockid;
            $basis = $this->basisCost($item, $data, $basePrices, $preferredCosts);
            $current = $currentPrices[$stockId] ?? null;
            $reason = $basis['reason'];
            $newPrice = null;

            if ($basis['cost'] > 0) {
                $rawPrice = $data['costBasis'] === 'other-price-list'
                    ? $basis['cost'] * (1 + ((float) $data['markupPercent'] / 100))
                    : $basis['cost'] * (1 + ((float) $data['markupPercent'] / 100)) * $currencyRate;
                $newPrice = $this->roundPrice($rawPrice, (float) $data['roundingFactor']);
            }

            $status = $newPrice === null ? 'skipped' : 'ready';
            $action = 'skipped';
            if ($status === 'ready') {
                $action = $current === null ? 'insert' : (((string) $current['startDate'] === (string) $data['startDate']) ? 'update' : 'replace');
            }

            return [
                'stockId' => $stockId,
                'description' => html_entity_decode((string) $item->description),
                'categoryId' => (string) $item->categoryid,
                'categoryName' => html_entity_decode((string) ($item->category_name ?? $item->categoryid)),
                'units' => (string) ($item->units ?? 'each'),
                'decimalPlaces' => (int) ($item->decimalplaces ?? 0),
                'basisCost' => $basis['cost'] > 0 ? round($basis['cost'], 4) : null,
                'currentPrice' => $current === null ? null : (float) $current['price'],
                'currentStartDate' => $current['startDate'] ?? null,
                'currentEndDate' => $current['endDate'] ?? null,
                'newPrice' => $newPrice,
                'currency' => (string) $data['currency'],
                'status' => $status,
                'action' => $action,
                'reason' => $status === 'ready' ? '' : $reason,
            ];
        })->values()->all();
    }

    private function basisCost($item, array $data, array $basePrices, array $preferredCosts): array
    {
        $stockId = (string) $item->stockid;

        if ($data['costBasis'] === 'other-price-list') {
            $base = $basePrices[$stockId] ?? null;
            if ($base === null || (float) $base['price'] <= 0) {
                return ['cost' => 0.0, 'reason' => 'No active base price'];
            }

            return ['cost' => (float) $base['price'], 'reason' => ''];
        }

        if ($data['costBasis'] === 'preferred-supplier') {
            $preferred = $preferredCosts[$stockId] ?? null;
            if ($preferred === null) {
                return ['cost' => 0.0, 'reason' => 'No preferred supplier cost'];
            }
            if (($preferred['count'] ?? 0) > 1) {
                return ['cost' => 0.0, 'reason' => 'Multiple preferred supplier costs'];
            }
            if ((float) $preferred['cost'] <= 0) {
                return ['cost' => 0.0, 'reason' => 'Preferred supplier cost is zero'];
            }

            return ['cost' => (float) $preferred['cost'], 'reason' => ''];
        }

        $cost = (float) $item->materialcost + (float) $item->labourcost + (float) $item->overheadcost;
        if ($cost <= 0) {
            return ['cost' => 0.0, 'reason' => 'Standard cost is zero'];
        }

        return ['cost' => $cost, 'reason' => ''];
    }

    private function closeCurrentPrice(array $row, array $data): int
    {
        if (!in_array($row['action'], ['replace'], true) || empty($row['currentStartDate']) || empty($row['currentEndDate'])) {
            return 0;
        }

        $dayBefore = Carbon::parse((string) $data['startDate'])->subDay()->toDateString();

        return DB::table('prices')
            ->where('stockid', (string) $row['stockId'])
            ->where('typeabbrev', (string) $data['priceList'])
            ->where('currabrev', (string) $data['currency'])
            ->where('debtorno', '')
            ->where('branchcode', '')
            ->where('startdate', (string) $row['currentStartDate'])
            ->where('enddate', (string) $row['currentEndDate'])
            ->update(['enddate' => $dayBefore]);
    }

    private function upsertPrice(array $row, array $data): string
    {
        $match = [
            'stockid' => (string) $row['stockId'],
            'typeabbrev' => (string) $data['priceList'],
            'currabrev' => (string) $data['currency'],
            'debtorno' => '',
            'branchcode' => '',
            'startdate' => (string) $data['startDate'],
        ];

        $payload = [
            'enddate' => (string) ($data['endDate'] ?: self::OPEN_END_DATE),
            'price' => (float) $row['newPrice'],
            'units' => (string) ($row['units'] ?: 'each'),
            'conversionfactor' => 1,
            'decimalplaces' => (int) ($row['decimalPlaces'] ?? 0),
        ];

        $existing = DB::table('prices')
            ->where($match)
            ->orderByDesc('enddate')
            ->first();

        if ($existing) {
            DB::table('prices')
                ->where($match)
                ->where('enddate', (string) $existing->enddate)
                ->update($payload);

            return 'updated';
        }

        DB::table('prices')->insert(array_merge($match, $payload));
        return 'inserted';
    }

    private function summary(array $rows): array
    {
        $ready = array_values(array_filter($rows, fn ($row) => $row['status'] === 'ready'));

        return [
            'candidateCount' => count($rows),
            'readyCount' => count($ready),
            'skippedCount' => count($rows) - count($ready),
            'insertCount' => count(array_filter($ready, fn ($row) => $row['action'] === 'insert')),
            'replaceCount' => count(array_filter($ready, fn ($row) => $row['action'] === 'replace')),
            'updateCount' => count(array_filter($ready, fn ($row) => $row['action'] === 'update')),
            'currentRowsClosed' => 0,
            'insertedCount' => 0,
            'updatedPriceCount' => 0,
        ];
    }

    private function stockItems(string $categoryFrom, string $categoryTo)
    {
        return DB::table('stockmaster as sm')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->select(
                'sm.stockid',
                'sm.description',
                'sm.categoryid',
                'sm.units',
                'sm.decimalplaces',
                'sm.materialcost',
                'sm.labourcost',
                'sm.overheadcost',
                DB::raw('COALESCE(sc.categorydescription, sm.categoryid) as category_name')
            )
            ->where('sm.categoryid', '>=', $categoryFrom)
            ->where('sm.categoryid', '<=', $categoryTo)
            ->orderBy('sm.stockid')
            ->get();
    }

    private function activePriceMap(string $priceList, string $currency): array
    {
        if (!Schema::hasTable('prices')) {
            return [];
        }

        $today = Carbon::today()->toDateString();
        $rows = DB::table('prices')
            ->select('stockid', 'price', 'startdate', 'enddate')
            ->where('typeabbrev', $priceList)
            ->where('currabrev', $currency)
            ->where('debtorno', '')
            ->where('branchcode', '')
            ->where('startdate', '<=', $today)
            ->where(function ($query) use ($today) {
                $query
                    ->where('enddate', '>=', $today)
                    ->orWhere('enddate', '0000-00-00')
                    ->orWhere('enddate', self::OPEN_END_DATE);
            })
            ->orderBy('stockid')
            ->orderByDesc('startdate')
            ->get();

        $map = [];
        foreach ($rows as $row) {
            $stockId = (string) $row->stockid;
            if (isset($map[$stockId])) {
                continue;
            }
            $map[$stockId] = [
                'price' => (float) $row->price,
                'startDate' => (string) $row->startdate,
                'endDate' => (string) $row->enddate,
            ];
        }

        return $map;
    }

    private function preferredCostMap(): array
    {
        if (!Schema::hasTable('purchdata') || !Schema::hasTable('suppliers') || !Schema::hasTable('currencies')) {
            return [];
        }

        $rows = DB::table('purchdata as pd')
            ->join('suppliers as s', 'pd.supplierno', '=', 's.supplierid')
            ->join('currencies as c', 's.currcode', '=', 'c.currabrev')
            ->select(
                'pd.stockid',
                DB::raw('pd.price / NULLIF(pd.conversionfactor, 0) / NULLIF(c.rate, 0) as cost')
            )
            ->where('pd.preferred', 1)
            ->get();

        $map = [];
        foreach ($rows as $row) {
            $stockId = (string) $row->stockid;
            if (!isset($map[$stockId])) {
                $map[$stockId] = ['count' => 0, 'cost' => 0.0];
            }
            $map[$stockId]['count']++;
            $map[$stockId]['cost'] = (float) ($row->cost ?? 0);
        }

        return $map;
    }

    private function currencyRate(string $currency): float
    {
        $rate = Schema::hasTable('currencies')
            ? (float) DB::table('currencies')->where('currabrev', $currency)->value('rate')
            : 1.0;

        return $rate > 0 ? $rate : 1.0;
    }

    private function roundPrice(float $value, float $factor): float
    {
        $roundingFactor = max($factor, 0.0001);
        $price = round(($value + ($roundingFactor / 2)) / $roundingFactor) * $roundingFactor;
        if ($price <= 0) {
            $price = $roundingFactor;
        }

        return round($price, 4);
    }

    private function lookups(): array
    {
        return [
            'priceLists' => $this->lookupRows('salestypes', 'typeabbrev', 'sales_type', 'sales_type'),
            'currencies' => $this->lookupRows('currencies', 'currabrev', 'currency', 'currabrev', ['rate']),
            'categories' => $this->lookupRows('stockcategory', 'categoryid', 'categorydescription', 'categoryid'),
            'costBasisOptions' => [
                ['code' => 'standard-cost', 'name' => 'Standard cost'],
                ['code' => 'preferred-supplier', 'name' => 'Preferred supplier cost'],
                ['code' => 'other-price-list', 'name' => 'Another price list'],
            ],
        ];
    }

    private function defaults(): array
    {
        $priceLists = $this->lookupRows('salestypes', 'typeabbrev', 'sales_type', 'sales_type');
        $currencies = $this->lookupRows('currencies', 'currabrev', 'currency', 'currabrev');
        $categories = $this->lookupRows('stockcategory', 'categoryid', 'categorydescription', 'categoryid');
        $tzs = collect($currencies)->firstWhere('code', 'TZS');

        return [
            'priceList' => (string) ($priceLists[0]['code'] ?? ''),
            'currency' => (string) (($tzs['code'] ?? null) ?: ($currencies[0]['code'] ?? '')),
            'costBasis' => 'standard-cost',
            'basePriceList' => '',
            'categoryFrom' => (string) ($categories[0]['code'] ?? ''),
            'categoryTo' => (string) ($categories[0]['code'] ?? ''),
            'roundingFactor' => 0.01,
            'markupPercent' => 0,
            'startDate' => Carbon::today()->subMonthsNoOverflow(2)->startOfMonth()->toDateString(),
            'endDate' => Carbon::today()->toDateString(),
        ];
    }

    private function stats(): array
    {
        return [
            'totalItems' => Schema::hasTable('stockmaster') ? DB::table('stockmaster')->count() : 0,
            'priceRows' => Schema::hasTable('prices') ? DB::table('prices')->count() : 0,
            'pricedItems' => Schema::hasTable('prices') ? DB::table('prices')->distinct('stockid')->count('stockid') : 0,
            'priceLists' => Schema::hasTable('salestypes') ? DB::table('salestypes')->count() : 0,
            'currencies' => Schema::hasTable('currencies') ? DB::table('currencies')->count() : 0,
            'categories' => Schema::hasTable('stockcategory') ? DB::table('stockcategory')->count() : 0,
        ];
    }

    private function lookupRows(string $table, string $codeColumn, string $nameColumn, string $orderColumn, array $extraColumns = []): array
    {
        if (!Schema::hasTable($table)) {
            return [];
        }

        $columns = array_merge([$codeColumn, $nameColumn], $extraColumns);

        return DB::table($table)
            ->select($columns)
            ->orderBy($orderColumn)
            ->get()
            ->map(static function ($row) use ($codeColumn, $nameColumn, $extraColumns) {
                $payload = [
                    'code' => (string) $row->{$codeColumn},
                    'name' => html_entity_decode((string) $row->{$nameColumn}),
                ];

                foreach ($extraColumns as $column) {
                    $payload[$column] = is_numeric($row->{$column}) ? (float) $row->{$column} : (string) $row->{$column};
                }

                return $payload;
            })
            ->values()
            ->all();
    }

    private function prepareRequest(Request $request): void
    {
        $request->merge([
            'priceList' => strtoupper(trim((string) $request->input('priceList', ''))),
            'currency' => strtoupper(trim((string) $request->input('currency', ''))),
            'costBasis' => trim((string) $request->input('costBasis', 'standard-cost')),
            'basePriceList' => strtoupper(trim((string) $request->input('basePriceList', ''))),
            'categoryFrom' => strtoupper(trim((string) $request->input('categoryFrom', ''))),
            'categoryTo' => strtoupper(trim((string) $request->input('categoryTo', ''))),
            'roundingFactor' => $this->numberValue($request->input('roundingFactor', 0.01)),
            'markupPercent' => $this->numberValue($request->input('markupPercent', 0)),
            'startDate' => trim((string) $request->input('startDate', '')),
            'endDate' => trim((string) $request->input('endDate', '')) ?: null,
        ]);
    }

    private function validator(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'priceList' => ['required', 'string', Rule::exists('salestypes', 'typeabbrev')],
            'currency' => ['required', 'string', Rule::exists('currencies', 'currabrev')],
            'costBasis' => ['required', Rule::in(['standard-cost', 'preferred-supplier', 'other-price-list'])],
            'basePriceList' => ['nullable', 'string', Rule::exists('salestypes', 'typeabbrev')],
            'categoryFrom' => ['required', 'string', Rule::exists('stockcategory', 'categoryid')],
            'categoryTo' => ['required', 'string', Rule::exists('stockcategory', 'categoryid')],
            'roundingFactor' => ['required', 'numeric', 'gt:0'],
            'markupPercent' => ['required', 'numeric', 'min:-99.99', 'max:9999'],
            'startDate' => ['required', 'date'],
            'endDate' => ['nullable', 'date', 'after_or_equal:startDate'],
        ]);

        $validator->after(function ($validator) use ($request) {
            if ((string) $request->input('categoryFrom') > (string) $request->input('categoryTo')) {
                $validator->errors()->add('categoryFrom', 'The starting category must be before the ending category.');
            }

            if ($request->input('costBasis') === 'other-price-list') {
                if (!$request->input('basePriceList')) {
                    $validator->errors()->add('basePriceList', 'Select the base price list to use.');
                } elseif ($request->input('basePriceList') === $request->input('priceList')) {
                    $validator->errors()->add('basePriceList', 'The base price list must be different from the price list being updated.');
                }
            }
        });

        return $validator;
    }

    private function normalizeData(array $data): array
    {
        return [
            'priceList' => (string) $data['priceList'],
            'currency' => (string) $data['currency'],
            'costBasis' => (string) $data['costBasis'],
            'basePriceList' => (string) ($data['basePriceList'] ?? ''),
            'categoryFrom' => (string) $data['categoryFrom'],
            'categoryTo' => (string) $data['categoryTo'],
            'roundingFactor' => (float) $data['roundingFactor'],
            'markupPercent' => (float) $data['markupPercent'],
            'startDate' => Carbon::parse((string) $data['startDate'])->toDateString(),
            'endDate' => empty($data['endDate']) ? self::OPEN_END_DATE : Carbon::parse((string) $data['endDate'])->toDateString(),
        ];
    }

    private function numberValue($value): float
    {
        if (is_numeric($value)) {
            return (float) $value;
        }

        $numeric = str_replace([',', ' '], '', (string) $value);
        return is_numeric($numeric) ? (float) $numeric : 0.0;
    }

    private function hasRequiredTables(): bool
    {
        foreach (['stockmaster', 'prices', 'salestypes', 'currencies', 'stockcategory'] as $table) {
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
            'message' => 'Markup price maintenance is not available.',
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
}
