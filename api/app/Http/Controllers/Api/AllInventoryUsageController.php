<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AllInventoryUsageController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => $this->emptyPayload(),
            ]);
        }

        try {
            $filters = $this->filters($request);
            $rows = $filters['run'] ? $this->reportRows($filters) : collect();

            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => $this->locationOptions($filters['userId']),
                    'categories' => $this->categoryOptions(),
                    'saleTypes' => $this->saleTypeOptions(),
                    'rows' => $rows->values(),
                    'summary' => $this->summary($rows),
                    'currency' => $this->currency(),
                    'filters' => $filters,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'All inventory usage could not be loaded.',
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
                'message' => 'All inventory usage is not available.',
            ], 503);
        }

        try {
            $filters = $this->filters($request);
            $filters['run'] = true;
            $rows = $this->reportRows($filters);

            if ($rows->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no usage rows to export for the selected filters.',
                ], 422);
            }

            $context = [
                'company' => $this->companyProfile(),
                'filters' => $filters,
                'summary' => $this->summary($rows),
                'locations' => $this->selectedOptionLabels($this->locationOptions($filters['userId']), $filters['locations']),
                'categories' => $this->selectedOptionLabels($this->categoryOptions(), $filters['categories']),
                'currency' => $this->currency(),
            ];

            if ($format === 'pdf') {
                $options = new Options();
                $options->set('defaultFont', 'DejaVu Sans');
                $options->set('isRemoteEnabled', false);
                $options->set('isHtml5ParserEnabled', true);

                $dompdf = new Dompdf($options);
                $dompdf->loadHtml($this->pdfHtml($rows, $context), 'UTF-8');
                $dompdf->setPaper('A4', 'landscape');
                $dompdf->render();

                return response($dompdf->output(), 200, [
                    'Content-Type' => 'application/pdf',
                    'Content-Disposition' => 'inline; filename="' . $this->exportFilename('pdf') . '"',
                    'Cache-Control' => 'private, max-age=0, must-revalidate',
                    'Pragma' => 'public',
                ]);
            }

            return response($this->exportXlsx($rows, $context), 200, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition' => 'attachment; filename="' . $this->exportFilename('xlsx') . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $format === 'pdf' ? 'All inventory usage PDF could not be created.' : 'All inventory usage Excel file could not be created.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('locstock')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('stockcategory')
            && Schema::hasTable('stockmoves')
            && Schema::hasTable('locations')
            && Schema::hasTable('locationusers');
    }

    private function emptyPayload(): array
    {
        return [
            'locations' => [],
            'categories' => [],
            'saleTypes' => [],
            'rows' => [],
            'summary' => $this->summary(collect()),
            'currency' => 'TZS',
            'filters' => [],
        ];
    }

    private function filters(Request $request): array
    {
        $from = $this->validDate((string) $request->query('dateFrom', $request->query('from', '')), Carbon::today()->subMonths(2)->startOfMonth()->toDateString());
        $to = $this->validDate((string) $request->query('dateTo', $request->query('to', '')), Carbon::today()->toDateString());

        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        return [
            'run' => $request->boolean('run', false),
            'dateFrom' => $from,
            'dateTo' => $to,
            'categories' => $this->arrayFilter($request, 'categories'),
            'locations' => $this->arrayFilter($request, 'locations'),
            'saleTypes' => $this->arrayFilter($request, 'saleTypes'),
            'userId' => $this->currentUserId($request),
            'search' => trim((string) $request->query('q', '')),
        ];
    }

    private function reportRows(array $filters)
    {
        if (empty($filters['categories']) || empty($filters['locations']) || empty($filters['saleTypes'])) {
            return collect();
        }

        $rows = collect(DB::select($this->legacyInventoryUsageSql($filters)));
        $grouped = $this->groupLegacyRows($rows);

        $this->recalculateBalances($grouped, $filters);

        if ($filters['search'] !== '') {
            $needle = mb_strtolower($filters['search']);
            $grouped = $grouped->filter(function ($row) use ($needle) {
                return str_contains(mb_strtolower($row['stockId'] . ' ' . $row['description'] . ' ' . $row['categoryDescription']), $needle);
            });
        }

        return $grouped
            ->filter(fn ($row) => (float) $row['usage'] !== 0.0)
            ->values();
    }

    private function legacyInventoryUsageSql(array $filters): string
    {
        $startDate = $filters['dateFrom'];
        $endDate = $filters['dateTo'];
        $locationList = $this->quotedList($filters['locations']);
        $categoryList = $this->quotedList($filters['categories']);
        $saleTypes = array_map(fn ($value) => (int) $value, $filters['saleTypes']);
        $exSaleTypes = $saleTypes;

        if (in_array(-1, $saleTypes, true) || in_array(-2, $saleTypes, true)) {
            $exSaleTypes = [17];
        }

        if ((in_array(-1, $saleTypes, true) || in_array(-2, $saleTypes, true)) && in_array(10, $saleTypes, true)) {
            $exSaleTypes = [10, 17];
        }

        $typeFilteredContinued = '';
        $subTypeFilteredContinued = '';
        if (in_array(-1, $saleTypes, true)) {
            $typeFilteredContinued .= ' AND sm.userid IS NULL ';
            $subTypeFilteredContinued .= ' AND stockmoves.userid IS NULL ';
        }
        if (in_array(-2, $saleTypes, true)) {
            $typeFilteredContinued .= ' AND sm.userid IS NOT NULL ';
            $subTypeFilteredContinued .= ' AND stockmoves.userid IS NOT NULL ';
        }
        if (in_array(-1, $saleTypes, true) && in_array(-2, $saleTypes, true)) {
            $typeFilteredContinued = '';
            $subTypeFilteredContinued = '';
        }

        unset($subTypeFilteredContinued);

        $saleTypeList = implode(',', array_map('intval', $exSaleTypes));
        $saleTypeList .= ',25';
        $locationFilter = "AND ls.loccode IN ($locationList)";
        $locationSubFilter = "sm.loccode IN ($locationList)";
        $locationSubSubFilter = "stockmoves.loccode IN ($locationList)";
        $categoryFilter = "AND sm.categoryid IN ($categoryList)";
        $categorySubFilter = "AND s.categoryid IN ($categoryList)";
        $saleTypeSubFilter = " AND stockmoves.type IN ($saleTypeList)";
        $saleTypeFilter = " AND sm.type IN ($saleTypeList)";
        $userId = $this->quote($filters['userId']);

        return "SELECT 
            sm.categoryid,
            sc.categorydescription,
            sm.description,
            ls.stockid,
            l.locationname,
            SUM(ls.quantity) AS qoh,

            COALESCE(ob.opening_balance, 0) AS opening_balance,
            COALESCE(cb.closing_balance, 0) AS closing_balance,
            COALESCE(mov.stock_movement, 0) AS stock_movement,
            COALESCE(mov.new_purchases, 0) AS new_purchases,
            ROUND(COALESCE(mov.consumption_cost, 0), 2) AS consumption_cost,
            COALESCE(sm.materialcost, 0) AS materialcost

        FROM locstock ls

        INNER JOIN locationusers lu 
            ON lu.loccode = ls.loccode
            AND lu.userid = $userId 
            AND lu.canview = 1

        INNER JOIN stockmaster sm 
            ON ls.stockid = sm.stockid

        INNER JOIN stockcategory sc 
            ON sm.categoryid = sc.categoryid

        INNER JOIN locations l 
            ON lu.loccode = l.loccode

        -- Opening Balance
        LEFT JOIN (
            SELECT sm.stockid, sm.loccode, sm.newqoh AS opening_balance, s.materialcost
            FROM stockmoves sm
            INNER JOIN stockmaster s ON sm.stockid = s.stockid
            INNER JOIN (
                SELECT stockid, loccode, MAX(trandate) AS max_date, MAX(stkmoveno) AS max_stk
                FROM stockmoves
                WHERE trandate < '$startDate' AND hidemovt = 0 AND $locationSubSubFilter $saleTypeSubFilter
                GROUP BY stockid, loccode
            ) max_sm ON sm.stockid = max_sm.stockid AND sm.loccode = max_sm.loccode
                AND sm.trandate = max_sm.max_date AND sm.stkmoveno = max_sm.max_stk
            WHERE s.categoryid IN ($categoryList)
        ) ob ON ob.stockid = ls.stockid AND ob.loccode = ls.loccode

        -- Closing Balance
        LEFT JOIN (
            SELECT sm.stockid, sm.loccode, sm.newqoh AS closing_balance
            FROM stockmoves sm
            INNER JOIN stockmaster s ON sm.stockid = s.stockid
            INNER JOIN (
                SELECT stockid, loccode, MAX(trandate) AS max_date, MAX(stkmoveno) AS max_stk
                FROM stockmoves
                WHERE trandate <= '$endDate' AND hidemovt = 0 AND $locationSubSubFilter $saleTypeSubFilter
                GROUP BY stockid, loccode
            ) max_sm ON sm.stockid = max_sm.stockid AND sm.loccode = max_sm.loccode
                AND sm.trandate = max_sm.max_date AND sm.stkmoveno = max_sm.max_stk
            WHERE s.categoryid IN ($categoryList)
        ) cb ON cb.stockid = ls.stockid AND cb.loccode = ls.loccode

        -- Movements
        LEFT JOIN (
            SELECT sm.stockid, sm.loccode, sm.type, sm.userid,
                SUM(CASE WHEN sm.qty < 0 AND sm.type <> 25 THEN sm.qty ELSE 0 END) AS stock_movement,
                SUM(CASE WHEN sm.type = 25 THEN sm.qty ELSE 0 END) AS new_purchases,
                SUM(CASE WHEN sm.qty < 0 AND sm.type <> 25 THEN sm.price ELSE 0 END) AS consumption_cost
            FROM stockmoves sm
            INNER JOIN stockmaster s ON sm.stockid = s.stockid
            WHERE sm.trandate BETWEEN '$startDate' AND '$endDate'
                AND sm.hidemovt = 0
                AND sm.type IN ($saleTypeList)
                AND $locationSubFilter
                $categorySubFilter
                $saleTypeFilter
                $typeFilteredContinued
            GROUP BY sm.stockid, sm.loccode, sm.type, sm.userid
        ) mov ON mov.stockid = ls.stockid AND mov.loccode = ls.loccode

        WHERE sm.discontinued = 0
            AND (sm.mbflag = 'B' OR sm.mbflag = 'M')
            AND COALESCE(mov.stock_movement, 0) <> 0
            $locationFilter
            $categoryFilter

        GROUP BY 
            sm.categoryid, sc.categorydescription, sm.description, ls.stockid,
            ob.opening_balance, cb.closing_balance, mov.stock_movement, 
            mov.new_purchases, mov.consumption_cost, l.locationname

        ORDER BY sm.categoryid, ls.stockid";
    }

    private function groupLegacyRows($rows)
    {
        $grouped = [];
        $seenStockLocQoh = [];
        $seenStockLocation = [];

        foreach ($rows as $row) {
            $stockId = (string) $row->stockid;
            $location = (string) $row->locationname;
            $stockLocKey = $stockId . '|' . $location;

            if (!isset($grouped[$stockId])) {
                $grouped[$stockId] = [
                    'stockId' => $stockId,
                    'description' => html_entity_decode((string) $row->description),
                    'categoryDescription' => html_entity_decode((string) $row->categorydescription),
                    'materialCost' => (float) $row->materialcost,
                    'quantityOnHand' => 0.0,
                    'openingBalance' => 0.0,
                    'closingBalance' => 0.0,
                    'newPurchases' => 0.0,
                    'usage' => 0.0,
                    'consumptionCost' => 0.0,
                    'usageCost' => 0.0,
                ];
            }

            if (!isset($seenStockLocQoh[$stockLocKey])) {
                $grouped[$stockId]['quantityOnHand'] += (float) $row->qoh;
                $seenStockLocQoh[$stockLocKey] = true;
            }

            if (!isset($seenStockLocation[$stockLocKey])) {
                $grouped[$stockId]['openingBalance'] += (float) $row->opening_balance;
                $grouped[$stockId]['closingBalance'] += (float) $row->closing_balance;
                $seenStockLocation[$stockLocKey] = true;
            }

            $grouped[$stockId]['newPurchases'] += (float) $row->new_purchases;
            $grouped[$stockId]['usage'] += (float) $row->stock_movement;
            $grouped[$stockId]['consumptionCost'] += (float) $row->consumption_cost;
        }

        return collect($grouped)->map(function ($row) {
            $row['usageCost'] = abs((float) $row['usage'] * (float) $row['materialCost']);
            return $row;
        });
    }

    private function recalculateBalances(&$grouped, array $filters): void
    {
        if ($grouped->isEmpty()) {
            return;
        }

        $stockIds = $grouped->keys()->values()->all();
        $locations = $filters['locations'];

        $openingRows = $this->latestBalanceRows($stockIds, $locations, '<', $filters['dateFrom']);
        $closingRows = $this->latestBalanceRows($stockIds, $locations, '<=', $filters['dateTo']);

        $openingByStock = [];
        foreach ($openingRows as $row) {
            $openingByStock[(string) $row->stockid] = ($openingByStock[(string) $row->stockid] ?? 0.0) + (float) $row->newqoh;
        }

        $closingByStock = [];
        foreach ($closingRows as $row) {
            $closingByStock[(string) $row->stockid] = ($closingByStock[(string) $row->stockid] ?? 0.0) + (float) $row->newqoh;
        }

        $grouped = $grouped->map(function ($stockData, $stockId) use ($openingByStock, $closingByStock) {
            $stockData['openingBalance'] = $openingByStock[(string) $stockId] ?? 0.0;
            $stockData['closingBalance'] = $closingByStock[(string) $stockId] ?? 0.0;

            return $stockData;
        });
    }

    private function latestBalanceRows(array $stockIds, array $locations, string $operator, string $date)
    {
        if (empty($stockIds) || empty($locations)) {
            return collect();
        }

        $latest = DB::table('stockmoves')
            ->select('stockid', 'loccode', DB::raw('MAX(stkmoveno) AS max_stkmoveno'))
            ->whereIn('stockid', $stockIds)
            ->whereIn('loccode', $locations)
            ->where('trandate', $operator, $date)
            ->where('hidemovt', 0)
            ->groupBy('stockid', 'loccode');

        return DB::table('stockmoves as sm')
            ->joinSub($latest, 'latest', function ($join) {
                $join->on('sm.stockid', '=', 'latest.stockid')
                    ->on('sm.loccode', '=', 'latest.loccode')
                    ->on('sm.stkmoveno', '=', 'latest.max_stkmoveno');
            })
            ->select('sm.stockid', 'sm.loccode', 'sm.newqoh')
            ->get();
    }

    private function summary($rows): array
    {
        return [
            'items' => $rows->count(),
            'quantityOnHand' => round((float) $rows->sum('quantityOnHand'), 4),
            'openingBalance' => round((float) $rows->sum('openingBalance'), 4),
            'closingBalance' => round((float) $rows->sum('closingBalance'), 4),
            'newPurchases' => round((float) $rows->sum('newPurchases'), 4),
            'usage' => round((float) $rows->sum('usage'), 4),
            'usageCost' => round((float) $rows->sum('usageCost'), 2),
        ];
    }

    private function categoryOptions()
    {
        return DB::table('stockcategory')
            ->select('categoryid', 'categorydescription')
            ->whereRaw("LOWER(categorydescription) NOT LIKE '%servic%'")
            ->orderBy('categorydescription')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->categoryid,
                'label' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
                'code' => (string) $row->categoryid,
            ])
            ->values();
    }

    private function locationOptions(string $userId)
    {
        return DB::table('locations')
            ->join('locationusers', function ($join) use ($userId) {
                $join->on('locationusers.loccode', '=', 'locations.loccode')
                    ->where('locationusers.userid', '=', $userId)
                    ->where('locationusers.canview', '=', 1);
            })
            ->select('locations.loccode', 'locations.locationname')
            ->orderBy('locations.locationname')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->loccode,
                'label' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
                'code' => (string) $row->loccode,
            ])
            ->values();
    }

    private function saleTypeOptions(): array
    {
        $systemTypes = Schema::hasTable('systypes')
            ? DB::table('systypes')->whereIn('typeid', [10])->orderBy('typename')->get()
            : collect();

        $options = $systemTypes
            ->map(fn ($row) => [
                'value' => (string) $row->typeid,
                'label' => html_entity_decode((string) ($row->typename ?: $row->typeid)),
                'code' => (string) $row->typeid,
            ])
            ->values()
            ->all();

        $options[] = ['value' => '-1', 'label' => 'Dispensed', 'code' => '-1'];
        $options[] = ['value' => '-2', 'label' => 'Other adjustments', 'code' => '-2'];

        return $options;
    }

    private function selectedOptionLabels($options, array $selected): string
    {
        $selectedMap = array_flip($selected);
        $labels = collect($options)
            ->filter(fn ($option) => isset($selectedMap[(string) $option['value']]))
            ->pluck('label')
            ->values();

        return $labels->isEmpty() ? 'Not selected' : $labels->implode(', ');
    }

    private function arrayFilter(Request $request, string $key): array
    {
        $value = $request->query($key, []);
        if (is_string($value)) {
            $value = explode(',', $value);
        }
        if (!is_array($value)) {
            return [];
        }

        return collect($value)
            ->flatten()
            ->map(fn ($item) => trim((string) $item))
            ->filter(fn ($item) => $item !== '' && strtolower($item) !== 'all')
            ->unique()
            ->values()
            ->all();
    }

    private function currentUserId(Request $request): string
    {
        $candidate = trim((string) ($request->header('X-User-Id') ?: $request->query('userId', '')));
        if ($candidate !== '' && Schema::hasTable('www_users') && DB::table('www_users')->where('userid', $candidate)->exists()) {
            return $candidate;
        }

        if (Schema::hasTable('www_users') && DB::table('www_users')->where('userid', 'admin')->exists()) {
            return 'admin';
        }

        return (string) (DB::table('locationusers')->orderBy('userid')->value('userid') ?: 'admin');
    }

    private function quotedList(array $values): string
    {
        return implode(',', array_map(fn ($value) => $this->quote($value), $values));
    }

    private function quote($value): string
    {
        return DB::connection()->getPdo()->quote((string) $value);
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

    private function currency(): string
    {
        if (!Schema::hasTable('companies')) {
            return 'TZS';
        }

        return (string) (DB::table('companies')->where('coycode', 1)->value('currencydefault') ?: 'TZS');
    }

    private function companyProfile(): array
    {
        $company = Schema::hasTable('companies')
            ? DB::table('companies')->where('coycode', 1)->first()
            : null;

        return [
            'name' => html_entity_decode((string) ($company->coyname ?? 'Akiva')),
            'logo' => $this->companyLogoDataUri(),
            'address' => array_values(array_filter([
                (string) ($company->regoffice1 ?? ''),
                (string) ($company->regoffice2 ?? ''),
                (string) ($company->regoffice3 ?? ''),
                (string) ($company->regoffice4 ?? ''),
                (string) ($company->regoffice5 ?? ''),
                (string) ($company->regoffice6 ?? ''),
            ])),
        ];
    }

    private function companyLogoDataUri(): string
    {
        $database = (string) config('database.connections.mysql.database', '');
        $candidates = [];

        if ($database !== '') {
            $candidates[] = base_path('../weberp_updated/companies/' . $database . '/logo.png');
            $candidates[] = base_path('../weberp_updated/companies/' . $database . '/logo.jpg');
            $candidates[] = base_path('../weberp_updated/companies/' . $database . '/logo.jpeg');
        }

        $candidates[] = base_path('../public/icons/akiva-icon.svg');

        foreach ($candidates as $path) {
            if (!is_file($path)) {
                continue;
            }

            $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
            $mime = $extension === 'svg' ? 'image/svg+xml' : ($extension === 'jpg' || $extension === 'jpeg' ? 'image/jpeg' : 'image/png');

            return 'data:' . $mime . ';base64,' . base64_encode((string) file_get_contents($path));
        }

        return '';
    }

    private function pdfHtml($rows, array $context): string
    {
        $company = $context['company'];
        $address = '';
        foreach ($company['address'] as $line) {
            $address .= '<div>' . $this->html($line) . '</div>';
        }

        $bodyRows = '';
        foreach ($rows as $row) {
            $bodyRows .= '<tr>
                <td>' . $this->html($row['stockId']) . '</td>
                <td>' . $this->html($row['description']) . '</td>
                <td>' . $this->html($row['categoryDescription']) . '</td>
                <td class="right">' . $this->number($row['quantityOnHand'], 0) . '</td>
                <td class="right">' . $this->number($row['openingBalance'], 0) . '</td>
                <td class="right">' . $this->number($row['newPurchases'], 0) . '</td>
                <td class="right">' . $this->number($row['usage'], 0) . '</td>
                <td class="right">' . $this->number($row['closingBalance'], 0) . '</td>
                <td class="right">' . $this->number($row['materialCost'], 2) . '</td>
                <td class="right">' . $this->number($row['usageCost'], 2) . '</td>
            </tr>';
        }

        return '<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 24px 24px 40px; }
    body { color: #1f1020; font-family: DejaVu Sans, sans-serif; font-size: 11px; line-height: 1.42; }
    .top { background: #fff8fb; border: 1px solid #eadbe3; border-radius: 12px; padding: 12px 14px; }
    .brand { border-collapse: collapse; width: 100%; }
    .brand td { vertical-align: top; }
    .logo-cell { width: 70px; }
    .logo { max-height: 54px; max-width: 60px; object-fit: contain; }
    .company { color: #211019; font-size: 18px; font-weight: 700; margin-bottom: 4px; }
    .muted { color: #5f4857; }
    .title-panel { text-align: right; width: 300px; }
    .title { color: #26364a; font-size: 22px; font-weight: 700; }
    .printed { color: #5f4857; margin-top: 4px; }
    .meta { border-collapse: collapse; margin-top: 12px; width: 100%; }
    .meta td { border: 1px solid #eadbe3; padding: 7px 8px; vertical-align: top; width: 25%; }
    .label { color: #5f4857; display: block; font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .value { color: #1f1020; display: block; font-size: 11.5px; font-weight: 700; margin-top: 3px; }
    table.lines { border-collapse: collapse; margin-top: 14px; width: 100%; }
    .lines th { background: #f8edf3; border: 1px solid #eadbe3; color: #4b3442; font-size: 9.5px; letter-spacing: .03em; padding: 7px 4px; text-align: left; text-transform: uppercase; }
    .lines td { border: 1px solid #eadbe3; color: #1f1020; font-size: 11.5px; font-weight: 600; padding: 7px 4px; vertical-align: top; }
    .lines tbody tr:nth-child(even) td { background: #fff8fb; }
    .right { text-align: right; }
    .footer { bottom: -24px; color: #9a8290; font-size: 9px; left: 0; position: fixed; right: 0; text-align: center; }
  </style>
</head>
<body>
  <div class="top">
    <table class="brand">
      <tr>
        <td class="logo-cell">' . ($company['logo'] ? '<img class="logo" src="' . $this->html($company['logo']) . '" alt="Logo">' : '') . '</td>
        <td>
          <div class="company">' . $this->html($company['name']) . '</div>
          <div class="muted">' . $address . '</div>
        </td>
        <td class="title-panel">
          <div class="title">All Inventory Usage</div>
          <div class="printed">Printed ' . $this->html(Carbon::now()->format('d M Y, H:i')) . '</div>
          <div class="printed">' . $this->html((string) count($rows)) . ' items</div>
        </td>
      </tr>
    </table>
  </div>
  <table class="meta">
    <tr>
      <td><span class="label">Start date</span><span class="value">' . $this->html($context['filters']['dateFrom']) . '</span></td>
      <td><span class="label">End date</span><span class="value">' . $this->html($context['filters']['dateTo']) . '</span></td>
      <td><span class="label">Locations</span><span class="value">' . $this->html($context['locations']) . '</span></td>
      <td><span class="label">Categories</span><span class="value">' . $this->html($context['categories']) . '</span></td>
    </tr>
  </table>
  <table class="lines">
    <thead>
      <tr>
        <th style="width: 62px;">Stock ID</th>
        <th style="width: 146px;">Description</th>
        <th style="width: 145px;">Category</th>
        <th class="right" style="width: 46px;">QOH</th>
        <th class="right" style="width: 54px;">Opening</th>
        <th class="right" style="width: 58px;">Purchases</th>
        <th class="right" style="width: 50px;">Usage</th>
        <th class="right" style="width: 54px;">Balance</th>
        <th class="right" style="width: 54px;">Std Cost</th>
        <th class="right" style="width: 64px;">Usage Cost</th>
      </tr>
    </thead>
    <tbody>' . $bodyRows . '</tbody>
  </table>
  <div class="footer">All inventory usage exported from Akiva</div>
</body>
</html>';
    }

    private function exportXlsx($rows, array $context): string
    {
        return $this->zipArchive([
            '[Content_Types].xml' => $this->contentTypesXml(),
            '_rels/.rels' => $this->relsXml(),
            'docProps/app.xml' => $this->appXml(),
            'docProps/core.xml' => $this->coreXml(),
            'xl/workbook.xml' => $this->workbookXml(),
            'xl/_rels/workbook.xml.rels' => $this->workbookRelsXml(),
            'xl/styles.xml' => $this->xlsxStyles(),
            'xl/worksheets/sheet1.xml' => $this->xlsxWorksheet($this->xlsxRows($rows, $context)),
        ]);
    }

    private function xlsxRows($rows, array $context): array
    {
        $summary = $context['summary'];
        $sheetRows = [
            [['value' => $context['company']['name'], 'style' => 1]],
            [['value' => 'All Inventory Usage', 'style' => 1]],
            [['value' => 'Printed ' . Carbon::now()->format('d M Y, H:i')]],
            [],
            [['value' => 'Date range', 'style' => 2], ['value' => $context['filters']['dateFrom'] . ' to ' . $context['filters']['dateTo']]],
            [['value' => 'Locations', 'style' => 2], ['value' => $context['locations']]],
            [['value' => 'Categories', 'style' => 2], ['value' => $context['categories']]],
            [['value' => 'Items', 'style' => 2], ['value' => $summary['items'], 'type' => 'number'], ['value' => 'Usage cost', 'style' => 2], ['value' => number_format((float) $summary['usageCost'], 2, '.', ''), 'type' => 'number']],
            [],
            array_map(fn ($value) => ['value' => $value, 'style' => 2], [
                'Stock ID',
                'Description',
                'Category',
                'Current Quantity on Hand',
                'Opening Balance',
                'New Purchases',
                'Consumption/Usage',
                'Balance',
                'Material Cost',
                'Consumption Cost',
            ]),
        ];

        foreach ($rows as $row) {
            $sheetRows[] = [
                ['value' => $row['stockId']],
                ['value' => $row['description']],
                ['value' => $row['categoryDescription']],
                ['value' => number_format((float) $row['quantityOnHand'], 0, '.', ''), 'type' => 'number'],
                ['value' => number_format((float) $row['openingBalance'], 0, '.', ''), 'type' => 'number'],
                ['value' => number_format((float) $row['newPurchases'], 0, '.', ''), 'type' => 'number'],
                ['value' => number_format((float) $row['usage'], 0, '.', ''), 'type' => 'number'],
                ['value' => number_format((float) $row['closingBalance'], 0, '.', ''), 'type' => 'number'],
                ['value' => number_format((float) $row['materialCost'], 2, '.', ''), 'type' => 'number'],
                ['value' => number_format((float) $row['usageCost'], 2, '.', ''), 'type' => 'number'],
            ];
        }

        return $sheetRows;
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

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="10" topLeftCell="A11" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>
    <col min="1" max="1" width="16" customWidth="1"/>
    <col min="2" max="2" width="36" customWidth="1"/>
    <col min="3" max="3" width="24" customWidth="1"/>
    <col min="4" max="10" width="16" customWidth="1"/>
  </cols>
  <sheetData>' . $sheetRows . '</sheetData>
  <autoFilter ref="A10:J' . max(10, count($rows)) . '"/>
</worksheet>';
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

    private function contentTypesXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>';
    }

    private function relsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>';
    }

    private function appXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Akiva</Application></Properties>';
    }

    private function coreXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>All Inventory Usage</dc:title>
  <dc:creator>Akiva</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">' . Carbon::now()->toIso8601String() . '</dcterms:created>
</cp:coreProperties>';
    }

    private function workbookXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="All Inventory Usage" sheetId="1" r:id="rId1"/></sheets></workbook>';
    }

    private function workbookRelsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    }

    private function xlsxStyles(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF7B6170"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8EDF3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFEADBE3"/></left><right style="thin"><color rgb="FFEADBE3"/></right><top style="thin"><color rgb="FFEADBE3"/></top><bottom style="thin"><color rgb="FFEADBE3"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>';
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

    private function exportFilename(string $extension): string
    {
        return 'all-inventory-usage-' . Carbon::now()->format('Y-m-d') . '.' . $extension;
    }

    private function number($value, int $decimals): string
    {
        return number_format((float) $value, $decimals);
    }

    private function html($value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }

    private function xml($value): string
    {
        return htmlspecialchars((string) $value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
