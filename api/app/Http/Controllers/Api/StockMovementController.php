<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockMovementController extends Controller
{
    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => [],
                    'items' => [],
                    'movementTypes' => [],
                    'movements' => [],
                    'summary' => $this->emptySummary(),
                    'currency' => 'TZS',
                ],
            ]);
        }

        try {
            $location = strtoupper(trim((string) $request->query('location', '')));
            $item = strtoupper(trim((string) $request->query('item', '')));
            $type = trim((string) $request->query('type', ''));
            $direction = trim((string) $request->query('direction', 'All'));
            $search = trim((string) $request->query('q', ''));
            $from = $this->queryDate($request->query('from'));
            $to = $this->queryDate($request->query('to'));
            $limit = $this->safeLimit($request->query('limit', 500), 50, 1000);

            if ($from !== null && $to !== null && $from > $to) {
                [$from, $to] = [$to, $from];
            }

            $movements = $this->movements($location, $item, $type, $direction, $from, $to, $search, $limit);

            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => $this->locations(),
                    'items' => $this->movementItemOptions('', 50),
                    'movementTypes' => $this->movementTypes(),
                    'movements' => $movements,
                    'summary' => $this->summary($movements),
                    'currency' => $this->currency(),
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock movements could not be loaded.',
            ], 500);
        }
    }

    public function items(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }

        try {
            $search = trim((string) $request->query('q', ''));
            $limit = $this->safeLimit($request->query('limit', 50), 20, 100);

            return response()->json([
                'success' => true,
                'data' => $this->movementItemOptions($search, $limit),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Items could not be loaded.',
            ], 500);
        }
    }

    public function exportPdf(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Stock movements are not available.',
            ], 503);
        }

        try {
            [$movements, $context] = $this->exportMovements($request);
            if ($movements->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no stock movements to export.',
                ], 422);
            }

            return response($this->nativePdf($movements, $context), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . $this->exportFilename($context, 'pdf') . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock movements PDF could not be created.',
            ], 500);
        }
    }

    public function exportExcel(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Stock movements are not available.',
            ], 503);
        }

        try {
            [$movements, $context] = $this->exportMovements($request);
            if ($movements->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no stock movements to export.',
                ], 422);
            }

            return response($this->exportXlsx($movements, $context), 200, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition' => 'attachment; filename="' . $this->exportFilename($context, 'xlsx') . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock movements Excel file could not be created.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('stockmoves')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locations')
            && Schema::hasTable('systypes');
    }

    private function movements(string $location, string $item, string $type, string $direction, ?string $from, ?string $to, string $search, int $limit)
    {
        $query = DB::table('stockmoves as smv')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'smv.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'smv.loccode')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->leftJoin('systypes as st', 'st.typeid', '=', 'smv.type')
            ->select(
                'smv.stkmoveno',
                'smv.stockid',
                'smv.type',
                'smv.transno',
                'smv.loccode',
                'smv.trandate',
                'smv.userid',
                'smv.debtorno',
                'smv.branchcode',
                'smv.price',
                'smv.reference',
                'smv.qty',
                'smv.discountpercent',
                'smv.standardcost',
                'smv.newqoh',
                'smv.narrative',
                'smv.units as move_units',
                'sm.description',
                'sm.longdescription',
                'sm.categoryid',
                'sm.units',
                'sm.decimalplaces',
                'sm.controlled',
                'sm.serialised',
                'sc.categorydescription',
                'st.typename',
                DB::raw('COALESCE(NULLIF(loc.locationname, ""), smv.loccode) as location_name')
            )
            ->where('smv.hidemovt', 0);

        if ($location !== '' && strtolower($location) !== 'all') {
            $query->where('smv.loccode', $location);
        }

        if ($item !== '' && strtolower($item) !== 'all') {
            $query->where('smv.stockid', $item);
        }

        if ($type !== '' && strtolower($type) !== 'all') {
            $query->where('smv.type', (int) $type);
        }

        if ($direction === 'In') {
            $query->where('smv.qty', '>', 0);
        } elseif ($direction === 'Out') {
            $query->where('smv.qty', '<', 0);
        } elseif ($direction === 'Zero') {
            $query->where('smv.qty', '=', 0);
        }

        if ($from !== null) {
            $query->whereDate('smv.trandate', '>=', $from);
        }

        if ($to !== null) {
            $query->whereDate('smv.trandate', '<=', $to);
        }

        if ($search !== '') {
            $query->where(function ($query) use ($search) {
                $query->where('smv.stockid', 'like', '%' . $search . '%')
                    ->orWhere('sm.description', 'like', '%' . $search . '%')
                    ->orWhere('sm.longdescription', 'like', '%' . $search . '%')
                    ->orWhere('smv.reference', 'like', '%' . $search . '%')
                    ->orWhere('smv.debtorno', 'like', '%' . $search . '%')
                    ->orWhere('smv.branchcode', 'like', '%' . $search . '%')
                    ->orWhere('smv.transno', 'like', '%' . $search . '%')
                    ->orWhere('st.typename', 'like', '%' . $search . '%');
            });
        }

        $rows = $query
            ->orderByDesc('smv.stkmoveno')
            ->limit($limit)
            ->get();

        $serialsByMove = $this->serialsForMovements($rows->pluck('stkmoveno')->map(fn ($value) => (int) $value)->all());

        return $rows
            ->map(function ($row) use ($serialsByMove) {
                $quantity = (float) $row->qty;
                $unitCost = (float) $row->standardcost;
                $price = (float) $row->price;
                $discountPercent = (float) $row->discountpercent;
                $decimalPlaces = (int) ($row->decimalplaces ?? 0);
                $serials = $serialsByMove[(int) $row->stkmoveno] ?? [];

                return [
                    'movementNumber' => (int) $row->stkmoveno,
                    'stockId' => (string) $row->stockid,
                    'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
                    'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
                    'category' => (string) ($row->categoryid ?? ''),
                    'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid ?: '')),
                    'type' => (int) $row->type,
                    'typeName' => html_entity_decode((string) ($row->typename ?: 'Transaction')),
                    'transactionNumber' => (int) $row->transno,
                    'location' => (string) $row->loccode,
                    'locationName' => html_entity_decode((string) $row->location_name),
                    'date' => $this->dateOnly((string) $row->trandate),
                    'postedBy' => (string) ($row->userid ?? ''),
                    'customer' => (string) ($row->debtorno ?? ''),
                    'branch' => (string) ($row->branchcode ?? ''),
                    'quantity' => $quantity,
                    'absoluteQuantity' => abs($quantity),
                    'newOnHand' => (float) $row->newqoh,
                    'unitCost' => $unitCost,
                    'movementValue' => abs($quantity * $unitCost),
                    'price' => $price,
                    'discountPercent' => $discountPercent * 100,
                    'netPrice' => $price * (1 - $discountPercent),
                    'reference' => html_entity_decode((string) ($row->reference ?? '')),
                    'narrative' => html_entity_decode((string) ($row->narrative ?? '')),
                    'units' => (string) ($row->move_units ?: $row->units ?: ''),
                    'decimalPlaces' => $decimalPlaces,
                    'controlled' => (bool) $row->controlled,
                    'serialised' => (bool) $row->serialised,
                    'serials' => $serials,
                    'direction' => $quantity > 0 ? 'In' : ($quantity < 0 ? 'Out' : 'Zero'),
                ];
            })
            ->values();
    }

    private function exportMovements(Request $request): array
    {
        $location = strtoupper(trim((string) $request->query('location', '')));
        $item = strtoupper(trim((string) $request->query('item', '')));
        $type = trim((string) $request->query('type', ''));
        $direction = trim((string) $request->query('direction', 'All'));
        $search = trim((string) $request->query('q', ''));
        $from = $this->queryDate($request->query('from'));
        $to = $this->queryDate($request->query('to'));

        if ($from !== null && $to !== null && $from > $to) {
            [$from, $to] = [$to, $from];
        }

        $limit = $this->safeLimit($request->query('limit', 500), 50, 1000);
        $movements = $this->movements($location, $item, $type, $direction, $from, $to, $search, $limit);

        return [
            $movements,
            [
                'location' => $location !== '' && strtolower($location) !== 'all' ? $this->locationName($location) : 'All locations',
                'item' => $item !== '' && strtolower($item) !== 'all' ? $this->itemName($item) : 'All items',
                'movementType' => $type !== '' && strtolower($type) !== 'all' ? $this->movementTypeName((int) $type) : 'All movement types',
                'direction' => $direction === 'In' ? 'Stock in' : ($direction === 'Out' ? 'Stock out' : ($direction === 'Zero' ? 'No quantity change' : 'All directions')),
                'from' => $from,
                'to' => $to,
                'search' => $search,
                'currency' => $this->currency(),
                'company' => $this->companyProfile(),
                'summary' => $this->summary($movements),
            ],
        ];
    }

    private function exportPdfHtml($movements, array $context): string
    {
        $rows = '';
        foreach ($movements as $movement) {
            $rows .= $this->exportTableRow($movement);
        }

        $company = $context['company'];
        $address = '';
        foreach ($company['address'] as $line) {
            $address .= '<div>' . $this->html($line) . '</div>';
        }

        return '<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 24px 24px 40px; }
    body { color: #211019; font-family: DejaVu Sans, sans-serif; font-size: 10px; line-height: 1.35; }
    .top { background: #fff8fb; border: 1px solid #eadbe3; border-radius: 12px; padding: 12px 14px; }
    .brand { border-collapse: collapse; width: 100%; }
    .brand td { vertical-align: top; }
    .logo-cell { width: 68px; }
    .logo { max-height: 50px; max-width: 58px; object-fit: contain; }
    .company { color: #211019; font-size: 17px; font-weight: 700; margin-bottom: 4px; }
    .muted { color: #7b6170; }
    .title-panel { text-align: right; width: 260px; }
    .title { color: #26364a; font-size: 21px; font-weight: 700; }
    .printed { color: #7b6170; margin-top: 4px; }
    .meta { border-collapse: collapse; margin-top: 12px; width: 100%; }
    .meta td { border: 1px solid #eadbe3; padding: 7px 8px; vertical-align: top; width: 25%; }
    .label { color: #856776; display: block; font-size: 8px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .value { color: #211019; display: block; font-size: 11px; font-weight: 700; margin-top: 3px; }
    table.lines { border-collapse: collapse; margin-top: 14px; width: 100%; }
    .lines th { background: #f8edf3; border: 1px solid #eadbe3; color: #856776; font-size: 8px; letter-spacing: .03em; padding: 6px 4px; text-align: left; text-transform: uppercase; }
    .lines td { border: 1px solid #eadbe3; padding: 5px 4px; vertical-align: top; }
    .lines tbody tr:nth-child(even) td { background: #fff8fb; }
    .right { text-align: right; }
    .center { text-align: center; }
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
          <div class="title">Stock Movements</div>
          <div class="printed">Printed ' . $this->html(Carbon::now()->format('d M Y, H:i')) . '</div>
          <div class="printed">' . $this->html((string) count($movements)) . ' movement lines</div>
        </td>
      </tr>
    </table>
  </div>
  ' . $this->exportContextTable($context) . '
  <table class="lines">
    <thead>
      <tr>
        <th style="width: 96px;">Type</th>
        <th style="width: 48px;">Number</th>
        <th style="width: 62px;">Date</th>
        <th style="width: 62px;">User ID</th>
        <th style="width: 58px;">Customer</th>
        <th style="width: 54px;">Branch</th>
        <th class="right" style="width: 66px;">Quantity</th>
        <th>Reference</th>
        <th class="right" style="width: 62px;">Price</th>
        <th class="right" style="width: 54px;">Discount</th>
        <th class="right" style="width: 62px;">New Qty</th>
        <th style="width: 90px;">Serial No.</th>
      </tr>
    </thead>
    <tbody>' . $rows . '</tbody>
  </table>
  <div class="footer">Stock movements exported from Akiva</div>
</body>
</html>';
    }

    private function nativePdf($movements, array $context): string
    {
        $width = 841.89;
        $height = 595.28;
        $margin = 24.0;
        $rowHeight = 15.0;
        $rowsPerPage = 25;
        $chunks = $movements->chunk($rowsPerPage)->values();
        $pageCount = max(1, $chunks->count());
        $pages = [];
        $summary = $context['summary'];
        $dateRange = $context['from'] || $context['to']
            ? ($context['from'] ? $this->displayDate((string) $context['from']) : 'Start') . ' to ' . ($context['to'] ? $this->displayDate((string) $context['to']) : 'Today')
            : 'All dates';

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
            $content .= $this->pdfText('Stock Movements', 610, 548, 20, true, '0.149 0.212 0.290');
            $content .= $this->pdfText('Printed ' . Carbon::now()->format('d M Y, H:i'), 610, 532, 9, false, '0.373 0.282 0.341');
            $content .= $this->pdfText('Page ' . $pageNumber . ' of ' . $pageCount, 610, 520, 9, false, '0.373 0.282 0.341');

            $meta = [
                ['Item', $context['item']],
                ['Location', $context['location']],
                ['Date range', $dateRange],
                ['Direction', $context['direction']],
                ['Lines', (string) $summary['movementLines']],
                ['Cost value', $this->formatMoney((float) $summary['movementValue'], (string) $context['currency'])],
            ];
            $metaX = $margin;
            $metaY = 468;
            $metaWidth = ($width - ($margin * 2)) / count($meta);
            foreach ($meta as [$label, $value]) {
                $content .= $this->pdfRect($metaX, $metaY, $metaWidth, 34, '1 1 1', '0.918 0.859 0.890');
                $content .= $this->pdfText($label, $metaX + 6, $metaY + 20, 8, true, '0.373 0.282 0.341');
                $content .= $this->pdfText($this->fitText((string) $value, 23), $metaX + 6, $metaY + 8, 9.5, true, '0.129 0.063 0.098');
                $metaX += $metaWidth;
            }

            $columns = [
                ['Type', 88],
                ['Number', 42],
                ['Date', 58],
                ['User ID', 52],
                ['Customer', 54],
                ['Branch', 48],
                ['Quantity', 62],
                ['Reference', 170],
                ['Price', 56],
                ['Discount', 48],
                ['New Qty', 56],
                ['Serial No.', 59],
            ];
            $x = $margin;
            $y = 434;
            foreach ($columns as [$heading, $columnWidth]) {
                $content .= $this->pdfRect($x, $y, $columnWidth, 20, '0.973 0.929 0.953', '0.918 0.859 0.890');
                $content .= $this->pdfText($heading, $x + 4, $y + 7, 8.2, true, '0.294 0.204 0.259');
                $x += $columnWidth;
            }

            $y = 416;
            foreach ($chunk as $index => $movement) {
                $fill = $index % 2 === 0 ? '1 1 1' : '0.999 0.973 0.984';
                $x = $margin;
                $cells = [
                    [$movement['typeName'], 88, 'left', 15],
                    [(string) $movement['transactionNumber'], 42, 'left', 7],
                    [$this->displayDate((string) $movement['date']), 58, 'left', 10],
                    [$movement['postedBy'], 52, 'left', 9],
                    [$movement['customer'], 54, 'left', 9],
                    [$movement['branch'], 48, 'left', 8],
                    [$this->formatQuantity((float) $movement['quantity'], (int) $movement['decimalPlaces']), 62, 'right', 10],
                    [$movement['reference'] ?: $movement['narrative'], 170, 'left', 33],
                    [number_format((float) $movement['price'], 2), 56, 'right', 10],
                    [number_format((float) $movement['discountPercent'], 2) . '%', 48, 'right', 8],
                    [$this->formatQuantity((float) $movement['newOnHand'], (int) $movement['decimalPlaces']), 56, 'right', 9],
                    [$this->serialText($movement), 59, 'left', 10],
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

    private function exportXlsx($movements, array $context): string
    {
        $rows = $this->xlsxRows($movements, $context);

        return $this->zipArchive([
            '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>',
            '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>',
            'docProps/app.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Akiva</Application>
</Properties>',
            'docProps/core.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Stock Movements</dc:title>
  <dc:creator>Akiva</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">' . Carbon::now()->toIso8601String() . '</dcterms:created>
</cp:coreProperties>',
            'xl/workbook.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Stock Movements" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>',
            'xl/_rels/workbook.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>',
            'xl/styles.xml' => $this->xlsxStyles(),
            'xl/worksheets/sheet1.xml' => $this->xlsxWorksheet($rows),
        ]);
    }

    private function xlsxRows($movements, array $context): array
    {
        $summary = $context['summary'];
        $dateRange = $context['from'] || $context['to']
            ? ($context['from'] ? $this->displayDate((string) $context['from']) : 'Start') . ' to ' . ($context['to'] ? $this->displayDate((string) $context['to']) : 'Today')
            : 'All dates';

        $rows = [
            [['value' => $context['company']['name'], 'style' => 1]],
            [['value' => 'Stock Movements', 'style' => 1]],
            [['value' => 'Printed ' . Carbon::now()->format('d M Y, H:i')]],
            [],
            [['value' => 'Item', 'style' => 2], ['value' => $context['item']], ['value' => 'Location', 'style' => 2], ['value' => $context['location']]],
            [['value' => 'Date range', 'style' => 2], ['value' => $dateRange], ['value' => 'Direction', 'style' => 2], ['value' => $context['direction']]],
            [['value' => 'Movement type', 'style' => 2], ['value' => $context['movementType']], ['value' => 'Lines', 'style' => 2], ['value' => $summary['movementLines'], 'type' => 'number']],
            [],
            array_map(fn ($value) => ['value' => $value, 'style' => 2], [
                'Type',
                'Number',
                'Date',
                'User ID',
                'Customer',
                'Branch',
                'Quantity',
                'Reference',
                'Price',
                'Discount',
                'New Qty',
                'Serial No.',
            ]),
        ];

        foreach ($movements as $movement) {
            $rows[] = [
                ['value' => $movement['typeName']],
                ['value' => $movement['transactionNumber'], 'type' => 'number'],
                ['value' => $this->displayDate((string) $movement['date'])],
                ['value' => $movement['postedBy']],
                ['value' => $movement['customer']],
                ['value' => $movement['branch']],
                ['value' => $this->formatQuantity((float) $movement['quantity'], (int) $movement['decimalPlaces']), 'type' => 'number'],
                ['value' => $movement['reference']],
                ['value' => number_format((float) $movement['price'], 2, '.', ''), 'type' => 'number'],
                ['value' => number_format((float) $movement['discountPercent'], 2, '.', ''), 'type' => 'number'],
                ['value' => $this->formatQuantity((float) $movement['newOnHand'], (int) $movement['decimalPlaces']), 'type' => 'number'],
                ['value' => $this->serialText($movement)],
            ];
        }

        return $rows;
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
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="9" topLeftCell="A10" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="22" customWidth="1"/>
    <col min="2" max="2" width="11" customWidth="1"/>
    <col min="3" max="3" width="14" customWidth="1"/>
    <col min="4" max="6" width="14" customWidth="1"/>
    <col min="7" max="7" width="14" customWidth="1"/>
    <col min="8" max="8" width="34" customWidth="1"/>
    <col min="9" max="11" width="14" customWidth="1"/>
    <col min="12" max="12" width="28" customWidth="1"/>
  </cols>
  <sheetData>' . $sheetRows . '</sheetData>
  <autoFilter ref="A9:L' . max(9, count($rows)) . '"/>
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

    private function exportContextTable(array $context): string
    {
        $summary = $context['summary'];
        $dateRange = $context['from'] || $context['to']
            ? ($context['from'] ? $this->displayDate((string) $context['from']) : 'Start') . ' to ' . ($context['to'] ? $this->displayDate((string) $context['to']) : 'Today')
            : 'All dates';

        return '<table class="meta">
    <tr>
      <td><span class="label">Item</span><span class="value">' . $this->html($context['item']) . '</span></td>
      <td><span class="label">Location</span><span class="value">' . $this->html($context['location']) . '</span></td>
      <td><span class="label">Date range</span><span class="value">' . $this->html($dateRange) . '</span></td>
      <td><span class="label">Direction</span><span class="value">' . $this->html($context['direction']) . '</span></td>
    </tr>
    <tr>
      <td><span class="label">Movement type</span><span class="value">' . $this->html($context['movementType']) . '</span></td>
      <td><span class="label">Search</span><span class="value">' . $this->html($context['search'] ?: '-') . '</span></td>
      <td><span class="label">Lines</span><span class="value">' . $this->html((string) $summary['movementLines']) . '</span></td>
      <td><span class="label">Cost value</span><span class="value">' . $this->html($this->formatMoney((float) $summary['movementValue'], (string) $context['currency'])) . '</span></td>
    </tr>
  </table>';
    }

    private function exportTableRow(array $movement): string
    {
        return '<tr>'
            . '<td>' . $this->html($movement['typeName']) . '</td>'
            . '<td class="center">' . $this->html((string) $movement['transactionNumber']) . '</td>'
            . '<td>' . $this->html($this->displayDate((string) $movement['date'])) . '</td>'
            . '<td>' . $this->html($movement['postedBy']) . '</td>'
            . '<td>' . $this->html($movement['customer']) . '</td>'
            . '<td>' . $this->html($movement['branch']) . '</td>'
            . '<td class="right">' . $this->html($this->formatQuantity((float) $movement['quantity'], (int) $movement['decimalPlaces'])) . '</td>'
            . '<td>' . $this->html($movement['reference']) . '</td>'
            . '<td class="right">' . $this->html(number_format((float) $movement['price'], 2)) . '</td>'
            . '<td class="right">' . $this->html(number_format((float) $movement['discountPercent'], 2)) . '%</td>'
            . '<td class="right">' . $this->html($this->formatQuantity((float) $movement['newOnHand'], (int) $movement['decimalPlaces'])) . '</td>'
            . '<td>' . $this->html($this->serialText($movement)) . '</td>'
            . '</tr>';
    }

    private function serialText(array $movement): string
    {
        $serials = $movement['serials'] ?? [];
        if (count($serials) === 0) {
            return '';
        }

        return collect($serials)
            ->map(function ($serial) use ($movement) {
                if ((bool) ($movement['serialised'] ?? false)) {
                    return (string) $serial['serialNo'];
                }
                return (string) $serial['serialNo'] . ' Qty- ' . $this->formatQuantity((float) $serial['quantity'], (int) $movement['decimalPlaces']);
            })
            ->implode('; ');
    }

    private function serialsForMovements(array $movementNumbers): array
    {
        if (!Schema::hasTable('stockserialmoves') || count($movementNumbers) === 0) {
            return [];
        }

        $serials = [];
        DB::table('stockserialmoves')
            ->select('stockmoveno', 'serialno', 'moveqty')
            ->whereIn('stockmoveno', $movementNumbers)
            ->orderBy('serialno')
            ->get()
            ->each(function ($row) use (&$serials) {
                $movementNumber = (int) $row->stockmoveno;
                $serials[$movementNumber][] = [
                    'serialNo' => (string) $row->serialno,
                    'quantity' => (float) $row->moveqty,
                ];
            });

        return $serials;
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

    private function movementItemOptions(string $search = '', int $limit = 50)
    {
        if ($search === '') {
            $stockIds = DB::table('stockmoves')
                ->where('hidemovt', 0)
                ->orderByDesc('stkmoveno')
                ->limit($limit * 30)
                ->pluck('stockid')
                ->map(fn ($value) => (string) $value)
                ->unique()
                ->take($limit)
                ->values();

            if ($stockIds->isEmpty()) {
                return collect();
            }

            $rowsById = DB::table('stockmaster')
                ->select('stockid', 'description', 'longdescription')
                ->whereIn('stockid', $stockIds->all())
                ->get()
                ->keyBy(fn ($row) => (string) $row->stockid);

            return $stockIds
                ->map(fn ($stockId) => $rowsById->get($stockId))
                ->filter()
                ->map(fn ($row) => $this->itemOptionPayload($row))
                ->values();
        }

        return DB::table('stockmaster as sm')
            ->select('sm.stockid', 'sm.description', 'sm.longdescription')
            ->whereExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('stockmoves as smv')
                    ->whereColumn('smv.stockid', 'sm.stockid')
                    ->where('smv.hidemovt', 0);
            })
            ->where(function ($query) use ($search) {
                $query->where('sm.stockid', 'like', '%' . $search . '%')
                    ->orWhere('sm.description', 'like', '%' . $search . '%')
                    ->orWhere('sm.longdescription', 'like', '%' . $search . '%');
            })
            ->orderBy('sm.stockid')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => $this->itemOptionPayload($row))
            ->values();
    }

    private function itemOptionPayload($row): array
    {
        $description = html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid));

        return [
            'value' => (string) $row->stockid,
            'label' => (string) $row->stockid . ' - ' . $description,
            'code' => (string) $row->stockid,
            'searchText' => trim((string) $row->stockid . ' ' . $description . ' ' . html_entity_decode((string) ($row->longdescription ?? ''))),
        ];
    }

    private function movementTypes()
    {
        $usedTypes = DB::table('stockmoves')
            ->select('type')
            ->distinct()
            ->pluck('type')
            ->map(fn ($value) => (int) $value)
            ->all();

        return DB::table('systypes')
            ->select('typeid', 'typename')
            ->whereIn('typeid', $usedTypes)
            ->orderBy('typename')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->typeid,
                'label' => html_entity_decode((string) $row->typename),
                'code' => (string) $row->typeid,
            ])
            ->values();
    }

    private function summary($movements): array
    {
        $inboundQuantity = 0.0;
        $outboundQuantity = 0.0;
        $value = 0.0;
        $items = [];
        $locations = [];
        $lastDate = null;

        foreach ($movements as $movement) {
            $quantity = (float) $movement['quantity'];
            if ($quantity > 0) {
                $inboundQuantity += $quantity;
            } elseif ($quantity < 0) {
                $outboundQuantity += abs($quantity);
            }
            $value += (float) $movement['movementValue'];
            $items[(string) $movement['stockId']] = true;
            $locations[(string) $movement['location']] = true;
            $date = (string) $movement['date'];
            if ($lastDate === null || $date > $lastDate) {
                $lastDate = $date;
            }
        }

        return [
            'movementLines' => count($movements),
            'itemsMoved' => count($items),
            'locationsMoved' => count($locations),
            'inboundQuantity' => $inboundQuantity,
            'outboundQuantity' => $outboundQuantity,
            'movementValue' => $value,
            'lastMovementDate' => $lastDate,
        ];
    }

    private function emptySummary(): array
    {
        return [
            'movementLines' => 0,
            'itemsMoved' => 0,
            'locationsMoved' => 0,
            'inboundQuantity' => 0,
            'outboundQuantity' => 0,
            'movementValue' => 0,
            'lastMovementDate' => null,
        ];
    }

    private function currency(): string
    {
        if (!Schema::hasTable('companies')) {
            return 'TZS';
        }

        return (string) (DB::table('companies')->where('coycode', 1)->value('currencydefault') ?: 'TZS');
    }

    private function locationName(string $location): string
    {
        $name = DB::table('locations')->where('loccode', $location)->value('locationname');
        return html_entity_decode((string) ($name ?: $location));
    }

    private function itemName(string $item): string
    {
        $row = DB::table('stockmaster')->select('stockid', 'description', 'longdescription')->where('stockid', $item)->first();
        if (!$row) {
            return $item;
        }

        return (string) $row->stockid . ' - ' . html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid));
    }

    private function movementTypeName(int $type): string
    {
        $name = DB::table('systypes')->where('typeid', $type)->value('typename');
        return html_entity_decode((string) ($name ?: $type));
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

    private function displayDate(string $value): string
    {
        try {
            return Carbon::parse($value)->format('d M Y');
        } catch (\Throwable) {
            return $value;
        }
    }

    private function formatMoney(float $value, string $currency): string
    {
        return $currency . ' ' . number_format($value, 2);
    }

    private function formatQuantity(float $value, int $decimalPlaces): string
    {
        return number_format($value, max(0, $decimalPlaces));
    }

    private function exportFilename(array $context, string $extension): string
    {
        $item = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string) $context['item']) ?: 'all-items';
        $date = Carbon::now()->format('Y-m-d');
        return 'stock-movements-' . trim($item, '-') . '-' . $date . '.' . $extension;
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

        return $zip
            . $centralDirectory
            . pack('VvvvvVVv', 0x06054b50, 0, 0, count($files), count($files), strlen($centralDirectory), $offset, 0);
    }

    private function zipDosDateTime(): array
    {
        $time = getdate();

        return [
            (($time['hours'] & 0x1f) << 11) | (($time['minutes'] & 0x3f) << 5) | ((int) floor($time['seconds'] / 2) & 0x1f),
            (($time['year'] - 1980) << 9) | (($time['mon'] & 0x0f) << 5) | ($time['mday'] & 0x1f),
        ];
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
        if (mb_strlen($text) <= $chars) {
            return $text;
        }

        return rtrim(mb_substr($text, 0, max(1, $chars - 3))) . '...';
    }

    private function html($value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }

    private function xml($value): string
    {
        return htmlspecialchars((string) $value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    private function queryDate($value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        try {
            return Carbon::parse((string) $value)->toDateString();
        } catch (\Throwable) {
            return null;
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

    private function safeLimit($value, int $min, int $max): int
    {
        $limit = (int) $value;
        if ($limit < $min) return $min;
        if ($limit > $max) return $max;
        return $limit;
    }
}
