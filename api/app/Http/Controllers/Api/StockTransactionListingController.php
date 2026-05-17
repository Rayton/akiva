<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockTransactionListingController extends Controller
{
    private const LEGACY_TYPES = [
        10 => 'Sales Invoice',
        11 => 'Sales Credit Note',
        16 => 'Location Transfer',
        17 => 'Stock Adjustment',
        25 => 'Purchase Order Delivery',
        26 => 'Work Order Receipt',
        28 => 'Work Order Issue',
    ];

    public function workbench(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json(['success' => true, 'data' => $this->emptyPayload()]);
        }

        try {
            @ini_set('memory_limit', '512M');
            @set_time_limit(90);

            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            return response()->json([
                'success' => true,
                'data' => [
                    'locations' => $this->locations($filters['userId']),
                    'transactionTypes' => $this->transactionTypes(),
                    'rows' => $rows->values(),
                    'summary' => $this->summary($rows),
                    'filters' => $filters,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock transaction listing could not be loaded.',
            ], 500);
        }
    }

    public function exportPdf(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Stock transaction listing data is not available.',
            ], 503);
        }

        try {
            @ini_set('memory_limit', '512M');
            @set_time_limit(120);

            $filters = $this->filters($request, true);
            $rows = $this->rows($filters);

            if ($rows->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no stock transactions for the selected filters.',
                ], 422);
            }

            $options = new Options();
            $options->set('isRemoteEnabled', true);
            $options->set('isHtml5ParserEnabled', true);

            $dompdf = new Dompdf($options);
            $dompdf->loadHtml($this->pdfHtml($rows, [
                'company' => $this->companyProfile(),
                'filters' => $filters,
                'summary' => $this->summary($rows),
                'location' => $this->locationLabel($filters['location']),
                'transactionType' => $this->typeLabel($filters['type']),
            ]), 'UTF-8');
            $dompdf->setPaper('A4', 'landscape');
            $dompdf->render();

            return response($dompdf->output(), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="stock-transaction-listing-' . Carbon::now()->format('Y-m-d') . '.pdf"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock transaction listing PDF could not be created.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('stockmoves')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('locations')
            && Schema::hasTable('locationusers');
    }

    private function emptyPayload(): array
    {
        return [
            'locations' => [],
            'transactionTypes' => [],
            'rows' => [],
            'summary' => [
                'lines' => 0,
                'items' => 0,
                'locations' => 0,
                'inboundQuantity' => 0,
                'outboundQuantity' => 0,
                'netQuantity' => 0,
            ],
            'filters' => [],
        ];
    }

    private function filters(Request $request, bool $forExport = false): array
    {
        $userId = $this->currentUserId($request);
        $location = strtoupper(trim((string) $request->query('location', $request->query('StockLocation', 'All'))));
        if ($location !== 'ALL' && !$this->canViewLocation($userId, $location)) {
            $location = 'All';
        }

        $from = $this->validDate((string) $request->query('dateFrom', $request->query('from', $request->query('FromDate', ''))), Carbon::today()->subMonths(2)->startOfMonth()->toDateString());
        $to = $this->validDate((string) $request->query('dateTo', $request->query('to', $request->query('ToDate', ''))), Carbon::today()->toDateString());
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        $type = trim((string) $request->query('type', $request->query('TransType', 'All')));
        if ($type !== 'All' && !array_key_exists((int) $type, self::LEGACY_TYPES)) {
            $type = 'All';
        }

        return [
            'userId' => $userId,
            'location' => $location === 'ALL' ? 'All' : $location,
            'type' => $type === 'All' ? 'All' : (string) (int) $type,
            'search' => trim((string) $request->query('q', '')),
            'dateFrom' => $from,
            'dateTo' => $to,
            'limit' => $this->safeLimit($request->query('limit', $forExport ? 3000 : 1000), 50, $forExport ? 10000 : 3000),
        ];
    }

    private function rows(array $filters)
    {
        $query = DB::table('stockmoves as smv')
            ->leftJoin('stockmaster as sm', 'sm.stockid', '=', 'smv.stockid')
            ->leftJoin('locations as loc', 'loc.loccode', '=', 'smv.loccode')
            ->join('locationusers as lu', function ($join) use ($filters) {
                $join->on('lu.loccode', '=', 'smv.loccode')
                    ->where('lu.userid', '=', $filters['userId'])
                    ->where('lu.canview', '=', 1);
            })
            ->select(
                'smv.stkmoveno',
                'smv.type',
                'smv.stockid',
                'smv.transno',
                'smv.trandate',
                'smv.qty',
                'smv.reference',
                'smv.narrative',
                'smv.loccode',
                'loc.locationname',
                'sm.description',
                'sm.longdescription',
                'sm.decimalplaces',
                'sm.units'
            )
            ->whereIn('smv.type', array_keys(self::LEGACY_TYPES))
            ->whereDate('smv.trandate', '>=', $filters['dateFrom'])
            ->whereDate('smv.trandate', '<=', $filters['dateTo']);

        if ($filters['type'] !== 'All') {
            $query->where('smv.type', (int) $filters['type']);
        }

        if ($filters['location'] !== 'All') {
            $query->where('smv.loccode', $filters['location']);
        }

        if ($filters['search'] !== '') {
            $search = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $filters['search']) . '%';
            $query->where(function ($inner) use ($search) {
                $inner->where('smv.stockid', 'like', $search)
                    ->orWhere('sm.description', 'like', $search)
                    ->orWhere('sm.longdescription', 'like', $search)
                    ->orWhere('smv.transno', 'like', $search)
                    ->orWhere('smv.reference', 'like', $search)
                    ->orWhere('smv.narrative', 'like', $search)
                    ->orWhere('loc.locationname', 'like', $search)
                    ->orWhere('smv.loccode', 'like', $search);
            });
        }

        return $query
            ->orderBy('smv.trandate')
            ->orderBy('smv.type')
            ->orderBy('smv.transno')
            ->orderBy('smv.stkmoveno')
            ->limit($filters['limit'])
            ->get()
            ->map(fn ($row) => $this->mapRow($row));
    }

    private function mapRow($row): array
    {
        $decimalPlaces = (int) ($row->decimalplaces ?? 2);
        $quantity = round((float) $row->qty, max(0, min(6, $decimalPlaces)));
        $type = (int) $row->type;

        return [
            'movementNumber' => (int) $row->stkmoveno,
            'type' => $type,
            'typeName' => self::LEGACY_TYPES[$type] ?? 'Transaction',
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'transactionNumber' => (int) $row->transno,
            'date' => Carbon::parse((string) $row->trandate)->toDateString(),
            'quantity' => $quantity,
            'absoluteQuantity' => abs($quantity),
            'reference' => html_entity_decode((string) ($row->reference ?: '')),
            'narrative' => html_entity_decode((string) ($row->narrative ?: '')),
            'location' => (string) $row->loccode,
            'locationName' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
            'units' => (string) ($row->units ?: ''),
            'decimalPlaces' => $decimalPlaces,
            'direction' => $quantity > 0 ? 'In' : ($quantity < 0 ? 'Out' : 'Zero'),
        ];
    }

    private function summary($rows): array
    {
        return [
            'lines' => $rows->count(),
            'items' => $rows->pluck('stockId')->unique()->count(),
            'locations' => $rows->pluck('location')->unique()->count(),
            'inboundQuantity' => round((float) $rows->filter(fn ($row) => $row['quantity'] > 0)->sum('quantity'), 4),
            'outboundQuantity' => round((float) abs($rows->filter(fn ($row) => $row['quantity'] < 0)->sum('quantity')), 4),
            'netQuantity' => round((float) $rows->sum('quantity'), 4),
        ];
    }

    private function locations(string $userId)
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

    private function transactionTypes()
    {
        return collect(self::LEGACY_TYPES)
            ->map(fn ($label, $type) => [
                'value' => (string) $type,
                'label' => $label,
                'code' => (string) $type,
            ])
            ->values();
    }

    private function typeLabel(string $type): string
    {
        if ($type === 'All') {
            return 'All transaction types';
        }
        return self::LEGACY_TYPES[(int) $type] ?? $type;
    }

    private function locationLabel(string $location): string
    {
        if ($location === 'All') {
            return 'All visible locations';
        }

        $row = DB::table('locations')->where('loccode', $location)->first();
        return $row ? html_entity_decode((string) ($row->locationname ?: $location)) : $location;
    }

    private function canViewLocation(string $userId, string $location): bool
    {
        return DB::table('locationusers')
            ->where('userid', $userId)
            ->where('loccode', $location)
            ->where('canview', 1)
            ->exists();
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
        $address = collect($company['address'])
            ->map(fn ($line) => '<div>' . $this->html($line) . '</div>')
            ->implode('');
        $summary = $context['summary'];
        $filters = $context['filters'];
        $bodyRows = '';

        foreach ($rows as $row) {
            $bodyRows .= '<tr>
                <td>' . $this->html($row['description']) . '<br><span>' . $this->html($row['stockId']) . '</span></td>
                <td>' . $this->html((string) $row['transactionNumber']) . '</td>
                <td>' . $this->html($this->displayDate($row['date'])) . '</td>
                <td class="right ' . ($row['quantity'] < 0 ? 'out' : ($row['quantity'] > 0 ? 'in' : '')) . '">' . $this->number($row['quantity'], $row['decimalPlaces']) . '</td>
                <td>' . $this->html($row['locationName']) . '</td>
                <td>' . $this->html($row['reference'] ?: $row['narrative'] ?: '-') . '</td>
            </tr>';
        }

        return '<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 24px 24px 36px; }
    body { color: #1f1020; font-family: DejaVu Sans, sans-serif; font-size: 11px; line-height: 1.4; }
    .top { background: #fff8fb; border: 1px solid #eadbe3; border-radius: 12px; padding: 12px 14px; }
    .brand { border-collapse: collapse; width: 100%; }
    .brand td { vertical-align: top; }
    .logo-cell { width: 70px; }
    .logo { max-height: 54px; max-width: 60px; object-fit: contain; }
    .company { color: #211019; font-size: 18px; font-weight: 700; margin-bottom: 4px; }
    .muted { color: #5f4857; }
    .title-panel { text-align: right; width: 320px; }
    .title { color: #26364a; font-size: 23px; font-weight: 700; }
    .printed { color: #5f4857; margin-top: 4px; }
    .meta { border-collapse: collapse; margin-top: 12px; width: 100%; }
    .meta td { border: 1px solid #eadbe3; padding: 7px 8px; vertical-align: top; width: 16.6%; }
    .label { color: #5f4857; display: block; font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .value { color: #1f1020; display: block; font-size: 11.5px; font-weight: 700; margin-top: 3px; }
    table.lines { border-collapse: collapse; margin-top: 14px; width: 100%; }
    .lines th { background: #f8edf3; border: 1px solid #eadbe3; color: #4b3442; font-size: 9.5px; letter-spacing: .03em; padding: 7px 5px; text-align: left; text-transform: uppercase; }
    .lines td { border: 1px solid #eadbe3; color: #1f1020; font-size: 10.8px; font-weight: 600; padding: 7px 5px; vertical-align: top; }
    .lines span { color: #765c6b; font-size: 9.5px; font-weight: 500; }
    .lines tbody tr:nth-child(even) td { background: #fff8fb; }
    .right { text-align: right; }
    .in { color: #047857; font-weight: 800; }
    .out { color: #b91c1c; font-weight: 800; }
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
          <div class="title">Stock Transaction Listing</div>
          <div class="printed">Printed ' . $this->html(Carbon::now()->format('d M Y, H:i')) . '</div>
          <div class="printed">' . $this->number($summary['lines'], 0) . ' transaction lines</div>
        </td>
      </tr>
    </table>
  </div>
  <table class="meta">
    <tr>
      <td><span class="label">Transaction Type</span><span class="value">' . $this->html($context['transactionType']) . '</span></td>
      <td><span class="label">Location</span><span class="value">' . $this->html($context['location']) . '</span></td>
      <td><span class="label">Date Range</span><span class="value">' . $this->html($filters['dateFrom'] . ' to ' . $filters['dateTo']) . '</span></td>
      <td><span class="label">Lines</span><span class="value">' . $this->number($summary['lines'], 0) . '</span></td>
      <td><span class="label">Items</span><span class="value">' . $this->number($summary['items'], 0) . '</span></td>
      <td><span class="label">Net Qty</span><span class="value">' . $this->number($summary['netQuantity'], 2) . '</span></td>
    </tr>
  </table>
  <table class="lines">
    <thead>
      <tr>
        <th>Description</th>
        <th style="width: 76px;">Trans No.</th>
        <th style="width: 88px;">Date</th>
        <th class="right" style="width: 86px;">Quantity</th>
        <th style="width: 155px;">Location</th>
        <th style="width: 165px;">Reference</th>
      </tr>
    </thead>
    <tbody>' . $bodyRows . '</tbody>
  </table>
</body>
</html>';
    }

    private function displayDate(string $value): string
    {
        if ($value === '') {
            return '-';
        }
        return Carbon::parse($value)->format('d M Y');
    }

    private function html(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }

    private function number(float|int $value, int $decimals = 2): string
    {
        return number_format((float) $value, $decimals);
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
