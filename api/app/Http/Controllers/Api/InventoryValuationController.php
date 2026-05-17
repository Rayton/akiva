<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use ZipArchive;

class InventoryValuationController extends Controller
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
                    'filters' => $filters,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Inventory valuation could not be loaded.',
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
                'message' => 'Inventory valuation is not available.',
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
                    'message' => 'There are no inventory valuation rows to export for the selected filters.',
                ], 422);
            }

            $context = $this->context($filters, $rows);

            if ($format === 'pdf') {
                return response($this->nativePdf($rows, $context), 200, [
                    'Content-Type' => 'application/pdf',
                    'Content-Disposition' => 'inline; filename="' . $this->exportFilename('pdf') . '"',
                    'Cache-Control' => 'private, max-age=0, must-revalidate',
                    'Pragma' => 'public',
                ]);
            }

            return response($this->xlsx($rows, $context), 200, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition' => 'attachment; filename="' . $this->exportFilename('xlsx') . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => $format === 'pdf' ? 'Inventory valuation PDF could not be created.' : 'Inventory valuation Excel file could not be created.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('locstock')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('stockcategory')
            && Schema::hasTable('locations');
    }

    private function emptyPayload(): array
    {
        return [
            'locations' => [],
            'categories' => [],
            'rows' => [],
            'summary' => $this->summary(collect()),
            'currency' => $this->currency(),
            'filters' => [],
        ];
    }

    private function filters(Request $request): array
    {
        $dateFrom = $this->validDate((string) $request->query('dateFrom', ''), Carbon::today()->subMonths(2)->startOfMonth()->toDateString());
        $dateTo = $this->validDate((string) $request->query('dateTo', ''), Carbon::today()->toDateString());
        if ($dateFrom > $dateTo) {
            [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
        }

        $category = trim((string) $request->query('category', 'All'));
        $location = strtoupper(trim((string) $request->query('location', 'All')));
        $costStatus = trim((string) $request->query('costStatus', 'all'));
        $view = trim((string) $request->query('view', 'detail'));

        return [
            'category' => $category === '' ? 'All' : $category,
            'location' => $location === '' || $location === 'ALL' ? 'All' : $location,
            'costStatus' => in_array($costStatus, ['all', 'positive', 'zero', 'negative'], true) ? $costStatus : 'all',
            'view' => $view === 'summary' ? 'summary' : 'detail',
            'dateFrom' => $dateFrom,
            'dateTo' => $dateTo,
            'search' => trim((string) $request->query('q', '')),
        ];
    }

    private function rows(array $filters)
    {
        $movement = $this->movementSubquery($filters);
        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->join('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->join('locations as loc', 'loc.loccode', '=', 'ls.loccode')
            ->leftJoinSub($movement, 'movement', function ($join) {
                $join->on('movement.stockid', '=', 'ls.stockid')
                    ->on('movement.loccode', '=', 'ls.loccode');
            })
            ->whereIn('sm.mbflag', ['B', 'M'])
            ->where('ls.quantity', '<>', 0)
            ->where(function ($inner) {
                $inner->whereNull('sc.stocktype')->orWhere('sc.stocktype', '<>', 'A');
            });

        if ($filters['category'] !== 'All') {
            $query->where('sm.categoryid', $filters['category']);
        }

        if ($filters['location'] !== 'All') {
            $query->where('ls.loccode', $filters['location']);
        }

        if ($filters['search'] !== '') {
            $search = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $filters['search']) . '%';
            $query->where(function ($inner) use ($search) {
                $inner->where('sm.stockid', 'like', $search)
                    ->orWhere('sm.description', 'like', $search)
                    ->orWhere('sm.longdescription', 'like', $search)
                    ->orWhere('sc.categorydescription', 'like', $search)
                    ->orWhere('loc.locationname', 'like', $search);
            });
        }

        if ($filters['view'] === 'summary') {
            $query
                ->select(
                    'sm.categoryid',
                    'sc.categorydescription',
                    DB::raw('COUNT(DISTINCT sm.stockid) as item_count'),
                    DB::raw('COUNT(*) as line_count'),
                    DB::raw('SUM(ls.quantity) as qtyonhand'),
                    DB::raw('SUM(ls.quantity * (sm.materialcost + sm.labourcost + sm.overheadcost)) as itemtotal'),
                    DB::raw('SUM(COALESCE(movement.movement_in, 0)) as movement_in'),
                    DB::raw('SUM(COALESCE(movement.movement_out, 0)) as movement_out'),
                    DB::raw('SUM(COALESCE(movement.net_movement, 0)) as net_movement')
                )
                ->groupBy('sm.categoryid', 'sc.categorydescription');
        } else {
            $query
                ->select(
                    'sm.categoryid',
                    'sc.categorydescription',
                    'sm.stockid',
                    'sm.description',
                    'sm.longdescription',
                    'sm.decimalplaces',
                    'sm.units',
                    'ls.loccode',
                    'loc.locationname',
                    DB::raw('ls.quantity as qtyonhand'),
                    DB::raw('(sm.materialcost + sm.labourcost + sm.overheadcost) as unitcost'),
                    DB::raw('sm.materialcost as materialcost'),
                    DB::raw('sm.labourcost as labourcost'),
                    DB::raw('sm.overheadcost as overheadcost'),
                    DB::raw('(ls.quantity * (sm.materialcost + sm.labourcost + sm.overheadcost)) as itemtotal'),
                    DB::raw('COALESCE(movement.movement_in, 0) as movement_in'),
                    DB::raw('COALESCE(movement.movement_out, 0) as movement_out'),
                    DB::raw('COALESCE(movement.net_movement, 0) as net_movement')
                );
        }

        $query->orderBy('sc.categorydescription');
        if ($filters['view'] !== 'summary') {
            $query->orderBy('sm.stockid');
        }

        $rows = $query
            ->get()
            ->map(fn ($row) => $filters['view'] === 'summary' ? $this->mapSummaryRow($row) : $this->mapDetailRow($row));

        if ($filters['costStatus'] !== 'all') {
            $rows = $rows->filter(function ($row) use ($filters) {
                if ($filters['costStatus'] === 'positive') return (float) $row['value'] > 0;
                if ($filters['costStatus'] === 'zero') return (float) $row['unitCost'] == 0.0 || (float) $row['value'] == 0.0;
                return (float) $row['value'] < 0;
            });
        }

        return $rows->values();
    }

    private function movementSubquery(array $filters)
    {
        $query = DB::table('stockmoves')
            ->select(
                'stockid',
                'loccode',
                DB::raw('SUM(CASE WHEN qty > 0 THEN qty ELSE 0 END) as movement_in'),
                DB::raw('SUM(CASE WHEN qty < 0 THEN ABS(qty) ELSE 0 END) as movement_out'),
                DB::raw('SUM(qty) as net_movement')
            )
            ->where('trandate', '>=', $filters['dateFrom'] . ' 00:00:00')
            ->where('trandate', '<=', $filters['dateTo'] . ' 23:59:59');

        if ($filters['location'] !== 'All') {
            $query->where('loccode', $filters['location']);
        }

        return $query->groupBy('stockid', 'loccode');
    }

    private function mapDetailRow($row): array
    {
        $decimalPlaces = (int) ($row->decimalplaces ?? 0);
        $unitCost = (float) $row->unitcost;
        $quantity = (float) $row->qtyonhand;

        return [
            'rowType' => 'detail',
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
            'category' => (string) $row->categoryid,
            'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
            'location' => (string) $row->loccode,
            'locationName' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
            'quantity' => round($quantity, $decimalPlaces),
            'units' => (string) ($row->units ?: ''),
            'unitCost' => round($unitCost, 6),
            'materialCost' => round((float) $row->materialcost, 6),
            'labourCost' => round((float) $row->labourcost, 6),
            'overheadCost' => round((float) $row->overheadcost, 6),
            'value' => round((float) $row->itemtotal, 2),
            'movementIn' => round((float) $row->movement_in, $decimalPlaces),
            'movementOut' => round((float) $row->movement_out, $decimalPlaces),
            'netMovement' => round((float) $row->net_movement, $decimalPlaces),
            'decimalPlaces' => $decimalPlaces,
            'itemCount' => 1,
            'lineCount' => 1,
            'costStatus' => $unitCost == 0.0 ? 'No cost' : ($unitCost < 0 ? 'Negative cost' : 'Costed'),
        ];
    }

    private function mapSummaryRow($row): array
    {
        $quantity = (float) $row->qtyonhand;
        $value = (float) $row->itemtotal;
        $unitCost = $quantity == 0.0 ? 0.0 : $value / $quantity;

        return [
            'rowType' => 'summary',
            'stockId' => (string) $row->categoryid,
            'description' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
            'longDescription' => '',
            'category' => (string) $row->categoryid,
            'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
            'location' => 'All',
            'locationName' => 'Selected locations',
            'quantity' => round($quantity, 4),
            'units' => '',
            'unitCost' => round($unitCost, 6),
            'materialCost' => 0.0,
            'labourCost' => 0.0,
            'overheadCost' => 0.0,
            'value' => round($value, 2),
            'movementIn' => round((float) $row->movement_in, 4),
            'movementOut' => round((float) $row->movement_out, 4),
            'netMovement' => round((float) $row->net_movement, 4),
            'decimalPlaces' => 4,
            'itemCount' => (int) $row->item_count,
            'lineCount' => (int) $row->line_count,
            'costStatus' => $value == 0.0 ? 'No value' : ($value < 0 ? 'Negative value' : 'Valued'),
        ];
    }

    private function summary($rows): array
    {
        return [
            'lines' => $rows->sum('lineCount'),
            'items' => $rows->sum('itemCount'),
            'categories' => $rows->pluck('category')->unique()->count(),
            'quantity' => round((float) $rows->sum('quantity'), 4),
            'totalValue' => round((float) $rows->sum('value'), 2),
            'movementIn' => round((float) $rows->sum('movementIn'), 4),
            'movementOut' => round((float) $rows->sum('movementOut'), 4),
            'netMovement' => round((float) $rows->sum('netMovement'), 4),
            'zeroCostLines' => $rows->filter(fn ($row) => (float) $row['unitCost'] == 0.0 || (float) $row['value'] == 0.0)->count(),
            'negativeValueLines' => $rows->filter(fn ($row) => (float) $row['value'] < 0.0)->count(),
        ];
    }

    private function context(array $filters, $rows): array
    {
        return [
            'company' => $this->companyProfile(),
            'filters' => $filters,
            'summary' => $this->summary($rows),
            'category' => $this->categoryLabel($filters['category']),
            'location' => $this->locationLabel($filters['location']),
            'currency' => $this->currency(),
        ];
    }

    private function categoryOptions()
    {
        return DB::table('stockcategory')
            ->select('categoryid', 'categorydescription')
            ->where(function ($query) {
                $query->whereNull('stocktype')->orWhere('stocktype', '<>', 'A');
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

    private function categoryLabel(string $category): string
    {
        if ($category === 'All') return 'All categories';
        $row = DB::table('stockcategory')->where('categoryid', $category)->first();
        return $row ? html_entity_decode((string) ($row->categorydescription ?: $category)) : $category;
    }

    private function locationLabel(string $location): string
    {
        if ($location === 'All') return 'All locations';
        $row = DB::table('locations')->where('loccode', $location)->first();
        return $row ? html_entity_decode((string) ($row->locationname ?: $location)) : $location;
    }

    private function currency(): string
    {
        if (!Schema::hasTable('companies')) return 'TZS';
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
            if (!is_file($path)) continue;
            $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
            $mime = $extension === 'svg' ? 'image/svg+xml' : ($extension === 'jpg' || $extension === 'jpeg' ? 'image/jpeg' : 'image/png');
            return 'data:' . $mime . ';base64,' . base64_encode((string) file_get_contents($path));
        }

        return '';
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

    private function nativePdf($rows, array $context): string
    {
        $width = 841.89;
        $height = 595.28;
        $margin = 24.0;
        $rowHeight = 15.0;
        $rowsPerPage = 25;
        $chunks = $rows->chunk($rowsPerPage)->values();
        $pageCount = max(1, $chunks->count());
        $pages = [];

        foreach ($chunks as $pageIndex => $chunk) {
            $pageNumber = $pageIndex + 1;
            $summary = $context['summary'];
            $content = '';
            $content .= $this->pdfRect($margin, 510, $width - ($margin * 2), 58, '0.999 0.973 0.984', '0.918 0.859 0.890');
            $content .= $this->pdfText($context['company']['name'], 34, 548, 18, true, '0.129 0.063 0.098');
            $addressY = 532;
            foreach (array_slice($context['company']['address'], 0, 3) as $line) {
                $content .= $this->pdfText($line, 34, $addressY, 9, false, '0.373 0.282 0.341');
                $addressY -= 11;
            }
            $content .= $this->pdfText('Inventory Valuation', 610, 548, 20, true, '0.149 0.212 0.290');
            $content .= $this->pdfText('Printed ' . Carbon::now()->format('d M Y, H:i'), 610, 532, 9, false, '0.373 0.282 0.341');
            $content .= $this->pdfText('Page ' . $pageNumber . ' of ' . $pageCount, 610, 520, 9, false, '0.373 0.282 0.341');

            $meta = [
                ['Total value', $this->money($summary['totalValue'], $context['currency'])],
                ['Category', $context['category']],
                ['Location', $context['location']],
                ['Items', $this->number($summary['items'], 0)],
                ['Cost attention', $this->number($summary['zeroCostLines'] + $summary['negativeValueLines'], 0)],
            ];
            $metaX = $margin;
            $metaY = 468;
            $metaWidth = ($width - ($margin * 2)) / count($meta);
            foreach ($meta as [$label, $value]) {
                $content .= $this->pdfRect($metaX, $metaY, $metaWidth, 34, '1 1 1', '0.918 0.859 0.890');
                $content .= $this->pdfText($label, $metaX + 6, $metaY + 20, 8, true, '0.373 0.282 0.341');
                $content .= $this->pdfText($this->fitText($value, 25), $metaX + 6, $metaY + 8, 9.5, true, '0.129 0.063 0.098');
                $metaX += $metaWidth;
            }

            $columns = [
                ['Part', 70, 'left'],
                ['Description', 170, 'left'],
                ['Category', 115, 'left'],
                ['Location', 110, 'left'],
                ['Qty', 58, 'right'],
                ['Unit', 36, 'left'],
                ['Unit Cost', 80, 'right'],
                ['Value', 88, 'right'],
                ['Used', 50, 'right'],
                ['Status', 65, 'left'],
            ];
            $x = $margin;
            $y = 434;
            foreach ($columns as [$heading, $columnWidth]) {
                $content .= $this->pdfRect($x, $y, $columnWidth, 20, '0.973 0.929 0.953', '0.918 0.859 0.890');
                $content .= $this->pdfText($heading, $x + 4, $y + 7, 8.5, true, '0.294 0.204 0.259');
                $x += $columnWidth;
            }

            $y = 416;
            foreach ($chunk as $index => $row) {
                $fill = $index % 2 === 0 ? '1 1 1' : '0.999 0.973 0.984';
                $x = $margin;
                $cells = [
                    [$row['stockId'], 70, 'left', 12],
                    [$row['description'], 170, 'left', 29],
                    [$row['categoryName'], 115, 'left', 19],
                    [$row['locationName'], 110, 'left', 18],
                    [$this->number($row['quantity'], $row['decimalPlaces']), 58, 'right', 9],
                    [$row['units'], 36, 'left', 6],
                    [$this->money($row['unitCost'], $context['currency']), 80, 'right', 13],
                    [$this->money($row['value'], $context['currency']), 88, 'right', 14],
                    [$this->number($row['movementOut'], $row['decimalPlaces']), 50, 'right', 8],
                    [$row['costStatus'], 65, 'left', 11],
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

    private function buildPdf(array $pages, float $width, float $height): string
    {
        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
        ];
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
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
        $pdf .= "0000000000 65535 f \n";
        for ($i = 1; $i <= count($objects); $i++) {
            $pdf .= sprintf('%010d 00000 n ', $offsets[$i]) . "\n";
        }
        $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF";

        return $pdf;
    }

    private function pdfRect(float $x, float $y, float $width, float $height, string $fillColor, string $strokeColor): string
    {
        return "q {$fillColor} rg {$strokeColor} RG {$x} {$y} {$width} {$height} re B Q\n";
    }

    private function pdfText(string $text, float $x, float $y, float $size, bool $bold = false, string $color = '0 0 0'): string
    {
        $font = $bold ? 'F2' : 'F1';
        return "BT {$color} rg /{$font} {$size} Tf {$x} {$y} Td (" . $this->pdfEscape($text) . ") Tj ET\n";
    }

    private function pdfEscape(string $text): string
    {
        $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
        $text = iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $text);
        return str_replace(['\\', '(', ')', "\r", "\n"], ['\\\\', '\\(', '\\)', ' ', ' '], (string) $text);
    }

    private function pdfTextWidth(string $text, float $size): float
    {
        return strlen((string) iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $text)) * $size * 0.48;
    }

    private function fitText(string $text, int $chars): string
    {
        $text = trim(preg_replace('/\s+/', ' ', html_entity_decode($text, ENT_QUOTES, 'UTF-8')) ?? '');
        if (mb_strlen($text) <= $chars) {
            return $text;
        }

        return rtrim(mb_substr($text, 0, max(1, $chars - 1))) . '...';
    }

    private function pdfHtml($rows, array $context): string
    {
        $summary = $context['summary'];
        $company = $context['company'];
        $address = collect($company['address'])->map(fn ($line) => '<div>' . $this->html($line) . '</div>')->implode('');
        $rowsHtml = '';

        foreach ($rows as $row) {
            $rowsHtml .= '<tr>
                <td>' . $this->html($row['stockId']) . '</td>
                <td>' . $this->html($row['description']) . '</td>
                <td>' . $this->html($row['categoryName']) . '</td>
                <td>' . $this->html($row['locationName']) . '</td>
                <td class="right">' . $this->number($row['quantity'], $row['decimalPlaces']) . '</td>
                <td>' . $this->html($row['units']) . '</td>
                <td class="right">' . $this->money($row['unitCost'], $context['currency']) . '</td>
                <td class="right strong">' . $this->money($row['value'], $context['currency']) . '</td>
                <td class="right">' . $this->number($row['movementOut'], $row['decimalPlaces']) . '</td>
                <td>' . $this->html($row['costStatus']) . '</td>
            </tr>';
        }

        return '<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 24px 24px 34px; }
    body { color: #1f1020; font-family: DejaVu Sans, sans-serif; font-size: 10.8px; line-height: 1.35; }
    .top { background: #fff8fb; border: 1px solid #eadbe3; border-radius: 12px; padding: 12px 14px; }
    table { border-collapse: collapse; width: 100%; }
    .brand td { vertical-align: top; }
    .logo-cell { width: 70px; }
    .logo { max-height: 54px; max-width: 60px; object-fit: contain; }
    .company { color: #211019; font-size: 18px; font-weight: 700; margin-bottom: 4px; }
    .muted { color: #5f4857; }
    .title-panel { text-align: right; width: 330px; }
    .title { color: #26364a; font-size: 23px; font-weight: 700; }
    .printed { color: #5f4857; margin-top: 4px; }
    .meta { margin-top: 12px; }
    .meta td { border: 1px solid #eadbe3; padding: 7px 8px; vertical-align: top; width: 16.66%; }
    .label { color: #5f4857; display: block; font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .value { color: #1f1020; display: block; font-size: 11.5px; font-weight: 700; margin-top: 3px; }
    .lines { margin-top: 14px; }
    .lines th { background: #f8edf3; border: 1px solid #eadbe3; color: #4b3442; font-size: 9.5px; letter-spacing: .03em; padding: 7px 4px; text-align: left; text-transform: uppercase; }
    .lines td { border: 1px solid #eadbe3; color: #1f1020; font-size: 10.5px; font-weight: 600; padding: 7px 4px; vertical-align: top; }
    .lines tbody tr:nth-child(even) td { background: #fff8fb; }
    .right { text-align: right; }
    .strong { font-weight: 800; }
  </style>
</head>
<body>
  <div class="top">
    <table class="brand">
      <tr>
        <td class="logo-cell">' . ($company['logo'] ? '<img class="logo" src="' . $this->html($company['logo']) . '" alt="Logo">' : '') . '</td>
        <td><div class="company">' . $this->html($company['name']) . '</div><div class="muted">' . $address . '</div></td>
        <td class="title-panel">
          <div class="title">Inventory Valuation</div>
          <div class="printed">Printed ' . $this->html(Carbon::now()->format('d M Y, H:i')) . '</div>
          <div class="printed">Activity ' . $this->html($context['filters']['dateFrom'] . ' to ' . $context['filters']['dateTo']) . '</div>
        </td>
      </tr>
    </table>
  </div>
  <table class="meta">
    <tr>
      <td><span class="label">Total value</span><span class="value">' . $this->money($summary['totalValue'], $context['currency']) . '</span></td>
      <td><span class="label">Category</span><span class="value">' . $this->html($context['category']) . '</span></td>
      <td><span class="label">Location</span><span class="value">' . $this->html($context['location']) . '</span></td>
      <td><span class="label">Items</span><span class="value">' . $this->number($summary['items'], 0) . '</span></td>
      <td><span class="label">Zero cost lines</span><span class="value">' . $this->number($summary['zeroCostLines'], 0) . '</span></td>
      <td><span class="label">Negative value</span><span class="value">' . $this->number($summary['negativeValueLines'], 0) . '</span></td>
    </tr>
  </table>
  <table class="lines">
    <thead>
      <tr>
        <th style="width: 72px;">Part</th>
        <th>Description</th>
        <th style="width: 126px;">Category</th>
        <th style="width: 126px;">Location</th>
        <th class="right" style="width: 62px;">Qty</th>
        <th style="width: 42px;">Unit</th>
        <th class="right" style="width: 82px;">Unit cost</th>
        <th class="right" style="width: 92px;">Value</th>
        <th class="right" style="width: 58px;">Used</th>
        <th style="width: 70px;">Status</th>
      </tr>
    </thead>
    <tbody>' . $rowsHtml . '</tbody>
  </table>
</body>
</html>';
    }

    private function xlsx($rows, array $context): string
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
            [['value' => 'Inventory Valuation', 'style' => 1]],
            [['value' => 'Printed ' . Carbon::now()->format('d M Y, H:i')]],
            [],
            [['value' => 'Total value', 'style' => 2], ['value' => $summary['totalValue'], 'type' => 'number']],
            [['value' => 'Category', 'style' => 2], ['value' => $context['category']]],
            [['value' => 'Location', 'style' => 2], ['value' => $context['location']]],
            [['value' => 'Activity dates', 'style' => 2], ['value' => $context['filters']['dateFrom'] . ' to ' . $context['filters']['dateTo']]],
            [],
            array_map(fn ($value) => ['value' => $value, 'style' => 2], [
                'Part Number',
                'Description',
                'Category',
                'Location',
                'Quantity',
                'Units',
                'Material Cost',
                'Labour Cost',
                'Overhead Cost',
                'Unit Cost',
                'Value',
                'Movement In',
                'Movement Out',
                'Cost Status',
            ]),
        ];

        foreach ($rows as $row) {
            $sheetRows[] = [
                ['value' => $row['stockId']],
                ['value' => $row['description']],
                ['value' => $row['categoryName']],
                ['value' => $row['locationName']],
                ['value' => $row['quantity'], 'type' => 'number'],
                ['value' => $row['units']],
                ['value' => $row['materialCost'], 'type' => 'number'],
                ['value' => $row['labourCost'], 'type' => 'number'],
                ['value' => $row['overheadCost'], 'type' => 'number'],
                ['value' => $row['unitCost'], 'type' => 'number'],
                ['value' => $row['value'], 'type' => 'number'],
                ['value' => $row['movementIn'], 'type' => 'number'],
                ['value' => $row['movementOut'], 'type' => 'number'],
                ['value' => $row['costStatus']],
            ];
        }

        return $sheetRows;
    }

    private function xlsxWorksheet(array $rows): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
        foreach ($rows as $index => $row) {
            $rowNumber = $index + 1;
            $xml .= '<row r="' . $rowNumber . '">';
            foreach ($row as $column => $cell) {
                $xml .= $this->xlsxCell($column + 1, $rowNumber, $cell);
            }
            $xml .= '</row>';
        }
        return $xml . '</sheetData></worksheet>';
    }

    private function xlsxCell(int $column, int $row, array $cell): string
    {
        $ref = $this->xlsxColumnName($column) . $row;
        $style = isset($cell['style']) ? ' s="' . (int) $cell['style'] . '"' : '';
        if (($cell['type'] ?? '') === 'number') {
            return '<c r="' . $ref . '"' . $style . '><v>' . (float) ($cell['value'] ?? 0) . '</v></c>';
        }
        return '<c r="' . $ref . '" t="inlineStr"' . $style . '><is><t>' . $this->xml((string) ($cell['value'] ?? '')) . '</t></is></c>';
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
        return '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
    }

    private function relsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    }

    private function workbookXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory Valuation" sheetId="1" r:id="rId1"/></sheets></workbook>';
    }

    private function workbookRelsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    }

    private function appXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Akiva</Application></Properties>';
    }

    private function coreXml(): string
    {
        $now = Carbon::now()->toAtomString();
        return '<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Inventory Valuation</dc:title><dc:creator>Akiva</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' . $now . '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' . $now . '</dcterms:modified></cp:coreProperties>';
    }

    private function xlsxStyles(): string
    {
        return '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8EDF3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellXfs count="3"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="0" borderId="0" applyFont="1"/><xf fontId="1" fillId="1" borderId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>';
    }

    private function zipArchive(array $files): string
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::OVERWRITE);
        foreach ($files as $name => $content) {
            $zip->addFromString($name, $content);
        }
        $zip->close();
        $content = (string) file_get_contents($path);
        @unlink($path);
        return $content;
    }

    private function html(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }

    private function xml(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    private function number(float|int $value, int $decimals = 2): string
    {
        return number_format((float) $value, max(0, $decimals));
    }

    private function money(float|int $value, string $currency): string
    {
        return $currency . ' ' . number_format((float) $value, 2);
    }

    private function exportFilename(string $extension): string
    {
        return 'inventory-valuation-' . Carbon::now()->format('Y-m-d') . '.' . $extension;
    }
}
