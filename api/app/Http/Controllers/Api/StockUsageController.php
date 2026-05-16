<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockUsageController extends Controller
{
    private const USAGE_TYPES = [10, 11, 17, 28, 38];

    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'items' => [],
                    'locations' => [],
                    'selectedItem' => null,
                    'usageRows' => [],
                    'summary' => $this->emptySummary(),
                    'currency' => 'TZS',
                    'usageTypes' => [],
                ],
            ]);
        }

        try {
            $stockId = strtoupper(trim((string) $request->query('item', $request->query('StockID', ''))));
            $location = strtoupper(trim((string) $request->query('location', $request->query('StockLocation', ''))));
            $dateRange = $this->dateRange($request);

            if ($stockId === '' || strtolower($stockId) === 'all') {
                $stockId = $this->defaultStockId($location, $dateRange);
            }

            $item = $stockId !== '' ? $this->item($stockId) : null;
            $usageRows = $item ? $this->usageRows($stockId, $location, $dateRange, (int) $item['decimalPlaces']) : collect();

            return response()->json([
                'success' => true,
                'data' => [
                    'items' => $this->itemOptions('', 50),
                    'locations' => $this->locations(),
                    'selectedItem' => $item,
                    'usageRows' => $usageRows->values(),
                    'summary' => $this->summary($usageRows),
                    'currency' => $this->currency(),
                    'usageTypes' => $this->usageTypes(),
                    'filters' => [
                        'dateFrom' => $dateRange['from'],
                        'dateTo' => $dateRange['to'],
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock usage could not be loaded.',
            ], 500);
        }
    }

    public function items(Request $request)
    {
        if (!Schema::hasTable('stockmaster')) {
            return response()->json(['success' => true, 'data' => []]);
        }

        try {
            $search = trim((string) $request->query('q', ''));
            $limit = $this->safeLimit($request->query('limit', 50), 20, 100);

            return response()->json([
                'success' => true,
                'data' => $this->itemOptions($search, $limit),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Items could not be loaded.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('stockmoves')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('periods')
            && Schema::hasTable('locations');
    }

    private function defaultStockId(string $location, array $dateRange): string
    {
        $query = DB::table('locstock')
            ->select('stockid')
            ->selectRaw('SUM(quantity) as quantity_on_hand');

        if ($location !== '' && strtolower($location) !== 'all') {
            $query->where('loccode', $location);
        }

        $row = $query
            ->groupBy('stockid')
            ->havingRaw('SUM(quantity) > 0')
            ->orderByDesc('quantity_on_hand')
            ->first();

        if ($row) {
            return (string) $row->stockid;
        }

        return (string) (DB::table('stockmaster')->orderBy('stockid')->value('stockid') ?: '');
    }

    private function item(string $stockId): ?array
    {
        $row = DB::table('stockmaster as sm')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->select(
                'sm.stockid',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.mbflag',
                'sm.decimalplaces',
                'sm.serialised',
                'sm.controlled',
                'sm.categoryid',
                'sc.categorydescription'
            )
            ->where('sm.stockid', $stockId)
            ->first();

        if (!$row) {
            return null;
        }

        return [
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
            'units' => (string) ($row->units ?: ''),
            'mbFlag' => (string) ($row->mbflag ?: ''),
            'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
            'serialised' => (bool) $row->serialised,
            'controlled' => (bool) $row->controlled,
            'category' => (string) ($row->categoryid ?? ''),
            'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid ?: '')),
            'stockHeld' => !in_array(strtoupper((string) $row->mbflag), ['A', 'D', 'K'], true),
        ];
    }

    private function dateRange(Request $request): array
    {
        $periods = $this->stockUsagePeriods();
        $fallbackFrom = Carbon::today()->subMonths($periods - 1)->startOfMonth()->toDateString();
        $fallbackTo = Carbon::today()->toDateString();

        $from = $this->validDate((string) $request->query('from', $request->query('dateFrom', '')), $fallbackFrom);
        $to = $this->validDate((string) $request->query('to', $request->query('dateTo', '')), $fallbackTo);

        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        return ['from' => $from, 'to' => $to];
    }

    private function usageRows(string $stockId, string $location, array $dateRange, int $decimalPlaces)
    {
        $periods = DB::table('periods as p')
            ->select(
                'p.periodno',
                'p.lastdate_in_period'
            )
            ->where('p.lastdate_in_period', '>=', $dateRange['from'])
            ->where('p.lastdate_in_period', '<=', $dateRange['to'])
            ->orderByDesc('p.periodno')
            ->get();

        if ($periods->isEmpty()) {
            return collect();
        }

        $usageByPeriod = $this->usageByPeriod($stockId, $location, $dateRange, $periods->pluck('periodno')->all());

        return $periods
            ->map(function ($period) use ($decimalPlaces, $usageByPeriod) {
                $usage = $usageByPeriod[(int) $period->periodno] ?? [
                    'quantity_used' => 0,
                    'usage_value' => 0,
                    'movement_lines' => 0,
                    'last_movement_date' => '',
                ];
                $periodEnd = $this->dateOnly((string) $period->lastdate_in_period);
                $quantityUsed = round((float) $usage['quantity_used'], $decimalPlaces);
                $usageValue = round((float) $usage['usage_value'], 2);

                return [
                    'period' => (int) $period->periodno,
                    'periodLabel' => $this->periodLabel($periodEnd),
                    'periodEnd' => $periodEnd,
                    'quantityUsed' => $quantityUsed,
                    'usageValue' => $usageValue,
                    'movementLines' => (int) $usage['movement_lines'],
                    'lastMovementDate' => $usage['last_movement_date'] ? $this->dateOnly((string) $usage['last_movement_date']) : '',
                ];
            })
            ->values();
    }

    private function usageByPeriod(string $stockId, string $location, array $dateRange, array $periods): array
    {
        $query = DB::table('stockmoves as smv')
            ->select('smv.prd')
            ->selectRaw('COALESCE(SUM(-smv.qty), 0) as quantity_used')
            ->selectRaw('COALESCE(SUM(CASE WHEN smv.qty >= 0 THEN 0 ELSE -smv.qty * smv.standardcost END), 0) as usage_value')
            ->selectRaw('COUNT(smv.stkmoveno) as movement_lines')
            ->selectRaw('MAX(smv.trandate) as last_movement_date')
            ->where('smv.stockid', $stockId)
            ->where('smv.hidemovt', 0)
            ->whereIn('smv.type', self::USAGE_TYPES)
            ->whereIn('smv.prd', $periods)
            ->where('smv.trandate', '>=', $dateRange['from'])
            ->where('smv.trandate', '<=', $dateRange['to']);

        if ($location !== '' && strtolower($location) !== 'all') {
            $query->where('smv.loccode', $location);
        }

        return $query
            ->groupBy('smv.prd')
            ->get()
            ->mapWithKeys(function ($row) {
                return [
                    (int) $row->prd => [
                        'quantity_used' => (float) $row->quantity_used,
                        'usage_value' => (float) $row->usage_value,
                        'movement_lines' => (int) $row->movement_lines,
                        'last_movement_date' => (string) ($row->last_movement_date ?? ''),
                    ],
                ];
            })
            ->all();
    }

    private function summary($usageRows): array
    {
        $totalUsage = 0.0;
        $totalValue = 0.0;
        $activePeriods = 0;
        $movementLines = 0;
        $highestPeriod = null;
        $lastUsagePeriod = null;

        foreach ($usageRows as $row) {
            $quantity = (float) $row['quantityUsed'];
            $value = (float) $row['usageValue'];
            $totalUsage += $quantity;
            $totalValue += $value;
            $movementLines += (int) $row['movementLines'];

            if ($quantity !== 0.0) {
                $activePeriods++;
                if ($lastUsagePeriod === null) {
                    $lastUsagePeriod = $row;
                }
            }

            if ($highestPeriod === null || $quantity > (float) $highestPeriod['quantityUsed']) {
                $highestPeriod = $row;
            }
        }

        $periodCount = max(1, count($usageRows));

        return [
            'periods' => count($usageRows),
            'activePeriods' => $activePeriods,
            'movementLines' => $movementLines,
            'totalUsage' => round($totalUsage, 4),
            'averageUsage' => round($totalUsage / $periodCount, 4),
            'usageValue' => round($totalValue, 2),
            'averageValue' => round($totalValue / $periodCount, 2),
            'highestPeriod' => $highestPeriod,
            'lastUsagePeriod' => $lastUsagePeriod,
        ];
    }

    private function emptySummary(): array
    {
        return [
            'periods' => 0,
            'activePeriods' => 0,
            'movementLines' => 0,
            'totalUsage' => 0,
            'averageUsage' => 0,
            'usageValue' => 0,
            'averageValue' => 0,
            'highestPeriod' => null,
            'lastUsagePeriod' => null,
        ];
    }

    private function locations()
    {
        return DB::table('locations')
            ->select('loccode', 'locationname')
            ->orderBy('locationname')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->loccode,
                'label' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
                'code' => (string) $row->loccode,
                'searchText' => trim((string) $row->loccode . ' ' . html_entity_decode((string) ($row->locationname ?? ''))),
            ])
            ->values();
    }

    private function itemOptions(string $search, int $limit)
    {
        $query = DB::table('stockmaster as sm')
            ->select('sm.stockid', 'sm.description', 'sm.longdescription');

        if ($search !== '') {
            $query->where(function ($query) use ($search) {
                $query->where('sm.stockid', 'like', '%' . $search . '%')
                    ->orWhere('sm.description', 'like', '%' . $search . '%')
                    ->orWhere('sm.longdescription', 'like', '%' . $search . '%');
            });
        }

        return $query
            ->orderBy('sm.stockid')
            ->limit($limit)
            ->get()
            ->map(function ($row) {
                $description = html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid));

                return [
                    'value' => (string) $row->stockid,
                    'label' => (string) $row->stockid . ' - ' . $description,
                    'code' => (string) $row->stockid,
                    'searchText' => trim((string) $row->stockid . ' ' . $description . ' ' . html_entity_decode((string) ($row->longdescription ?? ''))),
                ];
            })
            ->values();
    }

    private function usageTypes()
    {
        if (!Schema::hasTable('systypes')) {
            return collect(self::USAGE_TYPES)
                ->map(fn ($type) => ['value' => (string) $type, 'label' => (string) $type])
                ->values();
        }

        return DB::table('systypes')
            ->select('typeid', 'typename')
            ->whereIn('typeid', self::USAGE_TYPES)
            ->orderBy('typename')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->typeid,
                'label' => html_entity_decode((string) ($row->typename ?: $row->typeid)),
            ])
            ->values();
    }

    private function stockUsagePeriods(): int
    {
        if (!Schema::hasTable('config')) {
            return 12;
        }

        $value = (int) (DB::table('config')->where('confname', 'NumberOfPeriodsOfStockUsage')->value('confvalue') ?: 12);
        return min(12, max(1, $value));
    }

    private function currency(): string
    {
        if (!Schema::hasTable('companies')) {
            return 'TZS';
        }

        return (string) (DB::table('companies')->where('coycode', 1)->value('currencydefault') ?: 'TZS');
    }

    private function periodLabel(string $value): string
    {
        try {
            return Carbon::parse($value)->format('M Y');
        } catch (\Throwable) {
            return $value;
        }
    }

    private function dateOnly(string $value): string
    {
        try {
            return Carbon::parse($value)->toDateString();
        } catch (\Throwable) {
            return $value;
        }
    }

    private function validDate(string $value, string $fallback): string
    {
        if ($value === '') {
            return $fallback;
        }

        try {
            return Carbon::parse($value)->toDateString();
        } catch (\Throwable) {
            return $fallback;
        }
    }

    private function safeLimit($value, int $min, int $max): int
    {
        $limit = (int) $value;
        if ($limit < $min) return $min;
        if ($limit > $max) return $max;
        return $limit;
    }
}
