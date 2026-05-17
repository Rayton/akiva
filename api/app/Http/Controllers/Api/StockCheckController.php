<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockCheckController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json(['success' => true, 'data' => $this->emptyPayload()]);
        }

        try {
            $filters = $this->filters($request);
            $rows = $this->rows($filters, 500);

            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => $this->locations(),
                    'categories' => $this->categories(),
                    'rows' => $rows->values(),
                    'summary' => $this->summary($filters),
                    'filters' => $filters,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock check sheets could not be loaded.',
            ], 500);
        }
    }

    public function prepare(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json(['success' => false, 'message' => 'Stock check sheets are not available.'], 503);
        }

        $location = strtoupper(trim((string) $request->input('location', '')));
        $category = trim((string) $request->input('category', 'All'));
        $mode = (string) $request->input('mode', 'update');
        $onlyNonZero = (bool) $request->input('onlyNonZero', false);

        if ($location === '' || !$this->locationExists($location)) {
            return $this->validationError('Choose the location to count.');
        }

        try {
            $created = DB::transaction(function () use ($location, $category, $mode, $onlyNonZero) {
                $items = DB::table('stockmaster as sm')
                    ->leftJoin('locstock as ls', function ($join) use ($location) {
                        $join->on('ls.stockid', '=', 'sm.stockid')
                            ->where('ls.loccode', '=', $location);
                    })
                    ->where(function ($inner) {
                        $inner->whereNull('sm.discontinued')->orWhere('sm.discontinued', 0);
                    })
                    ->whereNotIn('sm.mbflag', ['D', 'A', 'K'])
                    ->select('sm.stockid', DB::raw('COALESCE(ls.quantity, 0) as qoh'));

                if ($category !== '' && $category !== 'All') {
                    $items->where('sm.categoryid', $category);
                }

                if ($onlyNonZero) {
                    $items->whereRaw('COALESCE(ls.quantity, 0) <> 0');
                }

                $rows = $items->get();

                if ($mode === 'replace') {
                    $delete = DB::table('stockcheckfreeze')->where('loccode', $location);
                    if ($category !== '' && $category !== 'All') {
                        $delete->whereIn('stockid', $rows->pluck('stockid')->map(fn ($value) => (string) $value)->all());
                    }
                    $delete->delete();
                }

                $today = now()->toDateString();
                foreach ($rows as $row) {
                    DB::table('stockcheckfreeze')->updateOrInsert(
                        ['stockid' => (string) $row->stockid, 'loccode' => $location],
                        ['qoh' => (float) $row->qoh, 'stockcheckdate' => $today]
                    );
                }

                return $rows->count();
            });

            $filters = $this->filters($request, [
                'location' => $location,
                'category' => $category,
                'dateFrom' => now()->subMonths(3)->startOfMonth()->toDateString(),
                'dateTo' => now()->toDateString(),
            ]);

            return response()->json([
                'success' => true,
                'message' => $created === 1 ? 'Stock check sheet prepared for 1 item.' : "Stock check sheet prepared for {$created} items.",
                'data' => [
                    'locations' => $this->locations(),
                    'categories' => $this->categories(),
                    'rows' => $this->rows($filters, 500)->values(),
                    'summary' => $this->summary($filters),
                    'filters' => $filters,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock check sheet could not be prepared.',
            ], 500);
        }
    }

    public function sheetPdf(Request $request)
    {
        return $this->pdfResponse($request, 'sheet');
    }

    public function comparisonPdf(Request $request)
    {
        return $this->pdfResponse($request, 'comparison');
    }

    private function pdfResponse(Request $request, string $type)
    {
        if (!$this->hasCoreTables()) {
            return response()->json(['success' => false, 'message' => 'Stock check sheets are not available.'], 503);
        }

        try {
            @ini_set('memory_limit', '512M');
            @set_time_limit(120);

            $filters = $this->filters($request);
            $rows = $this->rows($filters, $type === 'comparison' ? 5000 : 750);

            if ($rows->isEmpty()) {
                return response()->json(['success' => false, 'message' => 'There are no stock check rows for the selected filters.'], 422);
            }

            $options = new Options();
            $options->set('isRemoteEnabled', false);
            $options->set('defaultFont', 'DejaVu Sans');
            $dompdf = new Dompdf($options);
            $dompdf->loadHtml($this->pdfHtml($rows, $filters, $type), 'UTF-8');
            $dompdf->setPaper('A4', $type === 'comparison' ? 'landscape' : 'portrait');
            $dompdf->render();

            return response($dompdf->output(), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . ($type === 'comparison' ? 'stock-check-comparison' : 'stock-check-sheets') . '-' . now()->format('Y-m-d') . '.pdf"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $type === 'comparison' ? 'Stock check comparison PDF could not be created.' : 'Stock check sheets PDF could not be created.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('stockcheckfreeze')
            && Schema::hasTable('stockcounts')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locstock')
            && Schema::hasTable('locations');
    }

    private function emptyPayload(): array
    {
        return [
            'locations' => [],
            'categories' => [],
            'rows' => [],
            'summary' => [
                'sheetItems' => 0,
                'countedItems' => 0,
                'notCountedItems' => 0,
                'varianceItems' => 0,
                'varianceUnits' => 0,
                'locations' => 0,
                'latestSheetDate' => null,
            ],
            'filters' => [],
        ];
    }

    private function filters(Request $request, array $overrides = []): array
    {
        $fallbackFrom = Carbon::today()->subMonths(3)->startOfMonth()->toDateString();
        $dateFrom = $this->validDate((string) ($overrides['dateFrom'] ?? $request->query('dateFrom', '')), $fallbackFrom);
        $dateTo = $this->validDate((string) ($overrides['dateTo'] ?? $request->query('dateTo', '')), Carbon::today()->toDateString());
        if ($dateFrom > $dateTo) {
            [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
        }

        $location = strtoupper(trim((string) ($overrides['location'] ?? $request->query('location', 'All'))));
        $category = trim((string) ($overrides['category'] ?? $request->query('category', 'All')));
        $status = trim((string) $request->query('status', 'All'));

        return [
            'location' => $location === '' || $location === 'ALL' ? 'All' : $location,
            'category' => $category === '' ? 'All' : $category,
            'status' => in_array($status, ['All', 'Not counted', 'Matched', 'Variance'], true) ? $status : 'All',
            'dateFrom' => $dateFrom,
            'dateTo' => $dateTo,
            'zeroCounts' => $request->query('zeroCounts') === 'Adjust' ? 'Adjust' : 'Leave',
            'q' => trim((string) $request->query('q', '')),
            'showSystemQuantity' => filter_var($request->query('showSystemQuantity', true), FILTER_VALIDATE_BOOLEAN),
        ];
    }

    private function rows(array $filters, int $limit)
    {
        return $this->baseQuery($filters)
            ->orderBy('loc.locationname')
            ->orderBy('sm.stockid')
            ->limit($limit)
            ->get()
            ->map(function ($row) use ($filters) {
                $row->zero_counts = $filters['zeroCounts'];
                return $this->rowPayload($row);
            })
            ->filter(fn ($row) => $filters['status'] === 'All' || $row['status'] === $filters['status'])
            ->values();
    }

    private function baseQuery(array $filters)
    {
        $counts = DB::table('stockcounts')
            ->select('stockid', 'loccode')
            ->selectRaw('SUM(qtycounted) as qty_counted')
            ->selectRaw('COUNT(*) as count_lines')
            ->selectRaw('MAX(reference) as last_reference')
            ->groupBy('stockid', 'loccode');

        $query = DB::table('stockcheckfreeze as scf')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'scf.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'scf.loccode')
            ->leftJoin('locstock as ls', function ($join) {
                $join->on('ls.stockid', '=', 'scf.stockid')
                    ->on('ls.loccode', '=', 'scf.loccode');
            })
            ->leftJoinSub($counts, 'counts', function ($join) {
                $join->on('counts.stockid', '=', 'scf.stockid')
                    ->on('counts.loccode', '=', 'scf.loccode');
            })
            ->select(
                'scf.stockid',
                'scf.loccode',
                'scf.qoh',
                'scf.stockcheckdate',
                'sm.description',
                'sm.longdescription',
                'sm.units',
                'sm.categoryid',
                'sm.decimalplaces',
                DB::raw('COALESCE(ls.bin, "") as bin'),
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), scf.loccode) as location_name'),
                DB::raw('COALESCE(counts.qty_counted, 0) as qty_counted'),
                DB::raw('COALESCE(counts.count_lines, 0) as count_lines'),
                DB::raw('COALESCE(counts.last_reference, "") as last_reference')
            )
            ->where('scf.stockcheckdate', '>=', $filters['dateFrom'])
            ->where('scf.stockcheckdate', '<=', $filters['dateTo']);

        if (Schema::hasTable('stockcategory')) {
            $query
                ->leftJoin('stockcategory as scat', 'scat.categoryid', '=', 'sm.categoryid')
                ->addSelect(DB::raw('COALESCE(NULLIF(scat.categorydescription, ""), sm.categoryid) as category_name'));
        } else {
            $query->addSelect(DB::raw('sm.categoryid as category_name'));
        }

        if ($filters['location'] !== 'All') {
            $query->where('scf.loccode', $filters['location']);
        }
        if ($filters['category'] !== 'All') {
            $query->where('sm.categoryid', $filters['category']);
        }
        if ($filters['q'] !== '') {
            $search = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $filters['q']) . '%';
            $query->where(function ($inner) use ($search) {
                $inner->where('scf.stockid', 'like', $search)
                    ->orWhere('sm.description', 'like', $search)
                    ->orWhere('sm.longdescription', 'like', $search)
                    ->orWhere('loc.locationname', 'like', $search)
                    ->orWhere('sm.categoryid', 'like', $search);
            });
        }

        return $query;
    }

    private function rowPayload(object $row): array
    {
        $frozen = (float) $row->qoh;
        $counted = (float) $row->qty_counted;
        $countLines = (int) $row->count_lines;
        $zeroCountsAdjust = ($row->zero_counts ?? 'Leave') === 'Adjust';
        $variance = $countLines > 0 ? $counted - $frozen : ($zeroCountsAdjust ? -$frozen : 0.0);
        $status = $countLines === 0 ? 'Not counted' : (abs($variance) < 0.000001 ? 'Matched' : 'Variance');
        if ($countLines === 0 && $zeroCountsAdjust && abs($variance) >= 0.000001) {
            $status = 'Variance';
        }

        return [
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'location' => (string) $row->loccode,
            'locationName' => html_entity_decode((string) $row->location_name),
            'category' => (string) $row->categoryid,
            'categoryName' => html_entity_decode((string) ($row->category_name ?: $row->categoryid)),
            'units' => (string) ($row->units ?: 'each'),
            'decimalPlaces' => (int) ($row->decimalplaces ?? 0),
            'bin' => (string) ($row->bin ?? ''),
            'frozenQuantity' => $frozen,
            'countedQuantity' => $countLines > 0 ? $counted : ($zeroCountsAdjust ? 0.0 : null),
            'variance' => $variance,
            'countLines' => $countLines,
            'lastReference' => (string) ($row->last_reference ?? ''),
            'stockCheckDate' => substr((string) $row->stockcheckdate, 0, 10),
            'status' => $status,
        ];
    }

    private function summary(array $filters): array
    {
        $rows = $this->baseQuery($filters)->get()->map(function ($row) use ($filters) {
            $row->zero_counts = $filters['zeroCounts'];
            return $this->rowPayload($row);
        });
        if ($filters['status'] !== 'All') {
            $rows = $rows->filter(fn ($row) => $row['status'] === $filters['status']);
        }

        return [
            'sheetItems' => $rows->count(),
            'countedItems' => $rows->where('countLines', '>', 0)->count(),
            'notCountedItems' => $rows->where('status', 'Not counted')->count(),
            'varianceItems' => $rows->where('status', 'Variance')->count(),
            'varianceUnits' => round((float) $rows->sum(fn ($row) => abs((float) $row['variance'])), 4),
            'locations' => $rows->pluck('location')->unique()->count(),
            'latestSheetDate' => $rows->max('stockCheckDate'),
        ];
    }

    private function locations()
    {
        return DB::table('locations')->select('loccode', 'locationname')->orderBy('locationname')->get()
            ->map(fn ($row) => [
                'value' => (string) $row->loccode,
                'label' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
                'code' => (string) $row->loccode,
            ])->values();
    }

    private function categories()
    {
        $query = DB::table('stockmaster as sm')
            ->where(function ($inner) {
                $inner->whereNull('sm.discontinued')->orWhere('sm.discontinued', 0);
            })
            ->whereNotIn('sm.mbflag', ['D', 'A', 'K'])
            ->select('sm.categoryid')
            ->distinct()
            ->orderBy('sm.categoryid');

        if (Schema::hasTable('stockcategory')) {
            $query->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
                ->addSelect(DB::raw('COALESCE(NULLIF(sc.categorydescription, ""), sm.categoryid) as category_name'));
        } else {
            $query->addSelect(DB::raw('sm.categoryid as category_name'));
        }

        return $query->get()->map(fn ($row) => [
            'value' => (string) $row->categoryid,
            'label' => html_entity_decode((string) ($row->category_name ?: $row->categoryid)),
        ])->values();
    }

    private function pdfHtml($rows, array $filters, string $type): string
    {
        $company = $this->companyProfile();
        $title = $type === 'comparison' ? 'Stock Check Comparison' : 'Stock Check Sheets';
        $showExpected = $type === 'comparison' || $filters['showSystemQuantity'];
        $countLines = $type === 'comparison' ? $this->countLinesForRows($rows) : collect();
        $bodyRows = $type === 'comparison'
            ? $this->comparisonPdfRows($rows, $countLines, $filters)
            : $rows->map(function ($row) use ($showExpected, $type) {
                $counted = $row['countedQuantity'] === null ? '' : $this->quantity($row['countedQuantity'], $row['decimalPlaces']);
                $variance = $row['countedQuantity'] === null ? '' : $this->quantity($row['variance'], $row['decimalPlaces']);
                return '<tr>'
                    . '<td>' . e($row['stockId']) . '</td>'
                    . '<td>' . e($row['description']) . '</td>'
                    . '<td>' . e($row['locationName']) . '</td>'
                    . '<td>' . e($row['categoryName']) . '</td>'
                    . ($showExpected ? '<td class="num">' . e($this->quantity($row['frozenQuantity'], $row['decimalPlaces'])) . '</td>' : '')
                    . '<td class="num">' . e($counted) . '</td>'
                    . ($type === 'comparison' ? '<td class="num">' . e($variance) . '</td><td>' . e($row['status']) . '</td>' : '<td class="blank"></td><td class="blank"></td>')
                    . '<td>' . e($row['units']) . '</td>'
                    . '</tr>';
            })->implode('');

        $address = implode('<br>', array_map('e', $company['address']));
        $heading = $type === 'comparison'
            ? '<th style="width: 86px;">Item</th><th>Description</th><th style="width: 76px;">Bin</th><th style="width: 82px;">Expected</th><th style="width: 82px;">Counted</th><th style="width: 104px;">Reference</th><th style="width: 82px;">Total</th><th style="width: 82px;">Variance</th><th style="width: 86px;">Status</th>'
            : '<th>Item</th><th>Description</th><th>Location</th><th>Category</th>' . ($showExpected ? '<th>Expected</th>' : '') . '<th>Counted</th><th>Counter</th><th>Checked by</th><th>Unit</th>';

        return '<!doctype html><html><head><meta charset="utf-8"><style>
            @page { margin: 24px; }
            body { font-family: DejaVu Sans, sans-serif; color: #211019; font-size: 11.5px; }
            .header { border-bottom: 3px solid #e11d75; padding-bottom: 14px; margin-bottom: 18px; display: table; width: 100%; }
            .brand, .meta { display: table-cell; vertical-align: top; }
            .brand img { width: 58px; height: auto; margin-right: 12px; vertical-align: middle; }
            .brand h1 { margin: 0; font-size: 19px; letter-spacing: .5px; }
            .brand p { margin: 6px 0 0; color: #7f6373; line-height: 1.45; }
            .meta { text-align: right; color: #7f6373; line-height: 1.6; }
            h2 { margin: 0 0 8px; color: #26394d; font-size: 22px; }
            .filters { margin-bottom: 14px; padding: 10px 12px; border: 1px solid #efd8e3; background: #fff7fb; border-radius: 8px; color: #6f5363; }
            table { border-collapse: collapse; width: 100%; }
            th { background: #f9e9f1; color: #4a3440; font-size: 10px; text-align: left; padding: 7px 6px; border: 1px solid #ead7e0; text-transform: uppercase; }
            td { padding: 7px 6px; border: 1px solid #ead7e0; vertical-align: top; }
            tr:nth-child(even) td { background: #fff9fc; }
            .num { text-align: right; white-space: nowrap; }
            .blank { height: 24px; }
            .section td { background: #26394d !important; border-color: #26394d; color: #fff; font-size: 12px; font-weight: 700; }
            .category td { background: #fff4f8 !important; color: #4a3440; font-weight: 700; }
            .total td { background: #f8edf3 !important; font-weight: 700; }
            .muted { color: #7f6373; }
            .variance { color: #9a3412; font-weight: 700; }
            .matched { color: #047857; font-weight: 700; }
            .signatures { margin-top: 28px; display: table; width: 100%; }
            .sig { display: table-cell; width: 33%; padding-right: 18px; color: #7f6373; text-transform: uppercase; font-size: 10px; }
            .line { border-top: 1px solid #7f6373; padding-top: 8px; }
        </style></head><body>'
            . '<div class="header"><div class="brand">' . $this->logoImg() . '<h1>' . e($company['name']) . '</h1><p>' . $address . '</p></div>'
            . '<div class="meta">Printed ' . e(now()->format('d M Y, H:i')) . '<br>Location: ' . e($filters['location']) . '<br>Category: ' . e($filters['category']) . '</div></div>'
            . '<h2>' . e($title) . '</h2>'
            . '<div class="filters">Sheet dates ' . e($filters['dateFrom']) . ' to ' . e($filters['dateTo']) . ' · ' . e($rows->count()) . ' item lines · zero counts: ' . e($filters['zeroCounts'] === 'Adjust' ? 'treat as zero' : 'leave unchanged') . '</div>'
            . '<table><thead><tr>' . $heading . '</tr></thead><tbody>'
            . $bodyRows . '</tbody></table>'
            . '<div class="signatures"><div class="sig"><div class="line">Prepared by</div></div><div class="sig"><div class="line">Counted by</div></div><div class="sig"><div class="line">Checked by</div></div></div>'
            . '</body></html>';
    }

    private function comparisonPdfRows($rows, $countLines, array $filters): string
    {
        $html = '';
        $currentLocation = '';
        $currentCategory = '';

        foreach ($rows as $row) {
            $key = $row['location'] . '|' . $row['stockId'];
            $counts = $countLines->get($key, collect());

            if ((float) $row['frozenQuantity'] == 0.0 && $counts->isEmpty()) {
                continue;
            }

            if ($currentLocation !== $row['location']) {
                $currentLocation = $row['location'];
                $currentCategory = '';
                $html .= '<tr class="section"><td colspan="9">' . e($row['location'] . ' - ' . $row['locationName']) . '</td></tr>';
            }

            if ($currentCategory !== $row['category']) {
                $currentCategory = $row['category'];
                $html .= '<tr class="category"><td colspan="9">' . e($row['category'] . ' - ' . $row['categoryName']) . '</td></tr>';
            }

            if ($counts->isEmpty()) {
                $variance = $filters['zeroCounts'] === 'Adjust' ? $this->quantity(-$row['frozenQuantity'], $row['decimalPlaces']) : '';
                $counted = $filters['zeroCounts'] === 'Adjust' ? $this->quantity(0, $row['decimalPlaces']) : 'No counts entered';
                $status = $filters['zeroCounts'] === 'Adjust' && abs((float) $row['frozenQuantity']) > 0.000001 ? 'Variance' : 'Not counted';
                $html .= '<tr>'
                    . '<td>' . e($row['stockId']) . '</td>'
                    . '<td>' . e($row['description']) . '</td>'
                    . '<td>' . e($row['bin']) . '</td>'
                    . '<td class="num">' . e($this->quantity($row['frozenQuantity'], $row['decimalPlaces'])) . '</td>'
                    . '<td class="' . ($filters['zeroCounts'] === 'Adjust' ? 'num' : 'muted') . '">' . e($counted) . '</td>'
                    . '<td></td><td></td>'
                    . '<td class="num variance">' . e($variance) . '</td>'
                    . '<td>' . e($status) . '</td>'
                    . '</tr>';
                continue;
            }

            $first = true;
            foreach ($counts as $count) {
                $html .= '<tr>'
                    . '<td>' . ($first ? e($row['stockId']) : '') . '</td>'
                    . '<td>' . ($first ? e($row['description']) : '') . '</td>'
                    . '<td>' . ($first ? e($row['bin']) : '') . '</td>'
                    . '<td class="num">' . ($first ? e($this->quantity($row['frozenQuantity'], $row['decimalPlaces'])) : '') . '</td>'
                    . '<td class="num">' . e($this->quantity($count->qtycounted, $row['decimalPlaces'])) . '</td>'
                    . '<td>' . e((string) $count->reference) . '</td>'
                    . '<td></td><td></td><td></td>'
                    . '</tr>';
                $first = false;
            }

            $statusClass = $row['status'] === 'Matched' ? 'matched' : ($row['status'] === 'Variance' ? 'variance' : '');
            $html .= '<tr class="total">'
                . '<td colspan="4" class="num">Total for ' . e($row['stockId']) . '</td>'
                . '<td></td><td></td>'
                . '<td class="num">' . e($this->quantity($row['countedQuantity'] ?? 0, $row['decimalPlaces'])) . '</td>'
                . '<td class="num ' . $statusClass . '">' . e($this->quantity($row['variance'], $row['decimalPlaces'])) . '</td>'
                . '<td class="' . $statusClass . '">' . e($row['status']) . '</td>'
                . '</tr>';
        }

        return $html === '' ? '<tr><td colspan="9" class="muted">No comparison rows found for the selected filters.</td></tr>' : $html;
    }

    private function countLinesForRows($rows)
    {
        if ($rows->isEmpty()) {
            return collect();
        }

        $stockIds = $rows->pluck('stockId')->unique()->values()->all();
        $locations = $rows->pluck('location')->unique()->values()->all();

        return DB::table('stockcounts')
            ->select('stockid', 'loccode', 'qtycounted', 'reference')
            ->whereIn('stockid', $stockIds)
            ->whereIn('loccode', $locations)
            ->orderBy('stockid')
            ->orderBy('id')
            ->get()
            ->groupBy(fn ($row) => (string) $row->loccode . '|' . (string) $row->stockid);
    }

    private function quantity($value, int $decimals): string
    {
        return number_format((float) $value, max(0, min(4, $decimals)));
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
                (string) ($company->telephone ?? ''),
                (string) ($company->email ?? ''),
            ])),
        ];
    }

    private function logoImg(): string
    {
        $path = public_path('images/logo.png');
        if (!is_file($path)) {
            $path = dirname(__DIR__, 4) . '/src/assets/images/zesha.png';
        }
        if (!is_file($path)) {
            return '';
        }
        $data = base64_encode((string) file_get_contents($path));
        return '<img src="data:image/png;base64,' . $data . '" alt="">';
    }

    private function locationExists(string $location): bool
    {
        return DB::table('locations')->where('loccode', $location)->exists();
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

    private function validationError(string $message)
    {
        return response()->json(['success' => false, 'message' => $message], 422);
    }
}
