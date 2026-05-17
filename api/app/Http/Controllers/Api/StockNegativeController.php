<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockNegativeController extends Controller
{
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
                    'categories' => $this->categories(),
                    'rows' => $rows->values(),
                    'summary' => $this->summary($rows),
                    'filters' => $filters,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Negative stock report could not be loaded.',
            ], 500);
        }
    }

    public function exportPdf(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Negative stock data is not available.',
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
                    'message' => 'There are no negative stock balances for the selected filters.',
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
                'category' => $this->categoryLabel($filters['category']),
            ]), 'UTF-8');
            $dompdf->setPaper('A4', 'landscape');
            $dompdf->render();

            return response($dompdf->output(), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="negative-stock-' . Carbon::now()->format('Y-m-d') . '.pdf"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Negative stock PDF could not be created.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('locstock')
            && Schema::hasTable('stockmaster')
            && Schema::hasTable('stockmoves')
            && Schema::hasTable('locations')
            && Schema::hasTable('locationusers');
    }

    private function emptyPayload(): array
    {
        return [
            'locations' => [],
            'categories' => [],
            'rows' => [],
            'summary' => [
                'lines' => 0,
                'items' => 0,
                'locations' => 0,
                'negativeQuantity' => 0,
                'recentActivity' => 0,
                'controlledLines' => 0,
                'largestShortage' => 0,
            ],
            'filters' => [],
        ];
    }

    private function filters(Request $request): array
    {
        $userId = $this->currentUserId($request);
        $location = strtoupper(trim((string) $request->query('location', 'All')));
        if ($location !== 'ALL' && !$this->canViewLocation($userId, $location)) {
            $location = 'All';
        }

        $from = $this->validDate((string) $request->query('dateFrom', $request->query('from', '')), Carbon::today()->subMonths(2)->startOfMonth()->toDateString());
        $to = $this->validDate((string) $request->query('dateTo', $request->query('to', '')), Carbon::today()->toDateString());
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        $activity = trim((string) $request->query('activity', 'All'));
        $allowedActivity = ['All', 'Moved', 'NotMoved'];
        $category = trim((string) $request->query('category', 'All'));

        return [
            'userId' => $userId,
            'location' => $location === 'ALL' ? 'All' : $location,
            'category' => $category === '' ? 'All' : $category,
            'activity' => in_array($activity, $allowedActivity, true) ? $activity : 'All',
            'search' => trim((string) $request->query('q', '')),
            'dateFrom' => $from,
            'dateTo' => $to,
            'limit' => $this->safeLimit($request->query('limit', 1000), 50, 5000),
        ];
    }

    private function rows(array $filters)
    {
        $activity = DB::table('stockmoves')
            ->select('stockid', 'loccode')
            ->selectRaw('MAX(trandate) as last_movement_date')
            ->selectRaw('SUM(CASE WHEN trandate >= ? AND trandate <= ? THEN 1 ELSE 0 END) as movements_in_range', [$filters['dateFrom'], $filters['dateTo']])
            ->groupBy('stockid', 'loccode');

        $query = DB::table('locstock as ls')
            ->join('stockmaster as sm', 'sm.stockid', '=', 'ls.stockid')
            ->join('locations as loc', 'loc.loccode', '=', 'ls.loccode')
            ->join('locationusers as lu', function ($join) use ($filters) {
                $join->on('lu.loccode', '=', 'ls.loccode')
                    ->where('lu.userid', '=', $filters['userId'])
                    ->where('lu.canview', '=', 1);
            })
            ->leftJoin('stockcategory as sc', 'sc.categoryid', '=', 'sm.categoryid')
            ->leftJoinSub($activity, 'activity', function ($join) {
                $join->on('activity.stockid', '=', 'ls.stockid')
                    ->on('activity.loccode', '=', 'ls.loccode');
            })
            ->where('ls.quantity', '<', 0)
            ->select(
                'ls.stockid',
                'ls.loccode',
                'ls.quantity',
                'ls.reorderlevel',
                'loc.locationname',
                'sm.description',
                'sm.longdescription',
                'sm.categoryid',
                'sm.decimalplaces',
                'sm.units',
                'sm.controlled',
                'sm.serialised',
                'sc.categorydescription',
                DB::raw('activity.last_movement_date as last_movement_date'),
                DB::raw('COALESCE(activity.movements_in_range, 0) as movements_in_range')
            );

        if ($filters['location'] !== 'All') {
            $query->where('ls.loccode', $filters['location']);
        }

        if ($filters['category'] !== 'All') {
            $query->where('sm.categoryid', $filters['category']);
        }

        if ($filters['activity'] === 'Moved') {
            $query->whereRaw('COALESCE(activity.movements_in_range, 0) > 0');
        } elseif ($filters['activity'] === 'NotMoved') {
            $query->whereRaw('COALESCE(activity.movements_in_range, 0) = 0');
        }

        if ($filters['search'] !== '') {
            $search = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $filters['search']) . '%';
            $query->where(function ($inner) use ($search) {
                $inner->where('ls.stockid', 'like', $search)
                    ->orWhere('sm.description', 'like', $search)
                    ->orWhere('sm.longdescription', 'like', $search)
                    ->orWhere('sm.categoryid', 'like', $search)
                    ->orWhere('sc.categorydescription', 'like', $search)
                    ->orWhere('ls.loccode', 'like', $search)
                    ->orWhere('loc.locationname', 'like', $search);
            });
        }

        return $query
            ->orderBy('ls.loccode')
            ->orderBy('sm.categoryid')
            ->orderBy('ls.stockid')
            ->limit($filters['limit'])
            ->get()
            ->map(fn ($row) => $this->mapRow($row));
    }

    private function mapRow($row): array
    {
        $decimalPlaces = (int) ($row->decimalplaces ?? 2);
        $quantity = round((float) $row->quantity, $decimalPlaces);
        $controlled = (bool) $row->controlled || (bool) $row->serialised;

        return [
            'stockId' => (string) $row->stockid,
            'description' => html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid)),
            'longDescription' => html_entity_decode((string) ($row->longdescription ?: $row->description ?: '')),
            'category' => (string) ($row->categoryid ?? ''),
            'categoryName' => html_entity_decode((string) ($row->categorydescription ?: $row->categoryid ?: '')),
            'location' => (string) $row->loccode,
            'locationName' => html_entity_decode((string) ($row->locationname ?: $row->loccode)),
            'quantity' => $quantity,
            'shortage' => abs($quantity),
            'reorderLevel' => round((float) $row->reorderlevel, $decimalPlaces),
            'decimalPlaces' => $decimalPlaces,
            'units' => (string) ($row->units ?: ''),
            'controlled' => $controlled,
            'serialised' => (bool) $row->serialised,
            'controlType' => (bool) $row->serialised ? 'Serialised' : ((bool) $row->controlled ? 'Controlled' : 'Standard'),
            'lastMovementDate' => $row->last_movement_date ? Carbon::parse((string) $row->last_movement_date)->toDateString() : '',
            'movementsInRange' => (int) $row->movements_in_range,
            'recentActivity' => (int) $row->movements_in_range > 0,
        ];
    }

    private function summary($rows): array
    {
        return [
            'lines' => $rows->count(),
            'items' => $rows->pluck('stockId')->unique()->count(),
            'locations' => $rows->pluck('location')->unique()->count(),
            'negativeQuantity' => round((float) $rows->sum('quantity'), 4),
            'recentActivity' => $rows->where('recentActivity', true)->count(),
            'controlledLines' => $rows->filter(fn ($row) => $row['controlled'] || $row['serialised'])->count(),
            'largestShortage' => round((float) $rows->max('shortage'), 4),
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

    private function categories()
    {
        if (!Schema::hasTable('stockcategory')) {
            return collect();
        }

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
        if ($location === 'All') {
            return 'All visible locations';
        }

        $row = Schema::hasTable('locations') ? DB::table('locations')->where('loccode', $location)->first() : null;
        return $row ? html_entity_decode((string) ($row->locationname ?: $location)) : $location;
    }

    private function categoryLabel(string $category): string
    {
        if ($category === 'All') {
            return 'All categories';
        }

        $row = Schema::hasTable('stockcategory') ? DB::table('stockcategory')->where('categoryid', $category)->first() : null;
        return $row ? html_entity_decode((string) ($row->categorydescription ?: $category)) : $category;
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
                <td>' . $this->html($row['location'] . ' - ' . $row['locationName']) . '</td>
                <td>' . $this->html($row['categoryName'] ?: $row['category']) . '</td>
                <td><strong>' . $this->html($row['stockId']) . '</strong><br><span>' . $this->html($row['description']) . '</span></td>
                <td class="right negative">' . $this->number($row['quantity'], $row['decimalPlaces']) . '</td>
                <td>' . $this->html($row['units'] ?: '-') . '</td>
                <td>' . $this->html($row['controlType']) . '</td>
                <td class="right">' . $this->number($row['movementsInRange'], 0) . '</td>
                <td>' . $this->html($row['lastMovementDate'] ?: '-') . '</td>
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
    .lines tbody tr:nth-child(even) td { background: #fff8fb; }
    .right { text-align: right; }
    .negative { color: #b91c1c; font-weight: 800; }
    .note { border: 1px solid #fecdd3; border-radius: 10px; color: #881337; margin-top: 12px; padding: 9px 11px; }
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
          <div class="title">Negative Stock Listing</div>
          <div class="printed">Printed ' . $this->html(Carbon::now()->format('d M Y, H:i')) . '</div>
          <div class="printed">' . $this->number($summary['lines'], 0) . ' negative balances</div>
        </td>
      </tr>
    </table>
  </div>
  <table class="meta">
    <tr>
      <td><span class="label">Location</span><span class="value">' . $this->html($context['location']) . '</span></td>
      <td><span class="label">Category</span><span class="value">' . $this->html($context['category']) . '</span></td>
      <td><span class="label">Activity Dates</span><span class="value">' . $this->html($filters['dateFrom'] . ' to ' . $filters['dateTo']) . '</span></td>
      <td><span class="label">Lines</span><span class="value">' . $this->number($summary['lines'], 0) . '</span></td>
      <td><span class="label">Items</span><span class="value">' . $this->number($summary['items'], 0) . '</span></td>
      <td><span class="label">Total Negative Qty</span><span class="value">' . $this->number($summary['negativeQuantity'], 2) . '</span></td>
    </tr>
  </table>
  <div class="note">Review and correct these balances before stock issues, transfers, receiving reversals, or invoices continue against the affected items.</div>
  <table class="lines">
    <thead>
      <tr>
        <th style="width: 170px;">Location</th>
        <th style="width: 150px;">Category</th>
        <th>Item</th>
        <th class="right" style="width: 86px;">Quantity</th>
        <th style="width: 70px;">Unit</th>
        <th style="width: 92px;">Control</th>
        <th class="right" style="width: 86px;">Moves</th>
        <th style="width: 92px;">Last movement</th>
      </tr>
    </thead>
    <tbody>' . $bodyRows . '</tbody>
  </table>
</body>
</html>';
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
