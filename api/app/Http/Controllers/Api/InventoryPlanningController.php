<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class InventoryPlanningController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json(['success' => true, 'data' => $this->emptyPayload()]);
        }

        try {
            @ini_set('memory_limit', '512M');
            @set_time_limit(60);

            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => $this->locationOptions(),
                    'categories' => $this->categoryOptions(),
                    'rows' => $rows->values(),
                    'summary' => $this->summary($rows),
                    'currency' => $this->currency(),
                    'periods' => $this->periods($filters),
                    'filters' => $filters,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Inventory planning could not be loaded.',
            ], 500);
        }
    }

    public function exportPdf(Request $request)
    {
        return $this->export($request, 'pdf');
    }

    public function exportExcel(Request $request)
    {
        return $this->export($request, 'excel');
    }

    private function export(Request $request, string $format)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory planning is not available.',
            ], 503);
        }

        try {
            @ini_set('memory_limit', '512M');
            @set_time_limit(120);

            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            if ($rows->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no inventory planning rows to export for the selected filters.',
                ], 422);
            }

            $context = $this->context($filters, $rows);

            if ($format === 'pdf') {
                return response($this->pdf($rows, $context), 200, [
                    'Content-Type' => 'application/pdf',
                    'Content-Disposition' => 'inline; filename="' . $this->filename('pdf') . '"',
                    'Cache-Control' => 'private, max-age=0, must-revalidate',
                    'Pragma' => 'public',
                ]);
            }

            return response($this->xlsx($rows, $context), 200, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition' => 'attachment; filename="' . $this->filename('xlsx') . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $format === 'pdf' ? 'Inventory planning PDF could not be created.' : 'Inventory planning Excel file could not be created.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('locstock')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('stockcategory')
            && Schema::hasTable('locations')
            && Schema::hasTable('stockmoves');
    }

    private function emptyPayload(): array
    {
        return [
            'locations' => [],
            'categories' => [],
            'rows' => [],
            'summary' => $this->summary(collect()),
            'currency' => $this->currency(),
            'periods' => [],
            'filters' => [],
        ];
    }

    private function filters(Request $request): array
    {
        $dateFrom = $this->validDate((string) $request->query('dateFrom', ''), Carbon::today()->subMonths(5)->startOfMonth()->toDateString());
        $dateTo = $this->validDate((string) $request->query('dateTo', ''), Carbon::today()->toDateString());
        if ($dateFrom > $dateTo) {
            [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
        }

        $location = strtoupper(trim((string) $request->query('location', 'All')));
        $category = trim((string) $request->query('category', 'All'));
        $policy = trim((string) $request->query('policy', 'max'));
        $status = trim((string) $request->query('status', 'needs-order'));
        $monthsCover = (float) $request->query('monthsCover', 1);
        $monthsCover = max(0.5, min(12, $monthsCover));

        return [
            'location' => $location === '' || $location === 'ALL' ? 'All' : $location,
            'category' => $category === '' ? 'All' : $category,
            'policy' => in_array($policy, ['max', 'average'], true) ? $policy : 'max',
            'status' => in_array($status, ['all', 'needs-order', 'covered', 'no-usage'], true) ? $status : 'needs-order',
            'monthsCover' => $monthsCover,
            'dateFrom' => $dateFrom,
            'dateTo' => $dateTo,
            'search' => trim((string) $request->query('q', '')),
        ];
    }

    private function rows(array $filters)
    {
        $periods = $this->periods($filters);
        $usage = $this->usageSubquery($filters, $periods);
        $demand = $this->demandSubquery($filters);
        $bomDemand = $this->bomDemandSubquery($filters);
        $po = $this->purchaseOrderSubquery($filters);
        $wo = $this->workOrderSubquery($filters);

        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->join('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->leftJoinSub($usage, 'usage_rows', 'usage_rows.stockid', '=', 'ls.stockid')
            ->leftJoinSub($demand, 'demand_rows', 'demand_rows.stockid', '=', 'ls.stockid')
            ->leftJoinSub($bomDemand, 'bom_demand_rows', 'bom_demand_rows.stockid', '=', 'ls.stockid')
            ->leftJoinSub($po, 'po_rows', 'po_rows.stockid', '=', 'ls.stockid')
            ->leftJoinSub($wo, 'wo_rows', 'wo_rows.stockid', '=', 'ls.stockid')
            ->whereIn('sm.mbflag', ['B', 'M'])
            ->where(function ($inner) {
                $inner->whereNull('sm.discontinued')->orWhere('sm.discontinued', 0);
            });

        if ($filters['location'] !== 'All') {
            $query->where('ls.loccode', $filters['location']);
        }

        if ($filters['category'] !== 'All') {
            $query->where('sm.categoryid', $filters['category']);
        }

        if ($filters['search'] !== '') {
            $search = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $filters['search']) . '%';
            $query->where(function ($inner) use ($search) {
                $inner->where('sm.stockid', 'like', $search)
                    ->orWhere('sm.description', 'like', $search)
                    ->orWhere('sm.longdescription', 'like', $search)
                    ->orWhere('sc.categorydescription', 'like', $search);
            });
        }

        if ($filters['location'] === 'All') {
            $query->select(
                'sm.stockid',
                'sm.description',
                'sm.longdescription',
                'sm.categoryid',
                'sm.decimalplaces',
                'sm.units',
                'sm.materialcost',
                'sm.labourcost',
                'sm.overheadcost',
                'sc.categorydescription',
                DB::raw('SUM(ls.quantity) as qoh'),
                DB::raw('COALESCE(MAX(usage_rows.prd0), 0) as prd0'),
                DB::raw('COALESCE(MAX(usage_rows.prd1), 0) as prd1'),
                DB::raw('COALESCE(MAX(usage_rows.prd2), 0) as prd2'),
                DB::raw('COALESCE(MAX(usage_rows.prd3), 0) as prd3'),
                DB::raw('COALESCE(MAX(usage_rows.prd4), 0) as prd4'),
                DB::raw('COALESCE(MAX(usage_rows.prd5), 0) as prd5'),
                DB::raw('COALESCE(MAX(usage_rows.usage_total), 0) as usage_total'),
                DB::raw('COALESCE(MAX(demand_rows.demand), 0) as demand'),
                DB::raw('COALESCE(MAX(bom_demand_rows.demand), 0) as bom_demand'),
                DB::raw('COALESCE(MAX(po_rows.on_order), 0) as on_order'),
                DB::raw('COALESCE(MAX(wo_rows.on_order), 0) as work_order')
            )->groupBy(
                'sm.stockid',
                'sm.description',
                'sm.longdescription',
                'sm.categoryid',
                'sm.decimalplaces',
                'sm.units',
                'sm.materialcost',
                'sm.labourcost',
                'sm.overheadcost',
                'sc.categorydescription'
            );
        } else {
            $query->select(
                'sm.stockid',
                'sm.description',
                'sm.longdescription',
                'sm.categoryid',
                'sm.decimalplaces',
                'sm.units',
                'sm.materialcost',
                'sm.labourcost',
                'sm.overheadcost',
                'sc.categorydescription',
                DB::raw('ls.quantity as qoh'),
                DB::raw('COALESCE(usage_rows.prd0, 0) as prd0'),
                DB::raw('COALESCE(usage_rows.prd1, 0) as prd1'),
                DB::raw('COALESCE(usage_rows.prd2, 0) as prd2'),
                DB::raw('COALESCE(usage_rows.prd3, 0) as prd3'),
                DB::raw('COALESCE(usage_rows.prd4, 0) as prd4'),
                DB::raw('COALESCE(usage_rows.prd5, 0) as prd5'),
                DB::raw('COALESCE(usage_rows.usage_total, 0) as usage_total'),
                DB::raw('COALESCE(demand_rows.demand, 0) as demand'),
                DB::raw('COALESCE(bom_demand_rows.demand, 0) as bom_demand'),
                DB::raw('COALESCE(po_rows.on_order, 0) as on_order'),
                DB::raw('COALESCE(wo_rows.on_order, 0) as work_order')
            );
        }

        $rows = $query
            ->orderBy('sc.categorydescription')
            ->orderBy('sm.stockid')
            ->get()
            ->map(fn ($row) => $this->mapRow($row, $filters, $periods));

        return $rows
            ->filter(function ($row) use ($filters) {
                if ($filters['status'] === 'all') return true;
                if ($filters['status'] === 'covered') return (float) $row['suggestedOrder'] <= 0.0 && (float) $row['openSupply'] > 0.0;
                if ($filters['status'] === 'no-usage') return (float) $row['usageTotal'] <= 0.0;
                return (float) $row['suggestedOrder'] > 0.0;
            })
            ->sortBy([
                ['priority', 'asc'],
                ['suggestedValue', 'desc'],
                ['stockId', 'asc'],
            ])
            ->values();
    }

    private function mapRow($row, array $filters, array $periodDefs): array
    {
        $periods = [
            (float) $row->prd0,
            (float) $row->prd1,
            (float) $row->prd2,
            (float) $row->prd3,
            (float) $row->prd4,
            (float) $row->prd5,
        ];
        $activePeriods = [];
        foreach ($periodDefs as $index => $period) {
            if (($period['active'] ?? false) === true) {
                $activePeriods[] = $periods[$index] ?? 0.0;
            }
        }
        if ($activePeriods === []) {
            $activePeriods = [0.0];
        }
        $basis = $filters['policy'] === 'average'
            ? array_sum($activePeriods) / max(1, count($activePeriods))
            : max($activePeriods);
        $ideal = ceil($basis * (float) $filters['monthsCover']);
        $qoh = (float) $row->qoh;
        $demand = (float) $row->demand + (float) $row->bom_demand;
        $openSupply = (float) $row->on_order + (float) $row->work_order;
        $suggested = max(0.0, $ideal - $qoh + $demand - $openSupply);
        $unitCost = (float) $row->materialcost + (float) $row->labourcost + (float) $row->overheadcost;
        $priority = $suggested > 0 ? 1 : ($openSupply > 0 ? 2 : 3);

        return [
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
            'category' => (string) $row->categoryid,
            'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
            'quantityOnHand' => round($qoh, (int) $row->decimalplaces),
            'periodUsage' => array_map(fn ($value) => round($value, (int) $row->decimalplaces), $periods),
            'usageTotal' => round((float) $row->usage_total, (int) $row->decimalplaces),
            'usageBasis' => round($basis, 4),
            'idealStock' => round($ideal, (int) $row->decimalplaces),
            'customerDemand' => round((float) $row->demand, (int) $row->decimalplaces),
            'assemblyDemand' => round((float) $row->bom_demand, (int) $row->decimalplaces),
            'totalDemand' => round($demand, (int) $row->decimalplaces),
            'purchaseOnOrder' => round((float) $row->on_order, (int) $row->decimalplaces),
            'workOrderSupply' => round((float) $row->work_order, (int) $row->decimalplaces),
            'openSupply' => round($openSupply, (int) $row->decimalplaces),
            'suggestedOrder' => round($suggested, (int) $row->decimalplaces),
            'unitCost' => round($unitCost, 6),
            'suggestedValue' => round($suggested * $unitCost, 2),
            'units' => (string) ($row->units ?: ''),
            'decimalPlaces' => (int) $row->decimalplaces,
            'priority' => $priority,
            'status' => $suggested > 0 ? 'Order suggested' : ($openSupply > 0 ? 'Covered by supply' : 'Monitor'),
        ];
    }

    private function usageSubquery(array $filters, array $periods)
    {
        $selects = ['stockid'];
        if ($filters['location'] !== 'All') {
            $selects[] = 'loccode';
        }

        $query = DB::table('stockmoves')->select($selects)
            ->selectRaw('SUM(CASE WHEN qty < 0 THEN -qty ELSE 0 END) as usage_total')
            ->whereIn('type', [10, 11])
            ->where(function ($inner) {
                $inner->whereNull('hidemovt')->orWhere('hidemovt', 0);
            })
            ->where('trandate', '>=', $filters['dateFrom'] . ' 00:00:00')
            ->where('trandate', '<=', $filters['dateTo'] . ' 23:59:59');

        foreach ($periods as $index => $period) {
            $query->selectRaw("SUM(CASE WHEN trandate >= ? AND trandate <= ? AND qty < 0 THEN -qty ELSE 0 END) as prd{$index}", [
                $period['from'] . ' 00:00:00',
                $period['to'] . ' 23:59:59',
            ]);
        }

        if ($filters['location'] !== 'All') {
            $query->where('loccode', $filters['location'])->groupBy('stockid', 'loccode');
        } else {
            $query->groupBy('stockid');
        }

        return $query;
    }

    private function demandSubquery(array $filters)
    {
        if (!Schema::hasTable('salesorderdetails') || !Schema::hasTable('salesorders')) {
            return DB::query()->fromRaw('(select "" as stockid, 0 as demand) as empty_demand')->whereRaw('1 = 0');
        }

        $query = DB::table('salesorderdetails as sod')
            ->join('salesorders as so', 'so.orderno', '=', 'sod.orderno')
            ->select('sod.stkcode as stockid')
            ->selectRaw('SUM(sod.quantity - sod.qtyinvoiced) as demand')
            ->where('sod.completed', 0)
            ->where('so.quotation', 0)
            ->whereRaw('(sod.quantity - sod.qtyinvoiced) > 0');

        if ($filters['location'] !== 'All') {
            $query->where('so.fromstkloc', $filters['location']);
        }

        return $query->groupBy('sod.stkcode');
    }

    private function bomDemandSubquery(array $filters)
    {
        if (!Schema::hasTable('salesorderdetails') || !Schema::hasTable('salesorders') || !Schema::hasTable('bom')) {
            return DB::query()->fromRaw('(select "" as stockid, 0 as demand) as empty_bom_demand')->whereRaw('1 = 0');
        }

        $query = DB::table('salesorderdetails as sod')
            ->join('bom', 'bom.parent', '=', 'sod.stkcode')
            ->join('stockmaster as parent', 'parent.stockid', '=', 'bom.parent')
            ->join('salesorders as so', 'so.orderno', '=', 'sod.orderno')
            ->select('bom.component as stockid')
            ->selectRaw('SUM((sod.quantity - sod.qtyinvoiced) * bom.quantity) as demand')
            ->where('sod.completed', 0)
            ->where('so.quotation', 0)
            ->where('parent.mbflag', 'A')
            ->whereRaw('(sod.quantity - sod.qtyinvoiced) > 0');

        if ($filters['location'] !== 'All') {
            $query->where('so.fromstkloc', $filters['location']);
        }

        return $query->groupBy('bom.component');
    }

    private function purchaseOrderSubquery(array $filters)
    {
        if (!Schema::hasTable('purchorders') || !Schema::hasTable('purchorderdetails')) {
            return DB::query()->fromRaw('(select "" as stockid, 0 as on_order) as empty_po')->whereRaw('1 = 0');
        }

        $query = DB::table('purchorderdetails as pod')
            ->join('purchorders as po', 'po.orderno', '=', 'pod.orderno')
            ->select('pod.itemcode as stockid')
            ->selectRaw('SUM(pod.quantityord - pod.quantityrecd) as on_order')
            ->where('pod.completed', 0)
            ->whereNotIn('po.status', ['Cancelled', 'Pending', 'Rejected', 'Completed'])
            ->whereRaw('(pod.quantityord - pod.quantityrecd) > 0');

        if ($filters['location'] !== 'All') {
            $query->where('po.intostocklocation', $filters['location']);
        }

        return $query->groupBy('pod.itemcode');
    }

    private function workOrderSubquery(array $filters)
    {
        if (!Schema::hasTable('workorders') || !Schema::hasTable('woitems')) {
            return DB::query()->fromRaw('(select "" as stockid, 0 as on_order) as empty_wo')->whereRaw('1 = 0');
        }

        $query = DB::table('woitems')
            ->join('workorders', 'workorders.wo', '=', 'woitems.wo')
            ->select('woitems.stockid')
            ->selectRaw('SUM(woitems.qtyreqd - woitems.qtyrecd) as on_order')
            ->where('workorders.closed', 0)
            ->whereRaw('(woitems.qtyreqd - woitems.qtyrecd) > 0');

        if ($filters['location'] !== 'All') {
            $query->where('workorders.loccode', $filters['location']);
        }

        return $query->groupBy('woitems.stockid');
    }

    private function periods(array $filters): array
    {
        $rangeFrom = Carbon::parse($filters['dateFrom'])->startOfDay();
        $rangeTo = Carbon::parse($filters['dateTo'])->endOfDay();
        if ($rangeFrom->greaterThan($rangeTo)) {
            [$rangeFrom, $rangeTo] = [$rangeTo, $rangeFrom];
        }

        $cursor = $rangeTo->copy()->startOfMonth();
        $periods = [];
        while ($cursor->greaterThanOrEqualTo($rangeFrom->copy()->startOfMonth()) && count($periods) < 6) {
            $start = $cursor->copy()->startOfMonth();
            $end = $cursor->copy()->endOfMonth();
            $periodFrom = $start->greaterThan($rangeFrom) ? $start : $rangeFrom;
            $periodTo = $end->lessThan($rangeTo) ? $end : $rangeTo;
            $periods[] = [
                'key' => 'prd' . (count($periods)),
                'label' => $cursor->format('M Y'),
                'from' => $periodFrom->toDateString(),
                'to' => $periodTo->toDateString(),
                'active' => true,
            ];
            $cursor->subMonth();
        }

        while (count($periods) < 6) {
            $periods[] = [
                'key' => 'prd' . count($periods),
                'label' => '',
                'from' => '1900-01-01',
                'to' => '1900-01-01',
                'active' => false,
            ];
        }

        return $periods;
    }

    private function summary($rows): array
    {
        return [
            'lines' => $rows->count(),
            'items' => $rows->pluck('stockId')->unique()->count(),
            'suggestedLines' => $rows->where('suggestedOrder', '>', 0)->count(),
            'suggestedQuantity' => round((float) $rows->sum('suggestedOrder'), 4),
            'suggestedValue' => round((float) $rows->sum('suggestedValue'), 2),
            'openDemand' => round((float) $rows->sum('totalDemand'), 4),
            'openSupply' => round((float) $rows->sum('openSupply'), 4),
            'usageTotal' => round((float) $rows->sum('usageTotal'), 4),
        ];
    }

    private function context(array $filters, $rows): array
    {
        return [
            'company' => $this->companyProfile(),
            'filters' => $filters,
            'summary' => $this->summary($rows),
            'currency' => $this->currency(),
            'location' => $this->locationLabel($filters['location']),
            'category' => $this->categoryLabel($filters['category']),
            'periods' => $this->periods($filters),
        ];
    }

    private function locationOptions()
    {
        return DB::table('locations')
            ->select('loccode', 'locationname')
            ->orderBy('locationname')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->loccode,
                'label' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
                'code' => (string) $row->loccode,
            ])
            ->values();
    }

    private function categoryOptions()
    {
        return DB::table('stockcategory')
            ->select('categoryid', 'categorydescription')
            ->orderBy('categorydescription')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->categoryid,
                'label' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
                'code' => (string) $row->categoryid,
            ])
            ->values();
    }

    private function locationLabel(string $location): string
    {
        if ($location === 'All') return 'All locations';
        $row = DB::table('locations')->where('loccode', $location)->first();
        return $row ? html_entity_decode((string) ($row->locationname ?: $location)) : $location;
    }

    private function categoryLabel(string $category): string
    {
        if ($category === 'All') return 'All categories';
        $row = DB::table('stockcategory')->where('categoryid', $category)->first();
        return $row ? html_entity_decode((string) ($row->categorydescription ?: $category)) : $category;
    }

    private function currency(): string
    {
        return Schema::hasTable('companies')
            ? (string) (DB::table('companies')->where('coycode', 1)->value('currencydefault') ?: 'TZS')
            : 'TZS';
    }

    private function companyProfile(): array
    {
        $company = Schema::hasTable('companies') ? DB::table('companies')->where('coycode', 1)->first() : null;
        return [
            'name' => html_entity_decode((string) ($company->coyname ?? 'Akiva')),
            'address' => array_values(array_filter([
                (string) ($company->regoffice1 ?? ''),
                (string) ($company->regoffice2 ?? ''),
                (string) ($company->regoffice3 ?? ''),
            ])),
        ];
    }

    private function validDate(string $value, string $fallback): string
    {
        if ($value === '') return $fallback;
        try {
            return Carbon::parse($value)->toDateString();
        } catch (\Throwable) {
            return $fallback;
        }
    }

    private function pdf($rows, array $context): string
    {
        $width = 841.89;
        $height = 595.28;
        $margin = 24.0;
        $rowHeight = 15.0;
        $chunks = $rows->chunk(25)->values();
        $pages = [];

        foreach ($chunks as $pageIndex => $chunk) {
            $pageNumber = $pageIndex + 1;
            $content = '';
            $content .= $this->pdfRect($margin, 510, $width - ($margin * 2), 58, '0.999 0.973 0.984', '0.918 0.859 0.890');
            $content .= $this->pdfText($context['company']['name'], 34, 548, 18, true, '0.129 0.063 0.098');
            $content .= $this->pdfText('Inventory Planning', 610, 548, 20, true, '0.149 0.212 0.290');
            $content .= $this->pdfText('Printed ' . Carbon::now()->format('d M Y, H:i'), 610, 532, 9, false, '0.373 0.282 0.341');
            $content .= $this->pdfText('Page ' . $pageNumber . ' of ' . max(1, $chunks->count()), 610, 520, 9, false, '0.373 0.282 0.341');

            $meta = [
                ['Suggested value', $this->money($context['summary']['suggestedValue'], $context['currency'])],
                ['Location', $context['location']],
                ['Category', $context['category']],
                ['Policy', $context['filters']['policy'] === 'average' ? 'Average usage' : 'Peak usage'],
                ['Cover months', (string) $context['filters']['monthsCover']],
            ];
            $x = $margin;
            $metaWidth = ($width - ($margin * 2)) / count($meta);
            foreach ($meta as [$label, $value]) {
                $content .= $this->pdfRect($x, 468, $metaWidth, 34, '1 1 1', '0.918 0.859 0.890');
                $content .= $this->pdfText($label, $x + 6, 488, 8, true, '0.373 0.282 0.341');
                $content .= $this->pdfText($this->fitText($value, 23), $x + 6, 476, 9.5, true, '0.129 0.063 0.098');
                $x += $metaWidth;
            }

            $columns = [
                ['Part', 72, 'left'],
                ['Description', 170, 'left'],
                ['Category', 110, 'left'],
                ['Basis', 56, 'right'],
                ['Ideal', 55, 'right'],
                ['QOH', 55, 'right'],
                ['Demand', 62, 'right'],
                ['Supply', 62, 'right'],
                ['Suggested', 76, 'right'],
                ['Value', 78, 'right'],
                ['Status', 68, 'left'],
            ];
            $x = $margin;
            foreach ($columns as [$heading, $columnWidth]) {
                $content .= $this->pdfRect($x, 434, $columnWidth, 20, '0.973 0.929 0.953', '0.918 0.859 0.890');
                $content .= $this->pdfText($heading, $x + 4, 441, 8.5, true, '0.294 0.204 0.259');
                $x += $columnWidth;
            }

            $y = 416;
            foreach ($chunk as $index => $row) {
                $fill = $index % 2 === 0 ? '1 1 1' : '0.999 0.973 0.984';
                $x = $margin;
                $cells = [
                    [$row['stockId'], 72, 'left', 12],
                    [$row['description'], 170, 'left', 29],
                    [$row['categoryName'], 110, 'left', 18],
                    [$this->number($row['usageBasis'], 2), 56, 'right', 8],
                    [$this->number($row['idealStock'], 0), 55, 'right', 8],
                    [$this->number($row['quantityOnHand'], 0), 55, 'right', 8],
                    [$this->number($row['totalDemand'], 0), 62, 'right', 8],
                    [$this->number($row['openSupply'], 0), 62, 'right', 8],
                    [$this->number($row['suggestedOrder'], 0), 76, 'right', 10],
                    [$this->money($row['suggestedValue'], $context['currency']), 78, 'right', 12],
                    [$row['status'], 68, 'left', 11],
                ];

                foreach ($cells as [$value, $columnWidth, $align, $chars]) {
                    $content .= $this->pdfRect($x, $y, $columnWidth, $rowHeight, $fill, '0.918 0.859 0.890');
                    $text = $this->fitText((string) $value, $chars);
                    $textX = $align === 'right' ? $x + $columnWidth - 5 - $this->pdfTextWidth($text, 8.6) : $x + 4;
                    $content .= $this->pdfText($text, max($x + 4, $textX), $y + 4.5, 8.6, true, '0.129 0.063 0.098');
                    $x += $columnWidth;
                }
                $y -= $rowHeight;
            }

            $pages[] = $content;
        }

        return $this->buildPdf($pages, $width, $height);
    }

    private function xlsx($rows, array $context): string
    {
        $sheetRows = [
            [['value' => $context['company']['name'], 'style' => 1]],
            [['value' => 'Inventory Planning', 'style' => 1]],
            [['value' => 'Printed ' . Carbon::now()->format('d M Y, H:i')]],
            [],
            [['value' => 'Location', 'style' => 2], ['value' => $context['location']], ['value' => 'Category', 'style' => 2], ['value' => $context['category']]],
            [['value' => 'Policy', 'style' => 2], ['value' => $context['filters']['policy']], ['value' => 'Suggested value', 'style' => 2], ['value' => $context['summary']['suggestedValue'], 'type' => 'number']],
            [],
            array_map(fn ($value) => ['value' => $value, 'style' => 2], [
                'Part Number',
                'Description',
                'Category',
                'QOH',
                'Usage Basis',
                'Ideal Stock',
                'Customer Demand',
                'Assembly Demand',
                'Open Supply',
                'Suggested Order',
                'Unit Cost',
                'Suggested Value',
                'Status',
            ]),
        ];

        foreach ($rows as $row) {
            $sheetRows[] = [
                ['value' => $row['stockId']],
                ['value' => $row['description']],
                ['value' => $row['categoryName']],
                ['value' => $row['quantityOnHand'], 'type' => 'number'],
                ['value' => $row['usageBasis'], 'type' => 'number'],
                ['value' => $row['idealStock'], 'type' => 'number'],
                ['value' => $row['customerDemand'], 'type' => 'number'],
                ['value' => $row['assemblyDemand'], 'type' => 'number'],
                ['value' => $row['openSupply'], 'type' => 'number'],
                ['value' => $row['suggestedOrder'], 'type' => 'number'],
                ['value' => $row['unitCost'], 'type' => 'number'],
                ['value' => $row['suggestedValue'], 'type' => 'number'],
                ['value' => $row['status']],
            ];
        }

        return $this->zipArchive([
            '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
            '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
            'xl/workbook.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory Planning" sheetId="1" r:id="rId1"/></sheets></workbook>',
            'xl/_rels/workbook.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
            'xl/styles.xml' => $this->xlsxStyles(),
            'xl/worksheets/sheet1.xml' => $this->xlsxWorksheet($sheetRows),
        ]);
    }

    private function xlsxWorksheet(array $rows): string
    {
        $sheetRows = '';
        foreach ($rows as $rowIndex => $row) {
            $sheetRows .= '<row r="' . ($rowIndex + 1) . '">';
            foreach ($row as $columnIndex => $cell) {
                $sheetRows .= $this->xlsxCell($columnIndex + 1, $rowIndex + 1, $cell);
            }
            $sheetRows .= '</row>';
        }
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="13" width="18" customWidth="1"/></cols><sheetData>' . $sheetRows . '</sheetData><autoFilter ref="A8:M' . max(8, count($rows)) . '"/></worksheet>';
    }

    private function xlsxCell(int $column, int $row, array $cell): string
    {
        $reference = $this->xlsxColumnName($column) . $row;
        $style = isset($cell['style']) ? ' s="' . (int) $cell['style'] . '"' : '';
        $value = $cell['value'] ?? '';
        if (($cell['type'] ?? '') === 'number' && is_numeric($value)) {
            return '<c r="' . $reference . '"' . $style . '><v>' . $value . '</v></c>';
        }
        return '<c r="' . $reference . '" t="inlineStr"' . $style . '><is><t>' . $this->xml($value) . '</t></is></c>';
    }

    private function xlsxColumnName(int $column): string
    {
        $name = '';
        while ($column > 0) {
            $column--;
            $name = chr(65 + ($column % 26)) . $name;
            $column = intdiv($column, 26);
        }
        return $name;
    }

    private function xlsxStyles(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF7B6170"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8EDF3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>';
    }

    private function buildPdf(array $pages, float $width, float $height): string
    {
        $objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
        $pageObjectIds = [];
        foreach ($pages as $content) {
            $contentObjectId = count($objects) + 2;
            $pageObjectIds[] = count($objects) + 1;
            $objects[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' . $width . ' ' . $height . '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' . $contentObjectId . ' 0 R >>';
            $objects[] = '<< /Length ' . strlen($content) . " >>\nstream\n" . $content . "\nendstream";
        }
        $objects[1] = '<< /Type /Pages /Kids [' . implode(' ', array_map(fn ($id) => $id . ' 0 R', $pageObjectIds)) . '] /Count ' . count($pageObjectIds) . ' >>';
        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $index => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= ($index + 1) . " 0 obj\n" . $object . "\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
        for ($i = 1; $i <= count($objects); $i++) {
            $pdf .= sprintf('%010d 00000 n ', $offsets[$i]) . "\n";
        }
        return $pdf . "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF";
    }

    private function pdfRect(float $x, float $y, float $width, float $height, string $fillColor, string $strokeColor): string
    {
        return "q {$fillColor} rg {$strokeColor} RG {$x} {$y} {$width} {$height} re B Q\n";
    }

    private function pdfText(string $text, float $x, float $y, float $size, bool $bold = false, string $color = '0 0 0'): string
    {
        return "BT {$color} rg /" . ($bold ? 'F2' : 'F1') . " {$size} Tf {$x} {$y} Td (" . $this->pdfEscape($text) . ") Tj ET\n";
    }

    private function pdfEscape(string $text): string
    {
        $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
        $converted = iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $text);
        return str_replace(['\\', '(', ')', "\r", "\n"], ['\\\\', '\\(', '\\)', ' ', ' '], (string) ($converted === false ? $text : $converted));
    }

    private function pdfTextWidth(string $text, float $size): float
    {
        $converted = iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $text);
        return strlen((string) ($converted === false ? $text : $converted)) * $size * 0.48;
    }

    private function fitText(string $text, int $chars): string
    {
        $text = trim(preg_replace('/\s+/', ' ', html_entity_decode($text, ENT_QUOTES, 'UTF-8')) ?? '');
        if (mb_strlen($text) <= $chars) return $text;
        return rtrim(mb_substr($text, 0, max(1, $chars - 3))) . '...';
    }

    private function number(float $value, int $decimalPlaces = 2): string
    {
        return number_format($value, max(0, $decimalPlaces));
    }

    private function money(float $value, string $currency): string
    {
        return $currency . ' ' . number_format($value, 2);
    }

    private function filename(string $extension): string
    {
        return 'inventory-planning-' . Carbon::now()->format('Y-m-d') . '.' . $extension;
    }

    private function zipArchive(array $files): string
    {
        $zip = '';
        $centralDirectory = '';
        $offset = 0;
        foreach ($files as $name => $contents) {
            $contents = (string) $contents;
            $crc = (int) sprintf('%u', crc32($contents));
            $size = strlen($contents);
            [$dosTime, $dosDate] = $this->zipDosDateTime();
            $localHeader = pack('VvvvvvVVVvv', 0x04034b50, 20, 0, 0, $dosTime, $dosDate, $crc, $size, $size, strlen($name), 0) . $name;
            $zip .= $localHeader . $contents;
            $centralDirectory .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, 0, 0, $dosTime, $dosDate, $crc, $size, $size, strlen($name), 0, 0, 0, 0, 0, $offset) . $name;
            $offset += strlen($localHeader) + $size;
        }
        return $zip . $centralDirectory . pack('VvvvvVVv', 0x06054b50, 0, 0, count($files), count($files), strlen($centralDirectory), $offset, 0);
    }

    private function zipDosDateTime(): array
    {
        $time = getdate();
        return [
            (($time['hours'] & 0x1f) << 11) | (($time['minutes'] & 0x3f) << 5) | ((int) floor($time['seconds'] / 2) & 0x1f),
            (($time['year'] - 1980) << 9) | (($time['mon'] & 0x0f) << 5) | ($time['mday'] & 0x1f),
        ];
    }

    private function xml($value): string
    {
        return htmlspecialchars((string) $value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
