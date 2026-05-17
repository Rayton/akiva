<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class PrintPriceLabelController extends Controller
{
    private const CODE39_PATTERNS = [
        '0' => 'nnnwwnwnn',
        '1' => 'wnnwnnnnw',
        '2' => 'nnwwnnnnw',
        '3' => 'wnwwnnnnn',
        '4' => 'nnnwwnnnw',
        '5' => 'wnnwwnnnn',
        '6' => 'nnwwwnnnn',
        '7' => 'nnnwnnwnw',
        '8' => 'wnnwnnwnn',
        '9' => 'nnwwnnwnn',
        'A' => 'wnnnnwnnw',
        'B' => 'nnwnnwnnw',
        'C' => 'wnwnnwnnn',
        'D' => 'nnnnwwnnw',
        'E' => 'wnnnwwnnn',
        'F' => 'nnwnwwnnn',
        'G' => 'nnnnnwwnw',
        'H' => 'wnnnnwwnn',
        'I' => 'nnwnnwwnn',
        'J' => 'nnnnwwwnn',
        'K' => 'wnnnnnnww',
        'L' => 'nnwnnnnww',
        'M' => 'wnwnnnnwn',
        'N' => 'nnnnwnnww',
        'O' => 'wnnnwnnwn',
        'P' => 'nnwnwnnwn',
        'Q' => 'nnnnnnwww',
        'R' => 'wnnnnnwwn',
        'S' => 'nnwnnnwwn',
        'T' => 'nnnnwnwwn',
        'U' => 'wwnnnnnnw',
        'V' => 'nwwnnnnnw',
        'W' => 'wwwnnnnnn',
        'X' => 'nwnnwnnnw',
        'Y' => 'wwnnwnnnn',
        'Z' => 'nwwnwnnnn',
        '-' => 'nwnnnnwnw',
        '.' => 'wwnnnnwnn',
        ' ' => 'nwwnnnwnn',
        '$' => 'nwnwnwnnn',
        '/' => 'nwnwnnnwn',
        '+' => 'nwnnnwnwn',
        '%' => 'nnnwnwnwn',
        '*' => 'nwnnwnwnn',
    ];

    public function workbench()
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => true,
                'data' => [
                    'labels' => [],
                    'categories' => [],
                    'salesTypes' => [],
                    'currencies' => [],
                    'defaults' => [
                        'labelId' => null,
                        'category' => 'All',
                        'salesType' => '',
                        'currency' => 'TZS',
                        'effectiveDate' => Carbon::today()->toDateString(),
                        'labelsPerItem' => 1,
                    ],
                    'summary' => [
                        'pricedItems' => 0,
                        'templates' => 0,
                        'priceLists' => 0,
                    ],
                ],
            ]);
        }

        try {
            $this->ensureDefaultLabelTemplate();

            $labels = $this->labels();
            $salesTypes = $this->salesTypes();
            $currencies = $this->currencies();
            $effectiveDate = Carbon::today()->toDateString();
            $defaultSalesType = (string) ($salesTypes[0]['value'] ?? '');
            $defaultCurrency = $this->defaultCurrency($currencies);

            return response()->json([
                'success' => true,
                'data' => [
                    'labels' => $labels,
                    'categories' => $this->categories(),
                    'salesTypes' => $salesTypes,
                    'currencies' => $currencies,
                    'defaults' => [
                        'labelId' => $labels[0]['id'] ?? null,
                        'category' => $this->defaultCategory($defaultSalesType, $defaultCurrency, $effectiveDate),
                        'salesType' => $defaultSalesType,
                        'currency' => $defaultCurrency,
                        'effectiveDate' => $effectiveDate,
                        'labelsPerItem' => 1,
                    ],
                    'summary' => [
                        'pricedItems' => $this->pricedItemCount($defaultSalesType, $defaultCurrency, $effectiveDate),
                        'templates' => count($labels),
                        'priceLists' => count($salesTypes),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Price labels could not be loaded.',
            ], 500);
        }
    }

    public function items(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json(['success' => true, 'data' => []]);
        }

        try {
            $category = trim((string) $request->query('category', 'All'));
            $salesType = trim((string) $request->query('salesType', ''));
            $currency = strtoupper(trim((string) $request->query('currency', '')));
            $effectiveDate = $this->queryDate($request->query('effectiveDate')) ?? Carbon::today()->toDateString();
            $search = trim((string) $request->query('q', ''));
            $limit = $this->safeLimit($request->query('limit', 100), 20, 300);

            if ($salesType === '' || $currency === '') {
                return response()->json(['success' => true, 'data' => []]);
            }

            return response()->json([
                'success' => true,
                'data' => $this->pricedItems($category, $salesType, $currency, $effectiveDate, $search, $limit),
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Price label items could not be loaded.',
            ], 500);
        }
    }

    public function print(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Price labels are not available.',
            ], 503);
        }

        $validator = Validator::make($request->all(), [
            'labelId' => ['required', 'integer', 'min:1'],
            'category' => ['nullable', 'string', 'max:20'],
            'salesType' => ['required', 'string', 'max:2'],
            'currency' => ['required', 'string', 'max:3'],
            'effectiveDate' => ['required', 'date'],
            'labelsPerItem' => ['required', 'integer', 'min:1', 'max:500'],
            'stockIds' => ['required', 'array', 'min:1', 'max:500'],
            'stockIds.*' => ['required', 'string', 'max:20'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Choose the labels to print.',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $this->ensureDefaultLabelTemplate();

            $label = $this->label((int) $request->input('labelId'));
            if ($label === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Choose a valid label template.',
                ], 422);
            }

            $effectiveDate = $this->queryDate($request->input('effectiveDate')) ?? Carbon::today()->toDateString();
            $stockIds = collect($request->input('stockIds', []))
                ->map(fn ($value) => strtoupper(trim((string) $value)))
                ->filter()
                ->unique()
                ->values()
                ->all();

            $items = $this->pricedItems(
                (string) $request->input('category', 'All'),
                (string) $request->input('salesType'),
                strtoupper((string) $request->input('currency')),
                $effectiveDate,
                '',
                500,
                $stockIds
            );

            if ($items->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'No current prices were found for the selected items.',
                ], 422);
            }

            $company = $this->companyProfile();
            $labelsPerItem = (int) $request->input('labelsPerItem', 1);
            $html = $this->labelPdfHtml($label, $items, $labelsPerItem, $company, $effectiveDate);

            $options = new Options();
            $options->set('defaultFont', 'DejaVu Sans');
            $options->set('isRemoteEnabled', false);
            $options->set('isHtml5ParserEnabled', true);

            $dompdf = new Dompdf($options);
            $dompdf->loadHtml($html, 'UTF-8');
            $dompdf->setPaper([0, 0, $this->mmToPoints($label['pageWidth']), $this->mmToPoints($label['pageHeight'])]);
            $dompdf->render();

            $filename = 'price-labels-' . Carbon::now()->format('Ymd-His') . '.pdf';

            return response($dompdf->output(), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="' . $filename . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Price labels could not be printed.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('labels')
            && Schema::hasTable('labelfields')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('stockcategory')
            && Schema::hasTable('prices')
            && Schema::hasTable('salestypes')
            && Schema::hasTable('currencies');
    }

    private function labels()
    {
        return DB::table('labels')
            ->whereNull('deleted_at')
            ->orderBy('description')
            ->get()
            ->map(fn ($row) => $this->labelPayload($row))
            ->values()
            ->all();
    }

    private function label(int $labelId): ?array
    {
        $row = DB::table('labels')->where('labelid', $labelId)->whereNull('deleted_at')->first();
        return $row ? $this->labelPayload($row) : null;
    }

    private function labelPayload($row): array
    {
        $fields = DB::table('labelfields')
            ->where('labelid', (int) $row->labelid)
            ->whereNull('deleted_at')
            ->orderBy('vpos')
            ->orderBy('hpos')
            ->get()
            ->map(fn ($field) => [
                'id' => (int) $field->labelfieldid,
                'fieldValue' => (string) $field->fieldvalue,
                'vPos' => (float) $field->vpos,
                'hPos' => (float) $field->hpos,
                'fontSize' => (int) $field->fontsize,
                'barcode' => (bool) $field->barcode,
            ])
            ->values()
            ->all();

        $pageWidth = (float) $row->pagewidth;
        $pageHeight = (float) $row->pageheight;
        $rowHeight = (float) $row->rowheight;
        $columnWidth = (float) $row->columnwidth;
        $topMargin = (float) $row->topmargin;
        $leftMargin = (float) $row->leftmargin;

        return [
            'id' => (int) $row->labelid,
            'description' => html_entity_decode((string) $row->description),
            'pageWidth' => $pageWidth,
            'pageHeight' => $pageHeight,
            'height' => (float) $row->height,
            'width' => (float) $row->width,
            'topMargin' => $topMargin,
            'leftMargin' => $leftMargin,
            'rowHeight' => $rowHeight,
            'columnWidth' => $columnWidth,
            'rows' => $rowHeight > 0 ? max(1, (int) floor(($pageHeight - $topMargin) / $rowHeight)) : 1,
            'columns' => $columnWidth > 0 ? max(1, (int) floor(($pageWidth - $leftMargin) / $columnWidth)) : 1,
            'fields' => $fields,
        ];
    }

    private function categories()
    {
        return DB::table('stockcategory')
            ->select('categoryid', 'categorydescription')
            ->orderBy('categorydescription')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->categoryid,
                'label' => html_entity_decode((string) $row->categorydescription),
                'code' => (string) $row->categoryid,
            ])
            ->values()
            ->all();
    }

    private function salesTypes()
    {
        return DB::table('salestypes')
            ->select('typeabbrev', 'sales_type')
            ->orderBy('sales_type')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->typeabbrev,
                'label' => html_entity_decode((string) $row->sales_type),
                'code' => (string) $row->typeabbrev,
            ])
            ->values()
            ->all();
    }

    private function currencies()
    {
        return DB::table('currencies')
            ->select('currabrev', 'currency', 'decimalplaces')
            ->orderBy('currabrev')
            ->get()
            ->map(fn ($row) => [
                'value' => (string) $row->currabrev,
                'label' => (string) $row->currabrev . ' - ' . html_entity_decode((string) $row->currency),
                'code' => (string) $row->currabrev,
                'decimalPlaces' => (int) $row->decimalplaces,
            ])
            ->values()
            ->all();
    }

    private function pricedItems(string $category, string $salesType, string $currency, string $effectiveDate, string $search = '', int $limit = 100, array $stockIds = [])
    {
        $query = DB::table('prices as p')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'p.stockid')
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->leftJoin('currencies as c', 'c.currabrev', '=', 'p.currabrev')
            ->select(
                'p.stockid',
                'p.typeabbrev',
                'p.currabrev',
                'p.price',
                'p.units as price_units',
                'p.startdate',
                'p.enddate',
                'p.decimalplaces as price_decimalplaces',
                'sm.description',
                'sm.longdescription',
                'sm.barcode',
                'sm.categoryid',
                'sm.units',
                'sm.decimalplaces as stock_decimalplaces',
                'sc.categorydescription',
                'c.decimalplaces as currency_decimalplaces'
            )
            ->where('p.typeabbrev', $salesType)
            ->where('p.currabrev', $currency)
            ->where('p.debtorno', '')
            ->where('p.branchcode', '')
            ->whereDate('p.startdate', '<=', $effectiveDate)
            ->where(function ($query) use ($effectiveDate) {
                $query->where('p.enddate', '0000-00-00')
                    ->orWhereDate('p.enddate', '>=', $effectiveDate);
            })
            ->where('sm.discontinued', 0);

        if ($category !== '' && strtolower($category) !== 'all') {
            $query->where('sm.categoryid', $category);
        }

        if ($search !== '') {
            $query->where(function ($query) use ($search) {
                $query->where('p.stockid', 'like', '%' . $search . '%')
                    ->orWhere('sm.description', 'like', '%' . $search . '%')
                    ->orWhere('sm.longdescription', 'like', '%' . $search . '%')
                    ->orWhere('sm.barcode', 'like', '%' . $search . '%');
            });
        }

        if (count($stockIds) > 0) {
            $query->whereIn('p.stockid', $stockIds);
        }

        return $query
            ->orderBy('p.stockid')
            ->orderByDesc('p.startdate')
            ->limit($limit)
            ->get()
            ->unique('stockid')
            ->map(fn ($row) => [
                'stockId' => (string) $row->stockid,
                'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
                'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
                'barcode' => (string) ($row->barcode ?: $row->stockid),
                'category' => (string) $row->categoryid,
                'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid)),
                'price' => (float) $row->price,
                'currency' => (string) $row->currabrev,
                'priceList' => (string) $row->typeabbrev,
                'units' => (string) ($row->price_units ?: $row->units ?: ''),
                'decimalPlaces' => (int) ($row->currency_decimalplaces ?? $row->price_decimalplaces ?? 2),
                'quantityDecimalPlaces' => (int) ($row->stock_decimalplaces ?? 0),
                'startDate' => (string) $row->startdate,
                'endDate' => (string) $row->enddate,
            ])
            ->values();
    }

    private function defaultCurrency($currencies): string
    {
        $companyCurrency = Schema::hasTable('companies')
            ? (string) (DB::table('companies')->where('coycode', 1)->value('currencydefault') ?? '')
            : '';

        if ($companyCurrency !== '') {
            foreach ($currencies as $currency) {
                if ((string) $currency['value'] === $companyCurrency) {
                    return $companyCurrency;
                }
            }
        }

        return (string) ($currencies[0]['value'] ?? 'TZS');
    }

    private function defaultCategory(string $salesType, string $currency, string $effectiveDate): string
    {
        if ($salesType === '' || $currency === '') {
            return 'All';
        }

        $row = DB::table('prices as p')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'p.stockid')
            ->select('sm.categoryid', DB::raw('COUNT(*) as priced_count'))
            ->where('p.typeabbrev', $salesType)
            ->where('p.currabrev', $currency)
            ->where('p.debtorno', '')
            ->where('p.branchcode', '')
            ->whereDate('p.startdate', '<=', $effectiveDate)
            ->where(function ($query) use ($effectiveDate) {
                $query->where('p.enddate', '0000-00-00')
                    ->orWhereDate('p.enddate', '>=', $effectiveDate);
            })
            ->where('sm.discontinued', 0)
            ->groupBy('sm.categoryid')
            ->orderByDesc('priced_count')
            ->first();

        return $row ? (string) $row->categoryid : 'All';
    }

    private function pricedItemCount(string $salesType, string $currency, string $effectiveDate): int
    {
        if ($salesType === '' || $currency === '') {
            return 0;
        }

        return DB::table('prices as p')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'p.stockid')
            ->where('p.typeabbrev', $salesType)
            ->where('p.currabrev', $currency)
            ->where('p.debtorno', '')
            ->where('p.branchcode', '')
            ->whereDate('p.startdate', '<=', $effectiveDate)
            ->where(function ($query) use ($effectiveDate) {
                $query->where('p.enddate', '0000-00-00')
                    ->orWhereDate('p.enddate', '>=', $effectiveDate);
            })
            ->where('sm.discontinued', 0)
            ->distinct('p.stockid')
            ->count('p.stockid');
    }

    private function labelPdfHtml(array $label, $items, int $labelsPerItem, array $company, string $effectiveDate): string
    {
        $copies = [];
        foreach ($items as $item) {
            for ($i = 0; $i < $labelsPerItem; $i++) {
                $copies[] = $item;
            }
        }

        $columns = max(1, (int) ($label['columns'] ?? 1));
        $rows = max(1, (int) ($label['rows'] ?? 1));
        $labelsPerPage = max(1, $columns * $rows);
        $sheets = array_chunk($copies, $labelsPerPage);
        $pages = '';

        foreach ($sheets as $sheet) {
            $labelsHtml = '';
            foreach ($sheet as $index => $item) {
                $column = intdiv($index, $rows);
                $row = $index % $rows;
                $left = (float) $label['leftMargin'] + ($column * (float) $label['columnWidth']);
                $top = (float) $label['topMargin'] + ($row * (float) $label['rowHeight']);
                $labelsHtml .= '<div class="label" style="left:' . $this->cssNumber($left) . 'mm;top:' . $this->cssNumber($top) . 'mm;width:' . $this->cssNumber((float) $label['width']) . 'mm;height:' . $this->cssNumber((float) $label['height']) . 'mm;">'
                    . $this->labelFieldsHtml($label, $item, $company)
                    . '</div>';
            }

            $pages .= '<section class="sheet">' . $labelsHtml . '</section>';
        }

        $printedAt = Carbon::now()->format('d M Y, H:i');

        return '<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: ' . $this->cssNumber((float) $label['pageWidth']) . 'mm ' . $this->cssNumber((float) $label['pageHeight']) . 'mm; margin: 0; }
    * { box-sizing: border-box; }
    body { color: #211019; font-family: DejaVu Sans, sans-serif; margin: 0; }
    .sheet { height: ' . $this->cssNumber((float) $label['pageHeight']) . 'mm; page-break-after: always; position: relative; width: ' . $this->cssNumber((float) $label['pageWidth']) . 'mm; }
    .sheet:last-child { page-break-after: auto; }
    .label { border: .2mm solid #eadbe3; border-radius: 1.4mm; overflow: hidden; position: absolute; }
    .field { color: #211019; line-height: 1.15; overflow: hidden; position: absolute; white-space: nowrap; }
    .price { color: #d81b72; font-weight: 700; }
    .barcode { color: #111827; font-family: DejaVu Sans Mono, monospace; letter-spacing: .04em; }
    .barcode-block { line-height: 0; overflow: hidden; white-space: nowrap; }
    .barcode-bar { display: inline-block; height: 100%; vertical-align: top; }
    .logo { object-fit: contain; }
    .tiny-note { bottom: 1.2mm; color: #9a8290; font-size: 5pt; left: 2mm; position: absolute; right: 2mm; text-align: right; }
  </style>
</head>
<body>
  ' . $pages . '
  <!-- Printed ' . $this->html($printedAt) . ' for prices effective ' . $this->html($this->displayDate($effectiveDate)) . ' -->
</body>
</html>';
    }

    private function labelFieldsHtml(array $label, array $item, array $company): string
    {
        $fields = $label['fields'];
        if (count($fields) === 0) {
            $fields = [
                ['fieldValue' => 'itemcode', 'vPos' => 3, 'hPos' => 3, 'fontSize' => 9, 'barcode' => true],
                ['fieldValue' => 'itemdescription', 'vPos' => 12, 'hPos' => 3, 'fontSize' => 8, 'barcode' => false],
                ['fieldValue' => 'price', 'vPos' => 22, 'hPos' => 3, 'fontSize' => 11, 'barcode' => false],
            ];
        }

        $html = '';
        foreach ($fields as $field) {
            $fieldValue = strtolower((string) ($field['fieldValue'] ?? ''));
            $fontSize = max(4, (int) ($field['fontSize'] ?? 9));
            $isBarcode = (bool) ($field['barcode'] ?? false);
            $text = $this->fieldText($fieldValue, $item, $company);
            $class = 'field' . ($fieldValue === 'price' ? ' price' : '') . ($isBarcode || $fieldValue === 'barcode' ? ' barcode' : '');

            if ($fieldValue === 'logo' && $company['logo'] !== '') {
                $html .= '<img class="field logo" src="' . $this->html($company['logo']) . '" style="left:' . $this->cssNumber((float) $field['hPos']) . 'mm;top:' . $this->cssNumber((float) $field['vPos']) . 'mm;max-width:18mm;max-height:10mm;" alt="Logo">';
                continue;
            }

            if ($isBarcode || $fieldValue === 'barcode') {
                $barcodeWidth = max(4.0, (float) $label['width'] - (float) $field['hPos'] - 2.0);
                $barcodeHeight = max(5.0, min(12.0, (float) $label['height'] - (float) $field['vPos'] - 2.0));
                $html .= '<div class="' . $class . ' barcode-block" style="left:' . $this->cssNumber((float) $field['hPos']) . 'mm;top:' . $this->cssNumber((float) $field['vPos']) . 'mm;height:' . $this->cssNumber($barcodeHeight) . 'mm;right:2mm;">'
                    . $this->barcodeHtml($text, $barcodeWidth)
                    . '</div>';
                continue;
            }

            $html .= '<div class="' . $class . '" style="left:' . $this->cssNumber((float) $field['hPos']) . 'mm;top:' . $this->cssNumber((float) $field['vPos']) . 'mm;font-size:' . $fontSize . 'pt;right:2mm;">' . $this->html($text) . '</div>';
        }

        return $html;
    }

    private function barcodeHtml(string $value, float $availableWidth): string
    {
        [$runs, $totalUnits] = $this->code39Runs($value);
        $unitWidth = max(0.14, min(0.36, $availableWidth / max(1, $totalUnits)));
        $html = '';

        foreach ($runs as $run) {
            $style = 'width:' . $this->cssNumber($run['width'] * $unitWidth) . 'mm;';
            $style .= $run['bar'] ? 'background:#111827;' : 'background:transparent;';
            $html .= '<span class="barcode-bar" style="' . $style . '"></span>';
        }

        return $html;
    }

    private function code39Runs(string $value): array
    {
        $text = $this->sanitizeBarcodeValue($value);
        $characters = str_split('*' . $text . '*');
        $runs = [];
        $totalUnits = 0;

        foreach ($characters as $characterIndex => $character) {
            $pattern = self::CODE39_PATTERNS[$character] ?? self::CODE39_PATTERNS['-'];
            $parts = str_split($pattern);

            foreach ($parts as $partIndex => $part) {
                $width = $part === 'w' ? 3 : 1;
                $runs[] = [
                    'bar' => $partIndex % 2 === 0,
                    'width' => $width,
                ];
                $totalUnits += $width;
            }

            if ($characterIndex < count($characters) - 1) {
                $runs[] = ['bar' => false, 'width' => 1];
                $totalUnits += 1;
            }
        }

        return [$runs, $totalUnits, $text];
    }

    private function sanitizeBarcodeValue(string $value): string
    {
        $sanitized = '';
        foreach (str_split(strtoupper($value)) as $character) {
            $sanitized .= isset(self::CODE39_PATTERNS[$character]) && $character !== '*' ? $character : '-';
        }

        $sanitized = (string) preg_replace('/-+/', '-', trim($sanitized, '-'));

        return substr($sanitized !== '' ? $sanitized : 'A1001', 0, 24);
    }

    private function fieldText(string $fieldValue, array $item, array $company): string
    {
        return match ($fieldValue) {
            'itemcode' => (string) $item['stockId'],
            'itemdescription' => (string) $item['description'],
            'price' => $this->formatMoney((float) $item['price'], (string) $item['currency'], (int) $item['decimalPlaces']),
            'barcode' => (string) ($item['barcode'] ?: $item['stockId']),
            'logo' => (string) $company['name'],
            default => '',
        };
    }

    private function companyProfile(): array
    {
        $company = Schema::hasTable('companies')
            ? DB::table('companies')->where('coycode', 1)->first()
            : null;

        return [
            'name' => html_entity_decode((string) ($company->coyname ?? 'Akiva')),
            'currency' => (string) ($company->currencydefault ?? 'TZS'),
            'logo' => $this->companyLogoDataUri(),
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

    private function ensureDefaultLabelTemplate(): void
    {
        $exists = DB::table('labels')->whereNull('deleted_at')->exists();
        if ($exists) {
            return;
        }

        $now = Carbon::now()->toDateTimeString();
        $labelId = DB::table('labels')->insertGetId([
            'description' => 'Item price label',
            'pagewidth' => 210,
            'pageheight' => 297,
            'height' => 30,
            'width' => 70,
            'topmargin' => 0,
            'leftmargin' => 0,
            'rowheight' => 30,
            'columnwidth' => 70,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('labelfields')->insert([
            ['labelid' => $labelId, 'fieldvalue' => 'itemcode', 'vpos' => 5, 'hpos' => 5, 'fontsize' => 10, 'barcode' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['labelid' => $labelId, 'fieldvalue' => 'itemdescription', 'vpos' => 14, 'hpos' => 5, 'fontsize' => 8, 'barcode' => 0, 'created_at' => $now, 'updated_at' => $now],
            ['labelid' => $labelId, 'fieldvalue' => 'price', 'vpos' => 23, 'hpos' => 5, 'fontsize' => 11, 'barcode' => 0, 'created_at' => $now, 'updated_at' => $now],
        ]);
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

    private function displayDate(string $value): string
    {
        try {
            return Carbon::parse($value)->format('d M Y');
        } catch (\Throwable) {
            return $value;
        }
    }

    private function formatMoney(float $value, string $currency, int $decimalPlaces = 2): string
    {
        return $currency . ' ' . number_format($value, max(0, $decimalPlaces));
    }

    private function safeLimit($value, int $min, int $max): int
    {
        $limit = (int) $value;
        if ($limit < $min) return $min;
        if ($limit > $max) return $max;
        return $limit;
    }

    private function mmToPoints(float $mm): float
    {
        return $mm * 72 / 25.4;
    }

    private function cssNumber(float $value): string
    {
        return rtrim(rtrim(number_format($value, 3, '.', ''), '0'), '.');
    }

    private function html($value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }
}
