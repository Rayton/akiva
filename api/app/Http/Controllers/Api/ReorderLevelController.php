<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReorderLevelController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => [],
                    'categories' => [],
                    'rows' => [],
                    'summary' => $this->summary(collect()),
                    'currency' => 'TZS',
                ],
            ]);
        }

        try {
            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => $this->locations(),
                    'categories' => $this->categories(),
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
                'message' => 'Reorder levels could not be loaded.',
            ], 500);
        }
    }

    public function exportPdf(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Reorder levels are not available.',
            ], 503);
        }

        try {
            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            if ($rows->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no reorder level lines to export for the selected filters.',
                ], 422);
            }

            return response($this->pdf($rows, $this->context($filters, $rows)), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . $this->filename('pdf') . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Reorder level PDF could not be created.',
            ], 500);
        }
    }

    public function exportExcel(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Reorder levels are not available.',
            ], 503);
        }

        try {
            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            if ($rows->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no reorder level lines to export for the selected filters.',
                ], 422);
            }

            return response($this->xlsx($rows, $this->context($filters, $rows)), 200, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition' => 'attachment; filename="' . $this->filename('xlsx') . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Reorder level Excel file could not be created.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('locstock')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locations')
            && Schema::hasTable('stockcategory');
    }

    private function filters(Request $request): array
    {
        $location = strtoupper(trim((string) $request->query('location', 'All')));
        $category = trim((string) $request->query('category', 'All'));
        $status = trim((string) $request->query('status', 'Needs order'));
        $search = trim((string) $request->query('q', ''));

        if (!in_array($status, ['All below reorder', 'Needs order', 'Covered by open PO', 'Can transfer'], true)) {
            $status = 'Needs order';
        }

        return [
            'location' => $location === '' || $location === 'ALL' ? 'All' : $location,
            'category' => $category === '' ? 'All' : $category,
            'status' => $status,
            'search' => $search,
        ];
    }

    private function rows(array $filters)
    {
        $onOrder = $this->onOrderSubquery();
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->join('locations as loc', 'loc.loccode', '=', 'ls.loccode')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->leftJoinSub($onOrder, 'po', function ($join) {
                $join->on('po.stockid', '=', 'ls.stockid')
                    ->on('po.loccode', '=', 'ls.loccode');
            })
            ->select(
                'ls.stockid',
                'ls.loccode',
                'ls.quantity',
                'ls.reorderlevel',
                'ls.bin',
                'sm.description',
                'sm.longdescription',
                'sm.categoryid',
                'sm.decimalplaces',
                'sm.units',
                'sm.materialcost',
                'sm.mbflag',
                'sc.categorydescription',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), ls.loccode) as location_name'),
                DB::raw('COALESCE(po.on_order, 0) as on_order')
            )
            ->whereColumn('ls.quantity', '<', 'ls.reorderlevel')
            ->where('ls.reorderlevel', '>', 0)
            ->whereIn('sm.mbflag', ['B', 'M'])
            ->where(function ($inner) {
                $inner->whereNull('sm.discontinued')
                    ->orWhere('sm.discontinued', 0);
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
                $inner->where('ls.stockid', 'like', $search)
                    ->orWhere('sm.description', 'like', $search)
                    ->orWhere('sm.longdescription', 'like', $search)
                    ->orWhere('sc.categorydescription', 'like', $search)
                    ->orWhere('ls.loccode', 'like', $search)
                    ->orWhere('loc.locationname', 'like', $search)
                    ->orWhere('ls.bin', 'like', $search);
            });
        }

        $rows = $query
            ->orderBy('loc.locationname')
            ->orderBy('ls.stockid')
            ->limit(1200)
            ->get();

        $alternateStock = $this->alternateStock($rows->pluck('stockid')->map(fn ($value) => (string) $value)->unique()->values()->all());

        return $rows
            ->map(fn ($row) => $this->mapRow($row, $alternateStock))
            ->filter(function ($row) use ($filters) {
                if ($filters['status'] === 'All below reorder') return true;
                if ($filters['status'] === 'Covered by open PO') return (float) $row['suggestedOrder'] <= 0.0 && (float) $row['onOrder'] > 0.0;
                if ($filters['status'] === 'Can transfer') return (float) $row['transferAvailable'] > 0.0;
                return (float) $row['suggestedOrder'] > 0.0;
            })
            ->sortBy([
                ['priority', 'asc'],
                ['locationName', 'asc'],
                ['stockId', 'asc'],
            ])
            ->values();
    }

    private function onOrderSubquery()
    {
        if (!Schema::hasTable('purchorders') || !Schema::hasTable('purchorderdetails')) {
            return DB::query()
                ->fromRaw('(select "" as stockid, "" as loccode, 0 as on_order) as empty_po')
                ->whereRaw('1 = 0');
        }

        return DB::table('purchorders as po')
            ->join('purchorderdetails as pod', 'pod.orderno', '=', 'po.orderno')
            ->select(
                'pod.itemcode as stockid',
                'po.intostocklocation as loccode',
                DB::raw('SUM(GREATEST(pod.quantityord - pod.quantityrecd, 0)) as on_order')
            )
            ->whereNotIn('po.status', ['Cancelled', 'Rejected', 'Pending', 'Completed'])
            ->groupBy('pod.itemcode', 'po.intostocklocation');
    }

    private function alternateStock(array $stockIds): array
    {
        if (count($stockIds) === 0) {
            return [];
        }

        $rows = DB::table('locstock as ls')
            ->join('locations as loc', 'loc.loccode', '=', 'ls.loccode')
            ->select(
                'ls.stockid',
                'ls.loccode',
                'ls.quantity',
                'ls.reorderlevel',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), ls.loccode) as location_name')
            )
            ->whereIn('ls.stockid', $stockIds)
            ->where('ls.quantity', '>', 0)
            ->whereRaw('(ls.quantity - ls.reorderlevel) > 0')
            ->orderByDesc(DB::raw('(ls.quantity - ls.reorderlevel)'))
            ->get();

        $available = [];
        foreach ($rows as $row) {
            $available[(string) $row->stockid][] = [
                'location' => (string) $row->loccode,
                'locationName' => html_entity_decode((string) $row->location_name),
                'available' => max(0.0, (float) $row->quantity - (float) $row->reorderlevel),
            ];
        }

        return $available;
    }

    private function mapRow($row, array $alternateStock): array
    {
        $decimalPlaces = (int) ($row->decimalplaces ?? 0);
        $onHand = (float) $row->quantity;
        $reorder = (float) $row->reorderlevel;
        $onOrder = (float) $row->on_order;
        $shortage = max(0.0, $reorder - $onHand);
        $suggestedOrder = max(0.0, $reorder - $onHand - $onOrder);
        $unitCost = (float) ($row->materialcost ?? 0);
        $alternates = collect($alternateStock[(string) $row->stockid] ?? [])
            ->filter(fn ($alternate) => (string) $alternate['location'] !== (string) $row->loccode)
            ->values();
        $transferAvailable = (float) $alternates->sum('available');
        $bestTransfer = $alternates->first();

        return [
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
            'category' => (string) ($row->categoryid ?? ''),
            'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid ?: '')),
            'location' => (string) $row->loccode,
            'locationName' => html_entity_decode((string) $row->location_name),
            'bin' => (string) ($row->bin ?? ''),
            'onHand' => round($onHand, $decimalPlaces),
            'reorderLevel' => round($reorder, $decimalPlaces),
            'shortage' => round($shortage, $decimalPlaces),
            'onOrder' => round($onOrder, $decimalPlaces),
            'suggestedOrder' => round($suggestedOrder, $decimalPlaces),
            'transferAvailable' => round($transferAvailable, $decimalPlaces),
            'bestTransferLocation' => $bestTransfer ? (string) $bestTransfer['locationName'] : '',
            'unitCost' => $unitCost,
            'suggestedValue' => round($suggestedOrder * $unitCost, 2),
            'units' => (string) ($row->units ?: ''),
            'decimalPlaces' => $decimalPlaces,
            'status' => $suggestedOrder <= 0.0 && $onOrder > 0.0 ? 'Covered by open PO' : ($transferAvailable > 0.0 ? 'Can transfer' : 'Needs order'),
            'priority' => $suggestedOrder > 0.0 ? 1 : ($transferAvailable > 0.0 ? 2 : 3),
        ];
    }

    private function summary($rows): array
    {
        return [
            'lines' => $rows->count(),
            'items' => $rows->pluck('stockId')->unique()->count(),
            'locations' => $rows->pluck('location')->unique()->count(),
            'needOrder' => $rows->filter(fn ($row) => (float) $row['suggestedOrder'] > 0.0)->count(),
            'coveredByPo' => $rows->filter(fn ($row) => (float) $row['suggestedOrder'] <= 0.0 && (float) $row['onOrder'] > 0.0)->count(),
            'canTransfer' => $rows->filter(fn ($row) => (float) $row['transferAvailable'] > 0.0)->count(),
            'suggestedValue' => round((float) $rows->sum('suggestedValue'), 2),
        ];
    }

    private function context(array $filters, $rows): array
    {
        return [
            'filters' => $filters,
            'company' => $this->companyProfile(),
            'location' => $filters['location'] === 'All' ? 'All locations' : $this->locationName($filters['location']),
            'category' => $filters['category'] === 'All' ? 'All categories' : $this->categoryName($filters['category']),
            'summary' => $this->summary($rows),
            'currency' => $this->currency(),
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
            ])
            ->values();
    }

    private function categories()
    {
        return DB::table('stockcategory')
            ->select('categoryid', 'categorydescription')
            ->where(function ($query) {
                $query->whereNull('stocktype')
                    ->orWhere('stocktype', '<>', 'A');
            })
            ->orderBy('categorydescription')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->categoryid,
                'label' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
                'code' => (string) $row->categoryid,
            ])
            ->values();
    }

    private function locationName(string $location): string
    {
        return html_entity_decode((string) (DB::table('locations')->where('loccode', $location)->value('locationname') ?: $location));
    }

    private function categoryName(string $category): string
    {
        return html_entity_decode((string) (DB::table('stockcategory')->where('categoryid', $category)->value('categorydescription') ?: $category));
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
            'address' => array_values(array_filter([
                (string) ($company->regoffice1 ?? ''),
                (string) ($company->regoffice2 ?? ''),
                (string) ($company->regoffice3 ?? ''),
                (string) ($company->regoffice4 ?? ''),
            ])),
        ];
    }

    private function pdf($rows, array $context): string
    {
        $width = 841.89;
        $height = 595.28;
        $margin = 24.0;
        $rowHeight = 16.0;
        $chunks = $rows->chunk(24)->values();
        $pageCount = max(1, $chunks->count());
        $pages = [];

        foreach ($chunks as $pageIndex => $chunk) {
            $content = '';
            $content .= $this->pdfRect($margin, 510, $width - ($margin * 2), 58, '0.999 0.973 0.984', '0.918 0.859 0.890');
            $content .= $this->pdfText($context['company']['name'], 34, 548, 18, true, '0.129 0.063 0.098');
            $addressY = 532;
            foreach (array_slice($context['company']['address'], 0, 3) as $line) {
                $content .= $this->pdfText($line, 34, $addressY, 9, false, '0.373 0.282 0.341');
                $addressY -= 11;
            }
            $content .= $this->pdfText('Reorder Level Report', 590, 548, 19, true, '0.149 0.212 0.290');
            $content .= $this->pdfText('Printed ' . Carbon::now()->format('d M Y, H:i'), 590, 532, 9, false, '0.373 0.282 0.341');
            $content .= $this->pdfText('Page ' . ($pageIndex + 1) . ' of ' . $pageCount, 590, 520, 9, false, '0.373 0.282 0.341');

            $meta = [
                ['Location', $context['location']],
                ['Category', $context['category']],
                ['Status', $context['filters']['status']],
                ['Lines', (string) $context['summary']['lines']],
                ['Suggested value', $this->money((float) $context['summary']['suggestedValue'], $context['currency'])],
            ];
            $metaX = $margin;
            $metaY = 468;
            $metaWidth = ($width - ($margin * 2)) / count($meta);
            foreach ($meta as [$label, $value]) {
                $content .= $this->pdfRect($metaX, $metaY, $metaWidth, 34, '1 1 1', '0.918 0.859 0.890');
                $content .= $this->pdfText($label, $metaX + 6, $metaY + 20, 8, true, '0.373 0.282 0.341');
                $content .= $this->pdfText($this->fitText((string) $value, 25), $metaX + 6, $metaY + 8, 9.5, true, '0.129 0.063 0.098');
                $metaX += $metaWidth;
            }

            $columns = [
                ['Part number', 78],
                ['Description', 162],
                ['Location', 110],
                ['On hand', 62],
                ['Reorder', 62],
                ['On order', 62],
                ['Suggested', 68],
                ['Can transfer', 78],
                ['Value', 70],
                ['Status', 101],
            ];
            $x = $margin;
            $y = 434;
            foreach ($columns as [$heading, $columnWidth]) {
                $content .= $this->pdfRect($x, $y, $columnWidth, 20, '0.973 0.929 0.953', '0.918 0.859 0.890');
                $content .= $this->pdfText($heading, $x + 4, $y + 7, 8.2, true, '0.294 0.204 0.259');
                $x += $columnWidth;
            }

            $y = 416;
            foreach ($chunk as $index => $row) {
                $fill = $index % 2 === 0 ? '1 1 1' : '0.999 0.973 0.984';
                $x = $margin;
                $cells = [
                    [$row['stockId'], 78, 'left', 13],
                    [$row['description'], 162, 'left', 30],
                    [$row['locationName'], 110, 'left', 20],
                    [$this->number($row['onHand'], $row['decimalPlaces']), 62, 'right', 10],
                    [$this->number($row['reorderLevel'], $row['decimalPlaces']), 62, 'right', 10],
                    [$this->number($row['onOrder'], $row['decimalPlaces']), 62, 'right', 10],
                    [$this->number($row['suggestedOrder'], $row['decimalPlaces']), 68, 'right', 10],
                    [$this->number($row['transferAvailable'], $row['decimalPlaces']), 78, 'right', 10],
                    [$this->money($row['suggestedValue'], $context['currency']), 70, 'right', 12],
                    [$row['status'], 101, 'left', 18],
                ];

                foreach ($cells as [$value, $columnWidth, $align, $chars]) {
                    $content .= $this->pdfRect($x, $y, $columnWidth, $rowHeight, $fill, '0.918 0.859 0.890');
                    $text = $this->fitText((string) $value, $chars);
                    $textX = $align === 'right' ? $x + $columnWidth - 5 - $this->pdfTextWidth($text, 8.6) : $x + 4;
                    $content .= $this->pdfText($text, max($x + 4, $textX), $y + 5, 8.6, true, '0.129 0.063 0.098');
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
            [['value' => 'Reorder Level Report', 'style' => 1]],
            [['value' => 'Printed ' . Carbon::now()->format('d M Y, H:i')]],
            [],
            [['value' => 'Location', 'style' => 2], ['value' => $context['location']], ['value' => 'Category', 'style' => 2], ['value' => $context['category']]],
            [['value' => 'Status', 'style' => 2], ['value' => $context['filters']['status']], ['value' => 'Suggested value', 'style' => 2], ['value' => $context['summary']['suggestedValue'], 'type' => 'number']],
            [],
            array_map(fn ($value) => ['value' => $value, 'style' => 2], [
                'Part Number',
                'Description',
                'Category',
                'Location',
                'Bin',
                'On Hand',
                'Reorder Level',
                'Shortage',
                'On Order',
                'Suggested Order',
                'Transfer Available',
                'Best Transfer Location',
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
                ['value' => $row['locationName']],
                ['value' => $row['bin']],
                ['value' => $row['onHand'], 'type' => 'number'],
                ['value' => $row['reorderLevel'], 'type' => 'number'],
                ['value' => $row['shortage'], 'type' => 'number'],
                ['value' => $row['onOrder'], 'type' => 'number'],
                ['value' => $row['suggestedOrder'], 'type' => 'number'],
                ['value' => $row['transferAvailable'], 'type' => 'number'],
                ['value' => $row['bestTransferLocation']],
                ['value' => $row['unitCost'], 'type' => 'number'],
                ['value' => $row['suggestedValue'], 'type' => 'number'],
                ['value' => $row['status']],
            ];
        }

        return $this->zipArchive([
            '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
            '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
            'xl/workbook.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Reorder Levels" sheetId="1" r:id="rId1"/></sheets></workbook>',
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

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="3" width="30" customWidth="1"/><col min="4" max="5" width="18" customWidth="1"/><col min="6" max="11" width="16" customWidth="1"/><col min="12" max="12" width="24" customWidth="1"/><col min="13" max="15" width="16" customWidth="1"/></cols><sheetData>' . $sheetRows . '</sheetData><autoFilter ref="A8:O' . max(8, count($rows)) . '"/></worksheet>';
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
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF7B6170"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8EDF3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFEADBE3"/></left><right style="thin"><color rgb="FFEADBE3"/></right><top style="thin"><color rgb="FFEADBE3"/></top><bottom style="thin"><color rgb="FFEADBE3"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
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
        $text = $converted === false ? $text : $converted;
        return str_replace(['\\', '(', ')', "\r", "\n"], ['\\\\', '\\(', '\\)', ' ', ' '], (string) $text);
    }

    private function pdfTextWidth(string $text, float $size): float
    {
        $converted = iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $text);
        $text = $converted === false ? $text : $converted;
        return strlen((string) $text) * $size * 0.48;
    }

    private function fitText(string $text, int $chars): string
    {
        $text = trim(preg_replace('/\s+/', ' ', html_entity_decode($text, ENT_QUOTES, 'UTF-8')) ?? '');
        if (mb_strlen($text) <= $chars) return $text;
        return rtrim(mb_substr($text, 0, max(1, $chars - 3))) . '...';
    }

    private function number(float $value, int $decimalPlaces): string
    {
        return number_format($value, max(0, $decimalPlaces));
    }

    private function money(float $value, string $currency): string
    {
        return $currency . ' ' . number_format($value, 2);
    }

    private function filename(string $extension): string
    {
        return 'reorder-level-report-' . Carbon::now()->format('Y-m-d') . '.' . $extension;
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
