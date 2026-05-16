<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class InventoryQuantityController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'categories' => [],
                    'rows' => [],
                    'summary' => $this->summary(collect()),
                ],
            ]);
        }

        try {
            @ini_set('memory_limit', '512M');
            @set_time_limit(120);

            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            return response()->json([
                'success' => true,
                'data' => [
                    'categories' => $this->categoryOptions(),
                    'rows' => $rows->values(),
                    'summary' => $this->summary($rows),
                    'filters' => $filters,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Inventory quantities could not be loaded.',
            ], 500);
        }
    }

    public function exportPdf(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory quantities are not available.',
            ], 503);
        }

        try {
            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            if ($rows->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no inventory quantities to export for the selected filters.',
                ], 422);
            }

            $context = [
                'filters' => $filters,
                'company' => $this->companyProfile(),
                'category' => $this->categoryLabel($filters['category']),
                'summary' => $this->summary($rows),
            ];

            return response($this->nativePdf($rows, $context), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . $this->exportFilename('pdf') . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Inventory quantities PDF could not be created.',
            ], 500);
        }
    }

    public function exportExcel(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Inventory quantities are not available.',
            ], 503);
        }

        try {
            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            if ($rows->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no inventory quantities to export for the selected filters.',
                ], 422);
            }

            return response($this->xlsx($rows, [
                'filters' => $filters,
                'company' => $this->companyProfile(),
                'category' => $this->categoryLabel($filters['category']),
                'summary' => $this->summary($rows),
            ]), 200, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition' => 'attachment; filename="' . $this->exportFilename('xlsx') . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Inventory quantities Excel file could not be created.',
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
        $selection = trim((string) $request->query('selection', 'All'));
        $selection = strtolower($selection) === 'multiple' ? 'Multiple' : 'All';
        $category = trim((string) $request->query('category', 'All'));
        $search = trim((string) $request->query('q', ''));

        return [
            'selection' => $selection,
            'category' => $category === '' ? 'All' : $category,
            'search' => $search,
        ];
    }

    private function rows(array $filters)
    {
        $query = DB::table('locstock')
            ->join('stockmaster', 'locstock.stockid', '=', 'stockmaster.stockid')
            ->join('locations', 'locstock.loccode', '=', 'locations.loccode')
            ->leftJoin('stockcategory', 'stockcategory.categoryid', '=', 'stockmaster.categoryid')
            ->select(
                'locstock.stockid',
                'stockmaster.description',
                'stockmaster.longdescription',
                'stockmaster.categoryid',
                'stockcategory.categorydescription',
                'locstock.loccode',
                'locations.locationname',
                'locstock.quantity',
                'locstock.reorderlevel',
                'stockmaster.decimalplaces',
                'stockmaster.serialised',
                'stockmaster.controlled',
                'stockmaster.units'
            )
            ->where('locstock.quantity', '<>', 0)
            ->whereIn('stockmaster.mbflag', ['B', 'M']);

        if ($filters['category'] !== 'All') {
            $query->where('stockmaster.categoryid', $filters['category']);
        }

        if ($filters['selection'] === 'Multiple') {
            $query->whereRaw('(SELECT COUNT(*) FROM locstock AS multi_locstock WHERE multi_locstock.stockid = stockmaster.stockid AND multi_locstock.quantity <> 0 GROUP BY multi_locstock.stockid) > 1');
        }

        if ($filters['search'] !== '') {
            $search = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $filters['search']) . '%';
            $query->where(function ($inner) use ($search) {
                $inner->where('locstock.stockid', 'like', $search)
                    ->orWhere('stockmaster.description', 'like', $search)
                    ->orWhere('stockmaster.longdescription', 'like', $search)
                    ->orWhere('stockmaster.categoryid', 'like', $search)
                    ->orWhere('stockcategory.categorydescription', 'like', $search)
                    ->orWhere('locstock.loccode', 'like', $search)
                    ->orWhere('locations.locationname', 'like', $search);
            });
        }

        return $query
            ->orderBy('locstock.stockid')
            ->orderBy('locstock.loccode')
            ->get()
            ->map(fn ($row) => $this->mapRow($row));
    }

    private function mapRow($row): array
    {
        $quantity = (float) $row->quantity;
        $reorder = (float) $row->reorderlevel;

        return [
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
            'category' => (string) ($row->categoryid ?? ''),
            'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid ?: '')),
            'location' => (string) $row->loccode,
            'locationName' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
            'quantity' => round($quantity, (int) $row->decimalplaces),
            'reorderLevel' => round($reorder, (int) $row->decimalplaces),
            'aboveReorder' => round($quantity - $reorder, (int) $row->decimalplaces),
            'decimalPlaces' => (int) $row->decimalplaces,
            'serialised' => (bool) $row->serialised,
            'controlled' => (bool) $row->controlled,
            'units' => (string) ($row->units ?: ''),
            'attention' => $reorder > 0 && $quantity <= $reorder,
        ];
    }

    private function summary($rows): array
    {
        return [
            'lines' => $rows->count(),
            'items' => $rows->pluck('stockId')->unique()->count(),
            'locations' => $rows->pluck('location')->unique()->count(),
            'quantity' => round((float) $rows->sum('quantity'), 4),
            'belowReorder' => $rows->where('attention', true)->count(),
            'controlledLines' => $rows->filter(fn ($row) => $row['controlled'] || $row['serialised'])->count(),
        ];
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

    private function categoryLabel(string $category): string
    {
        if ($category === 'All') {
            return 'All categories';
        }

        $row = DB::table('stockcategory')->where('categoryid', $category)->first();

        return $row ? html_entity_decode((string) ($row->categorydescription ?: $category)) : $category;
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
            $content = '';
            $content .= $this->pdfRect($margin, 510, $width - ($margin * 2), 58, '0.999 0.973 0.984', '0.918 0.859 0.890');
            $content .= $this->pdfText($context['company']['name'], 34, 548, 18, true, '0.129 0.063 0.098');
            $addressY = 532;
            foreach (array_slice($context['company']['address'], 0, 3) as $line) {
                $content .= $this->pdfText($line, 34, $addressY, 9, false, '0.373 0.282 0.341');
                $addressY -= 11;
            }
            $content .= $this->pdfText('Inventory Quantities', 610, 548, 20, true, '0.149 0.212 0.290');
            $content .= $this->pdfText('Printed ' . Carbon::now()->format('d M Y, H:i'), 610, 532, 9, false, '0.373 0.282 0.341');
            $content .= $this->pdfText('Page ' . $pageNumber . ' of ' . $pageCount, 610, 520, 9, false, '0.373 0.282 0.341');

            $summary = $context['summary'];
            $meta = [
                ['Selection', $context['filters']['selection'] === 'Multiple' ? 'Multiple locations only' : 'All quantities'],
                ['Category', $context['category']],
                ['Items', $this->number($summary['items'], 0)],
                ['Locations', $this->number($summary['locations'], 0)],
                ['Below reorder', $this->number($summary['belowReorder'], 0)],
            ];
            $metaX = $margin;
            $metaY = 468;
            $metaWidth = ($width - ($margin * 2)) / count($meta);
            foreach ($meta as [$label, $value]) {
                $content .= $this->pdfRect($metaX, $metaY, $metaWidth, 34, '1 1 1', '0.918 0.859 0.890');
                $content .= $this->pdfText($label, $metaX + 6, $metaY + 20, 8, true, '0.373 0.282 0.341');
                $content .= $this->pdfText($this->fitText($value, 24), $metaX + 6, $metaY + 8, 9.5, true, '0.129 0.063 0.098');
                $metaX += $metaWidth;
            }

            $columns = [
                ['Part Number', 72, 'left'],
                ['Description', 180, 'left'],
                ['Category', 145, 'left'],
                ['Location', 60, 'left'],
                ['Location Name', 150, 'left'],
                ['Quantity', 70, 'right'],
                ['Reorder', 70, 'right'],
                ['Control', 47, 'left'],
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
                    [$row['stockId'], 72, 'left', 12],
                    [$row['description'], 180, 'left', 31],
                    [$row['categoryName'], 145, 'left', 24],
                    [$row['location'], 60, 'left', 10],
                    [$row['locationName'], 150, 'left', 26],
                    [$this->number($row['quantity'], $row['decimalPlaces']), 70, 'right', 10],
                    [$this->number($row['reorderLevel'], $row['decimalPlaces']), 70, 'right', 10],
                    [trim(($row['controlled'] ? 'Controlled ' : '') . ($row['serialised'] ? 'Serialised' : '')) ?: '-', 47, 'left', 8],
                ];

                foreach ($cells as [$value, $columnWidth, $align, $chars]) {
                    $content .= $this->pdfRect($x, $y, $columnWidth, $rowHeight, $fill, '0.918 0.859 0.890');
                    $text = $this->fitText((string) $value, $chars);
                    $textX = $align === 'right' ? $x + $columnWidth - 5 - ($this->pdfTextWidth($text, 8.8)) : $x + 4;
                    $content .= $this->pdfText($text, max($x + 4, $textX), $y + 4.5, 8.8, true, '0.129 0.063 0.098');
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

        return rtrim(mb_substr($text, 0, max(1, $chars - 1))) . '…';
    }

    private function pdfHtml($rows, array $context): string
    {
        $company = $context['company'];
        $address = collect($company['address'])
            ->map(fn ($line) => '<div>' . $this->html($line) . '</div>')
            ->implode('');
        $summary = $context['summary'];

        $tableHeader = '<thead>
      <tr>
        <th style="width: 72px;">Part Number</th>
        <th>Description</th>
        <th style="width: 136px;">Category</th>
        <th style="width: 58px;">Location</th>
        <th style="width: 128px;">Location Name</th>
        <th class="right" style="width: 70px;">Quantity</th>
        <th class="right" style="width: 70px;">Reorder</th>
        <th style="width: 78px;">Control</th>
      </tr>
    </thead>';
        $tables = '';
        $chunks = $rows->chunk(34)->values();

        foreach ($chunks as $chunkIndex => $chunk) {
            $bodyRows = '';

            foreach ($chunk as $row) {
                $bodyRows .= '<tr>
                <td>' . $this->html($row['stockId']) . '</td>
                <td>' . $this->html($row['description']) . '</td>
                <td>' . $this->html($row['categoryName']) . '</td>
                <td>' . $this->html($row['location']) . '</td>
                <td>' . $this->html($row['locationName']) . '</td>
                <td class="right">' . $this->number($row['quantity'], $row['decimalPlaces']) . '</td>
                <td class="right">' . $this->number($row['reorderLevel'], $row['decimalPlaces']) . '</td>
                <td>' . $this->html(trim(($row['controlled'] ? 'Controlled ' : '') . ($row['serialised'] ? 'Serialised' : '')) ?: '-') . '</td>
            </tr>';
            }

            $pageClass = $chunkIndex < $chunks->count() - 1 ? ' page-break' : '';
            $tables .= '<table class="lines' . $pageClass . '">' . $tableHeader . '<tbody>' . $bodyRows . '</tbody></table>';
        }

        return '<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 24px 24px 40px; }
    body { color: #1f1020; font-family: DejaVu Sans, sans-serif; font-size: 10.5px; line-height: 1.4; }
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
    .meta td { border: 1px solid #eadbe3; padding: 7px 8px; vertical-align: top; width: 20%; }
    .label { color: #5f4857; display: block; font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .value { color: #1f1020; display: block; font-size: 11.5px; font-weight: 700; margin-top: 3px; }
    table.lines { border-collapse: collapse; margin-top: 14px; width: 100%; }
    table.page-break { page-break-after: always; }
    .lines th { background: #f8edf3; border: 1px solid #eadbe3; color: #4b3442; font-size: 9.5px; letter-spacing: .03em; padding: 7px 4px; text-align: left; text-transform: uppercase; }
    .lines td { border: 1px solid #eadbe3; color: #1f1020; font-size: 10.5px; font-weight: 600; padding: 7px 4px; vertical-align: top; }
    .lines tbody tr:nth-child(even) td { background: #fff8fb; }
    .right { text-align: right; }
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
          <div class="title">Inventory Quantities</div>
          <div class="printed">Printed ' . $this->html(Carbon::now()->format('d M Y, H:i')) . '</div>
          <div class="printed">' . $this->html((string) $summary['lines']) . ' location lines</div>
        </td>
      </tr>
    </table>
  </div>
  <table class="meta">
    <tr>
      <td><span class="label">Selection</span><span class="value">' . $this->html($context['filters']['selection'] === 'Multiple' ? 'Multiple locations only' : 'All quantities') . '</span></td>
      <td><span class="label">Category</span><span class="value">' . $this->html($context['category']) . '</span></td>
      <td><span class="label">Items</span><span class="value">' . $this->number($summary['items'], 0) . '</span></td>
      <td><span class="label">Locations</span><span class="value">' . $this->number($summary['locations'], 0) . '</span></td>
      <td><span class="label">Below reorder</span><span class="value">' . $this->number($summary['belowReorder'], 0) . '</span></td>
    </tr>
  </table>
  ' . $tables . '
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
            [['value' => 'Inventory Quantities', 'style' => 1]],
            [['value' => 'Printed ' . Carbon::now()->format('d M Y, H:i')]],
            [],
            [['value' => 'Selection', 'style' => 2], ['value' => $context['filters']['selection'] === 'Multiple' ? 'Multiple locations only' : 'All quantities']],
            [['value' => 'Category', 'style' => 2], ['value' => $context['category']]],
            [['value' => 'Items', 'style' => 2], ['value' => $summary['items'], 'type' => 'number'], ['value' => 'Location lines', 'style' => 2], ['value' => $summary['lines'], 'type' => 'number']],
            [],
            array_map(fn ($value) => ['value' => $value, 'style' => 2], [
                'Part Number',
                'Description',
                'Category',
                'Location',
                'Location Name',
                'Quantity',
                'Reorder Level',
                'Units',
                'Controlled',
                'Serialised',
            ]),
        ];

        foreach ($rows as $row) {
            $sheetRows[] = [
                ['value' => $row['stockId']],
                ['value' => $row['description']],
                ['value' => $row['categoryName']],
                ['value' => $row['location']],
                ['value' => $row['locationName']],
                ['value' => number_format((float) $row['quantity'], $row['decimalPlaces'], '.', ''), 'type' => 'number'],
                ['value' => number_format((float) $row['reorderLevel'], $row['decimalPlaces'], '.', ''), 'type' => 'number'],
                ['value' => $row['units']],
                ['value' => $row['controlled'] ? 'Yes' : 'No'],
                ['value' => $row['serialised'] ? 'Yes' : 'No'],
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
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="9" topLeftCell="A10" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>
    <col min="1" max="1" width="18" customWidth="1"/>
    <col min="2" max="3" width="30" customWidth="1"/>
    <col min="4" max="5" width="18" customWidth="1"/>
    <col min="6" max="10" width="16" customWidth="1"/>
  </cols>
  <sheetData>' . $sheetRows . '</sheetData>
  <autoFilter ref="A9:J' . max(9, count($rows)) . '"/>
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
  <dc:title>Inventory Quantities</dc:title>
  <dc:creator>Akiva</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">' . Carbon::now()->toIso8601String() . '</dcterms:created>
</cp:coreProperties>';
    }

    private function workbookXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory Quantities" sheetId="1" r:id="rId1"/></sheets></workbook>';
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
        return 'inventory-quantities-' . Carbon::now()->format('Y-m-d') . '.' . $extension;
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
