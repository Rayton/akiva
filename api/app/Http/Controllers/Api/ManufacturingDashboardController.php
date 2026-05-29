<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ManufacturingDashboardController extends Controller
{
    private array $filters = [];

    public function show(Request $request)
    {
        $this->filters = $this->readFilters($request);

        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => $this->emptyPayload(),
            ]);
        }

        try {
            return response()->json([
                'success' => true,
                'data' => [
                    'currency' => $this->currency(),
                    'asOf' => Carbon::now()->toIso8601String(),
                    'filters' => $this->filters,
                    'filterOptions' => $this->filterOptions(),
                    'summary' => $this->summary(),
                    'workOrderQueue' => $this->workOrderQueue(),
                    'componentShortages' => $this->componentShortages(),
                    'workCentreLoad' => $this->workCentreLoad(),
                    'productionTrend' => $this->productionTrend(),
                    'statusBreakdown' => $this->statusBreakdown(),
                    'mrpDemandTrend' => $this->mrpDemandTrend(),
                    'bomCostRollup' => $this->bomCostRollup(),
                    'calendarAvailability' => $this->calendarAvailability(),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Manufacturing dashboard could not be loaded.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('workorders')
            && Schema::hasTable('woitems')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locations');
    }

    private function emptyPayload(): array
    {
        return [
            'currency' => 'TZS',
            'asOf' => Carbon::now()->toIso8601String(),
            'filters' => $this->filters,
            'filterOptions' => [
                'locations' => [],
            ],
            'summary' => $this->emptySummary(),
            'workOrderQueue' => [],
            'componentShortages' => [],
            'workCentreLoad' => [],
            'productionTrend' => [],
            'statusBreakdown' => [],
            'mrpDemandTrend' => [],
            'bomCostRollup' => [],
            'calendarAvailability' => [],
        ];
    }

    private function emptySummary(): array
    {
        return [
            'scheduledWorkOrders' => 0,
            'openWorkOrders' => 0,
            'overdueWorkOrders' => 0,
            'dueThisWeek' => 0,
            'completedThisPeriod' => 0,
            'unitsRequired' => 0.0,
            'unitsReceived' => 0.0,
            'remainingUnits' => 0.0,
            'completionRate' => 0.0,
            'wipValue' => 0.0,
            'componentShortages' => 0,
            'activeBomParents' => 0,
            'activeWorkCentres' => 0,
            'mrpDemandQuantity' => 0.0,
            'manufacturingDays' => 0,
        ];
    }

    private function readFilters(Request $request): array
    {
        $from = $this->validDate((string) $request->query('dateFrom', ''), Carbon::today()->subMonths(2)->startOfMonth()->toDateString());
        $to = $this->validDate((string) $request->query('dateTo', ''), Carbon::today()->toDateString());

        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        return [
            'location' => trim((string) $request->query('location', '')),
            'dateFrom' => $from,
            'dateTo' => $to,
        ];
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

    private function filterOptions(): array
    {
        return [
            'locations' => DB::table('locations')
                ->select('loccode', 'locationname')
                ->orderBy('locationname')
                ->get()
                ->map(fn ($row) => [
                    'value' => (string) $row->loccode,
                    'label' => $this->text((string) ($row->locationname ?: $row->loccode)),
                ])
                ->values(),
        ];
    }

    private function summary(): array
    {
        $summary = $this->emptySummary();
        $scheduled = $this->workOrderHeaderQuery(false);
        $open = $this->workOrderHeaderQuery(false)->where('wo.closed', 0);
        $completed = $this->workOrderHeaderQuery(false)->where('wo.closed', 1);
        $today = Carbon::today()->toDateString();
        $weekEnd = Carbon::today()->addDays(7)->toDateString();
        $quantities = $this->quantitySummary();

        $summary['scheduledWorkOrders'] = (int) $scheduled->distinct('wo.wo')->count('wo.wo');
        $summary['openWorkOrders'] = (int) $open->distinct('wo.wo')->count('wo.wo');
        $summary['overdueWorkOrders'] = (int) $this->workOrderHeaderQuery(false)
            ->where('wo.closed', 0)
            ->whereDate('wo.requiredby', '<', $today)
            ->distinct('wo.wo')
            ->count('wo.wo');
        $summary['dueThisWeek'] = (int) $this->workOrderHeaderQuery(false)
            ->where('wo.closed', 0)
            ->whereDate('wo.requiredby', '>=', $today)
            ->whereDate('wo.requiredby', '<=', $weekEnd)
            ->distinct('wo.wo')
            ->count('wo.wo');
        $summary['completedThisPeriod'] = (int) $completed->distinct('wo.wo')->count('wo.wo');
        $summary['unitsRequired'] = $quantities['required'];
        $summary['unitsReceived'] = $quantities['received'];
        $summary['remainingUnits'] = $quantities['remaining'];
        $summary['completionRate'] = $quantities['required'] > 0 ? round(($quantities['received'] / $quantities['required']) * 100, 1) : 0.0;
        $summary['wipValue'] = $quantities['wipValue'];
        $summary['componentShortages'] = $this->componentShortageCount();
        $summary['activeBomParents'] = $this->activeBomParentCount();
        $summary['activeWorkCentres'] = $this->workCentreCount();
        $summary['mrpDemandQuantity'] = $this->mrpDemandQuantity();
        $summary['manufacturingDays'] = $this->manufacturingDays();

        return $summary;
    }

    private function workOrderHeaderQuery(bool $withDateFilter = true)
    {
        $query = DB::table('workorders as wo');
        $this->applyLocationFilter($query, 'wo');
        if ($withDateFilter) {
            $this->applyWorkOrderDates($query, 'wo');
        }

        return $query;
    }

    private function workOrderItemQuery(bool $withDateFilter = true)
    {
        $query = DB::table('workorders as wo')
            ->join('woitems as wi', 'wi.wo', '=', 'wo.wo')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'wi.stockid');
        $this->applyLocationFilter($query, 'wo');
        if ($withDateFilter) {
            $this->applyWorkOrderDates($query, 'wo');
        }

        return $query;
    }

    private function applyLocationFilter($query, string $alias)
    {
        if ($this->filters['location'] !== '') {
            $query->where("{$alias}.loccode", $this->filters['location']);
        }

        return $query;
    }

    private function applyWorkOrderDates($query, string $alias)
    {
        return $query
            ->whereDate("{$alias}.requiredby", '>=', $this->filters['dateFrom'])
            ->whereDate("{$alias}.requiredby", '<=', $this->filters['dateTo']);
    }

    private function quantitySummary(): array
    {
        $row = $this->workOrderItemQuery()
            ->selectRaw('COALESCE(SUM(wi.qtyreqd), 0) as required_qty')
            ->selectRaw('COALESCE(SUM(wi.qtyrecd), 0) as received_qty')
            ->selectRaw('COALESCE(SUM(GREATEST(wi.qtyreqd - wi.qtyrecd, 0)), 0) as remaining_qty')
            ->selectRaw('COALESCE(SUM(GREATEST(wi.qtyreqd - wi.qtyrecd, 0) * wi.stdcost), 0) as wip_value')
            ->first();

        return [
            'required' => (float) ($row->required_qty ?? 0),
            'received' => (float) ($row->received_qty ?? 0),
            'remaining' => (float) ($row->remaining_qty ?? 0),
            'wipValue' => (float) ($row->wip_value ?? 0),
        ];
    }

    private function workOrderQueue()
    {
        return $this->workOrderItemQuery()
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'wo.loccode')
            ->select(
                'wo.wo',
                'wo.loccode',
                'wo.requiredby',
                'wo.startdate',
                'wo.closed',
                'wo.costissued',
                'wi.stockid',
                'wi.qtyreqd',
                'wi.qtyrecd',
                'wi.stdcost',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.decimalplaces',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), wo.loccode) as location_name')
            )
            ->when(Schema::hasColumn('workorders', 'reference'), fn ($query) => $query->addSelect('wo.reference'))
            ->orderBy('wo.closed')
            ->orderBy('wo.requiredby')
            ->orderByDesc('wo.wo')
            ->limit(16)
            ->get()
            ->map(function ($row) {
                $required = (float) $row->qtyreqd;
                $received = (float) $row->qtyrecd;
                $remaining = max($required - $received, 0);

                return [
                    'workOrder' => (int) $row->wo,
                    'stockId' => (string) $row->stockid,
                    'description' => $this->stockDescription($row),
                    'location' => (string) $row->loccode,
                    'locationName' => $this->text((string) $row->location_name),
                    'startDate' => $this->dateOnly((string) $row->startdate),
                    'requiredBy' => $this->dateOnly((string) $row->requiredby),
                    'requiredQuantity' => $required,
                    'receivedQuantity' => $received,
                    'remainingQuantity' => $remaining,
                    'progressPercent' => $required > 0 ? round(min(100, ($received / $required) * 100), 1) : 0.0,
                    'standardCost' => (float) $row->stdcost,
                    'wipValue' => $remaining * (float) $row->stdcost,
                    'units' => (string) ($row->units ?: ''),
                    'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
                    'status' => $this->workOrderStatus((int) $row->closed, (string) $row->requiredby, $required, $received),
                    'reference' => $this->text((string) ($row->reference ?? '')),
                ];
            })
            ->values();
    }

    private function componentShortages()
    {
        if (!Schema::hasTable('worequirements') || !Schema::hasTable('locstock')) {
            return collect();
        }

        $query = DB::table('worequirements as wr')
            ->join('woitems as wi', function ($join) {
                $join->on('wi.wo', '=', 'wr.wo')
                    ->on('wi.stockid', '=', 'wr.parentstockid');
            })
            ->join('workorders as wo', 'wo.wo', '=', 'wi.wo')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'wr.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'wo.loccode')
            ->leftJoin('locstock as ls', function ($join) {
                $join->on('ls.stockid', '=', 'wr.stockid')
                    ->on('ls.loccode', '=', 'wo.loccode');
            })
            ->where('wo.closed', 0)
            ->whereRaw('(wi.qtyreqd - wi.qtyrecd) > 0');
        $this->applyLocationFilter($query, 'wo');
        $this->applyWorkOrderDates($query, 'wo');

        return $query
            ->select(
                'wr.stockid',
                'wo.loccode',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.decimalplaces',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), wo.loccode) as location_name')
            )
            ->selectRaw('COALESCE(SUM(wr.qtypu * GREATEST(wi.qtyreqd - wi.qtyrecd, 0)), 0) as required_quantity')
            ->selectRaw('COALESCE(MAX(ls.quantity), 0) as available_quantity')
            ->selectRaw('COUNT(DISTINCT wo.wo) as work_order_count')
            ->selectRaw('GROUP_CONCAT(DISTINCT wr.parentstockid ORDER BY wr.parentstockid SEPARATOR ", ") as parent_items')
            ->groupBy('wr.stockid', 'wo.loccode', 'sm.description', 'sm.longdescription', 'sm.units', 'sm.decimalplaces', 'loc.locationname')
            ->havingRaw('required_quantity > available_quantity')
            ->orderByRaw('(required_quantity - available_quantity) DESC')
            ->limit(12)
            ->get()
            ->map(fn ($row) => [
                'stockId' => (string) $row->stockid,
                'description' => $this->stockDescription($row),
                'location' => (string) $row->loccode,
                'locationName' => $this->text((string) $row->location_name),
                'requiredQuantity' => (float) $row->required_quantity,
                'availableQuantity' => (float) $row->available_quantity,
                'shortageQuantity' => (float) $row->required_quantity - (float) $row->available_quantity,
                'workOrderCount' => (int) $row->work_order_count,
                'parentItems' => $this->text((string) ($row->parent_items ?? '')),
                'units' => (string) ($row->units ?: ''),
                'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
            ])
            ->values();
    }

    private function componentShortageCount(): int
    {
        return $this->componentShortages()->count();
    }

    private function workCentreLoad()
    {
        if (!Schema::hasTable('workcentres')) {
            return collect();
        }

        $query = DB::table('workcentres as wc')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'wc.location');

        if ($this->filters['location'] !== '') {
            $query->where('wc.location', $this->filters['location']);
        }

        $openByCentre = $this->openWorkOrdersByWorkCentre();

        return $query
            ->select(
                'wc.code',
                'wc.location',
                'wc.description',
                'wc.capacity',
                'wc.overheadperhour',
                'wc.setuphrs',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), wc.location) as location_name')
            )
            ->orderBy('wc.location')
            ->orderBy('wc.code')
            ->get()
            ->map(function ($row) use ($openByCentre) {
                $load = $openByCentre[(string) $row->code] ?? [
                    'openOrders' => 0,
                    'remainingQuantity' => 0.0,
                    'parentItems' => 0,
                    'componentLines' => 0,
                ];

                return [
                    'code' => (string) $row->code,
                    'description' => $this->text((string) ($row->description ?: $row->code)),
                    'location' => (string) $row->location,
                    'locationName' => $this->text((string) $row->location_name),
                    'capacity' => (float) $row->capacity,
                    'overheadPerHour' => (float) $row->overheadperhour,
                    'setupHours' => (float) $row->setuphrs,
                    'openOrders' => (int) $load['openOrders'],
                    'remainingQuantity' => (float) $load['remainingQuantity'],
                    'parentItems' => (int) $load['parentItems'],
                    'componentLines' => (int) $load['componentLines'],
                ];
            })
            ->sortByDesc('openOrders')
            ->values()
            ->take(10);
    }

    private function openWorkOrdersByWorkCentre(): array
    {
        if (!Schema::hasTable('bom')) {
            return [];
        }

        $query = DB::table('bom as b')
            ->join('woitems as wi', 'wi.stockid', '=', 'b.parent')
            ->join('workorders as wo', 'wo.wo', '=', 'wi.wo')
            ->where('wo.closed', 0)
            ->whereRaw('(wi.qtyreqd - wi.qtyrecd) > 0')
            ->whereDate('b.effectiveafter', '<=', Carbon::today()->toDateString())
            ->whereDate('b.effectiveto', '>=', Carbon::today()->toDateString());
        $this->applyLocationFilter($query, 'wo');
        $this->applyWorkOrderDates($query, 'wo');

        return $query
            ->select('b.workcentreadded')
            ->selectRaw('COUNT(DISTINCT wo.wo) as open_orders')
            ->selectRaw('COALESCE(SUM(GREATEST(wi.qtyreqd - wi.qtyrecd, 0)), 0) as remaining_quantity')
            ->selectRaw('COUNT(DISTINCT b.parent) as parent_items')
            ->selectRaw('COUNT(*) as component_lines')
            ->groupBy('b.workcentreadded')
            ->get()
            ->mapWithKeys(fn ($row) => [
                (string) $row->workcentreadded => [
                    'openOrders' => (int) $row->open_orders,
                    'remainingQuantity' => (float) $row->remaining_quantity,
                    'parentItems' => (int) $row->parent_items,
                    'componentLines' => (int) $row->component_lines,
                ],
            ])
            ->all();
    }

    private function productionTrend()
    {
        return $this->workOrderItemQuery(false)
            ->whereDate('wo.startdate', '>=', $this->filters['dateFrom'])
            ->whereDate('wo.startdate', '<=', $this->filters['dateTo'])
            ->selectRaw('DATE(wo.startdate) as production_date')
            ->selectRaw('COUNT(DISTINCT wo.wo) as work_orders')
            ->selectRaw('COALESCE(SUM(wi.qtyreqd), 0) as required_quantity')
            ->selectRaw('COALESCE(SUM(wi.qtyrecd), 0) as received_quantity')
            ->groupBy(DB::raw('DATE(wo.startdate)'))
            ->orderBy('production_date')
            ->get()
            ->map(fn ($row) => [
                'date' => $this->dateOnly((string) $row->production_date),
                'workOrders' => (int) $row->work_orders,
                'requiredQuantity' => (float) $row->required_quantity,
                'receivedQuantity' => (float) $row->received_quantity,
            ])
            ->values();
    }

    private function statusBreakdown()
    {
        $rows = $this->workOrderItemQuery()
            ->select('wo.wo', 'wo.closed', 'wo.requiredby')
            ->selectRaw('COALESCE(SUM(wi.qtyreqd), 0) as required_quantity')
            ->selectRaw('COALESCE(SUM(wi.qtyrecd), 0) as received_quantity')
            ->groupBy('wo.wo', 'wo.closed', 'wo.requiredby')
            ->get();

        $counts = [
            'Overdue' => 0,
            'Due this week' => 0,
            'In progress' => 0,
            'Waiting release' => 0,
            'Completed' => 0,
        ];

        foreach ($rows as $row) {
            $counts[$this->workOrderStatus((int) $row->closed, (string) $row->requiredby, (float) $row->required_quantity, (float) $row->received_quantity)]++;
        }

        return collect($counts)
            ->map(fn ($value, $name) => ['name' => $name, 'value' => $value])
            ->filter(fn ($row) => $row['value'] > 0)
            ->values();
    }

    private function mrpDemandTrend()
    {
        $rows = [];

        if (Schema::hasTable('mrpdemands')) {
            $demands = DB::table('mrpdemands')
                ->selectRaw('DATE(duedate) as due_date')
                ->selectRaw('COALESCE(SUM(quantity), 0) as quantity')
                ->whereDate('duedate', '>=', $this->filters['dateFrom'])
                ->whereDate('duedate', '<=', $this->filters['dateTo'])
                ->groupBy(DB::raw('DATE(duedate)'))
                ->get();

            foreach ($demands as $row) {
                $date = $this->dateOnly((string) $row->due_date);
                $rows[$date] ??= ['date' => $date, 'demandQuantity' => 0.0, 'requirementQuantity' => 0.0];
                $rows[$date]['demandQuantity'] += (float) $row->quantity;
            }
        }

        if (Schema::hasTable('mrprequirements')) {
            $requirements = DB::table('mrprequirements')
                ->selectRaw('DATE(daterequired) as required_date')
                ->selectRaw('COALESCE(SUM(quantity), 0) as quantity')
                ->whereDate('daterequired', '>=', $this->filters['dateFrom'])
                ->whereDate('daterequired', '<=', $this->filters['dateTo'])
                ->groupBy(DB::raw('DATE(daterequired)'))
                ->get();

            foreach ($requirements as $row) {
                $date = $this->dateOnly((string) $row->required_date);
                $rows[$date] ??= ['date' => $date, 'demandQuantity' => 0.0, 'requirementQuantity' => 0.0];
                $rows[$date]['requirementQuantity'] += (float) $row->quantity;
            }
        }

        ksort($rows);

        return array_values($rows);
    }

    private function bomCostRollup()
    {
        if (!Schema::hasTable('bom')) {
            return collect();
        }

        $query = DB::table('bom as b')
            ->join('stockmaster as parent', 'parent.stockid', '=', 'b.parent')
            ->join('stockmaster as component', 'component.stockid', '=', 'b.component')
            ->whereDate('b.effectiveafter', '<=', Carbon::today()->toDateString())
            ->whereDate('b.effectiveto', '>=', Carbon::today()->toDateString());

        if ($this->filters['location'] !== '') {
            $query->where('b.loccode', $this->filters['location']);
        }

        return $query
            ->select('b.parent', 'parent.description', 'parent.longdescription')
            ->selectRaw('COUNT(DISTINCT b.component) as component_count')
            ->selectRaw('COALESCE(SUM(b.quantity), 0) as component_quantity')
            ->selectRaw('COALESCE(SUM(b.quantity * ' . $this->costExpression('component') . '), 0) as estimated_cost')
            ->selectRaw('GROUP_CONCAT(DISTINCT b.loccode ORDER BY b.loccode SEPARATOR ", ") as locations')
            ->groupBy('b.parent', 'parent.description', 'parent.longdescription')
            ->orderByDesc('estimated_cost')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'parent' => (string) $row->parent,
                'description' => $this->stockDescription($row),
                'componentCount' => (int) $row->component_count,
                'componentQuantity' => (float) $row->component_quantity,
                'estimatedCost' => (float) $row->estimated_cost,
                'locations' => $this->text((string) ($row->locations ?? '')),
            ])
            ->values();
    }

    private function calendarAvailability()
    {
        if (!Schema::hasTable('mrpcalendar')) {
            return collect();
        }

        $available = (int) DB::table('mrpcalendar')
            ->whereDate('calendardate', '>=', $this->filters['dateFrom'])
            ->whereDate('calendardate', '<=', $this->filters['dateTo'])
            ->where('manufacturingflag', 1)
            ->count();

        $unavailable = (int) DB::table('mrpcalendar')
            ->whereDate('calendardate', '>=', $this->filters['dateFrom'])
            ->whereDate('calendardate', '<=', $this->filters['dateTo'])
            ->where('manufacturingflag', '<>', 1)
            ->count();

        return collect([
            ['name' => 'Available', 'value' => $available],
            ['name' => 'Unavailable', 'value' => $unavailable],
        ])->filter(fn ($row) => $row['value'] > 0)->values();
    }

    private function activeBomParentCount(): int
    {
        if (!Schema::hasTable('bom')) {
            return 0;
        }

        $query = DB::table('bom')
            ->whereDate('effectiveafter', '<=', Carbon::today()->toDateString())
            ->whereDate('effectiveto', '>=', Carbon::today()->toDateString());

        if ($this->filters['location'] !== '') {
            $query->where('loccode', $this->filters['location']);
        }

        return (int) $query->distinct('parent')->count('parent');
    }

    private function workCentreCount(): int
    {
        if (!Schema::hasTable('workcentres')) {
            return 0;
        }

        $query = DB::table('workcentres');
        if ($this->filters['location'] !== '') {
            $query->where('location', $this->filters['location']);
        }

        return (int) $query->count();
    }

    private function mrpDemandQuantity(): float
    {
        if (!Schema::hasTable('mrpdemands')) {
            return 0.0;
        }

        return (float) (DB::table('mrpdemands')
            ->whereDate('duedate', '>=', $this->filters['dateFrom'])
            ->whereDate('duedate', '<=', $this->filters['dateTo'])
            ->selectRaw('COALESCE(SUM(quantity), 0) as quantity')
            ->value('quantity') ?? 0);
    }

    private function manufacturingDays(): int
    {
        if (!Schema::hasTable('mrpcalendar')) {
            return 0;
        }

        return (int) DB::table('mrpcalendar')
            ->whereDate('calendardate', '>=', $this->filters['dateFrom'])
            ->whereDate('calendardate', '<=', $this->filters['dateTo'])
            ->where('manufacturingflag', 1)
            ->count();
    }

    private function workOrderStatus(int $closed, string $requiredBy, float $required, float $received): string
    {
        if ($closed === 1 || ($required > 0 && $received >= $required)) {
            return 'Completed';
        }

        $requiredDate = $this->dateOnly($requiredBy);
        $today = Carbon::today()->toDateString();
        $weekEnd = Carbon::today()->addDays(7)->toDateString();

        if ($requiredDate !== '' && $requiredDate < $today) {
            return 'Overdue';
        }

        if ($requiredDate !== '' && $requiredDate <= $weekEnd) {
            return 'Due this week';
        }

        if ($received > 0) {
            return 'In progress';
        }

        return 'Waiting release';
    }

    private function costExpression(string $alias): string
    {
        $material = Schema::hasColumn('stockmaster', 'materialcost') ? "{$alias}.materialcost" : '0';
        $labour = Schema::hasColumn('stockmaster', 'labourcost') ? "{$alias}.labourcost" : '0';
        $overhead = Schema::hasColumn('stockmaster', 'overheadcost') ? "{$alias}.overheadcost" : '0';
        $actual = Schema::hasColumn('stockmaster', 'actualcost') ? "{$alias}.actualcost" : '0';
        $standard = "({$material} + {$labour} + {$overhead})";

        return "(CASE WHEN {$actual} > 0 THEN {$actual} ELSE {$standard} END)";
    }

    private function currency(): string
    {
        return Schema::hasTable('companies')
            ? (string) (DB::table('companies')->where('coycode', 1)->value('currencydefault') ?: 'TZS')
            : 'TZS';
    }

    private function dateOnly(string $value): string
    {
        if ($value === '') {
            return '';
        }

        try {
            return Carbon::parse($value)->toDateString();
        } catch (\Throwable) {
            return $value;
        }
    }

    private function stockDescription($row): string
    {
        return $this->text((string) ($row->description ?: $row->longdescription ?: ($row->stockid ?? $row->parent ?? '')));
    }

    private function text(string $value): string
    {
        return html_entity_decode($value, ENT_QUOTES | ENT_HTML5);
    }
}
