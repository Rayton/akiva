<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class StockQuantitiesCsvController extends Controller
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
            $allRows = $this->rows($filters);

            return response()->json([
                'success' => true,
                'data' => [
                    'rows' => $allRows->take(500)->values(),
                    'summary' => $this->summary($allRows, $filters),
                    'locations' => $this->visibleLocations($filters['userId']),
                    'filters' => $filters,
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock quantities CSV data could not be loaded.',
            ], 500);
        }
    }

    public function exportCsv(Request $request)
    {
        if (!$this->hasCoreTables()) {
            return response()->json([
                'success' => false,
                'message' => 'Stock quantities CSV data is not available.',
            ], 503);
        }

        try {
            $filters = $this->filters($request);
            $rows = $this->rows($filters);

            if ($rows->isEmpty()) {
                return response()->json([
                    'success' => false,
                    'message' => 'There are no stock quantities to export for the selected filters.',
                ], 422);
            }

            return response($this->csv($rows, $filters), 200, [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Content-Disposition' => 'attachment; filename="' . $this->exportFilename() . '"',
                'Cache-Control' => 'private, max-age=0, must-revalidate',
                'Pragma' => 'public',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Stock quantities CSV could not be created.',
            ], 500);
        }
    }

    private function hasCoreTables(): bool
    {
        return Schema::hasTable('locstock') && Schema::hasTable('locationusers');
    }

    private function emptyPayload(): array
    {
        return [
            'rows' => [],
            'summary' => [
                'items' => 0,
                'previewRows' => 0,
                'totalQuantity' => 0,
                'visibleLocations' => 0,
                'includeHeader' => false,
                'asOf' => Carbon::today()->toDateString(),
            ],
            'locations' => [],
            'filters' => [],
        ];
    }

    private function filters(Request $request): array
    {
        return [
            'search' => trim((string) $request->query('q', '')),
            'userId' => $this->currentUserId($request),
            'includeHeader' => $request->boolean('includeHeader', false),
        ];
    }

    private function rows(array $filters)
    {
        $hasStockMaster = Schema::hasTable('stockmaster');
        $hasCategories = Schema::hasTable('stockcategory');

        $query = DB::table('locstock')
            ->join('locationusers', function ($join) use ($filters) {
                $join->on('locationusers.loccode', '=', 'locstock.loccode')
                    ->where('locationusers.userid', '=', $filters['userId'])
                    ->where('locationusers.canview', '=', 1);
            });

        if ($hasStockMaster) {
            $query->leftJoin('stockmaster', 'stockmaster.stockid', '=', 'locstock.stockid');
        }

        if ($hasStockMaster && $hasCategories) {
            $query->leftJoin('stockcategory', 'stockcategory.categoryid', '=', 'stockmaster.categoryid');
        }

        $query->select(
            'locstock.stockid',
            DB::raw('SUM(locstock.quantity) AS quantity'),
            DB::raw('COUNT(DISTINCT CASE WHEN locstock.quantity <> 0 THEN locstock.loccode END) AS location_count')
        );

        if ($hasStockMaster) {
            $query->addSelect(
                DB::raw('MAX(stockmaster.description) AS description'),
                DB::raw('MAX(stockmaster.longdescription) AS longdescription'),
                DB::raw('MAX(stockmaster.units) AS units'),
                DB::raw('MAX(stockmaster.decimalplaces) AS decimalplaces'),
                DB::raw('MAX(stockmaster.categoryid) AS categoryid')
            );
        }

        if ($hasStockMaster && $hasCategories) {
            $query->addSelect(DB::raw('MAX(stockcategory.categorydescription) AS categorydescription'));
        }

        if ($filters['search'] !== '') {
            $search = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $filters['search']) . '%';
            $query->where(function ($inner) use ($search, $hasStockMaster, $hasCategories) {
                $inner->where('locstock.stockid', 'like', $search);

                if ($hasStockMaster) {
                    $inner->orWhere('stockmaster.description', 'like', $search)
                        ->orWhere('stockmaster.longdescription', 'like', $search)
                        ->orWhere('stockmaster.categoryid', 'like', $search);
                }

                if ($hasStockMaster && $hasCategories) {
                    $inner->orWhere('stockcategory.categorydescription', 'like', $search);
                }
            });
        }

        return $query
            ->groupBy('locstock.stockid')
            ->havingRaw('SUM(locstock.quantity) <> 0')
            ->orderBy('locstock.stockid')
            ->get()
            ->map(fn ($row) => $this->mapRow($row, $hasStockMaster, $hasCategories));
    }

    private function mapRow($row, bool $hasStockMaster, bool $hasCategories): array
    {
        $decimalPlaces = $hasStockMaster ? (int) ($row->decimalplaces ?? 2) : 2;
        $description = $hasStockMaster
            ? html_entity_decode((string) ($row->description ?: $row->longdescription ?: $row->stockid))
            : (string) $row->stockid;

        return [
            'stockId' => (string) $row->stockid,
            'description' => $description,
            'category' => $hasStockMaster ? (string) ($row->categoryid ?? '') : '',
            'categoryName' => $hasCategories ? html_entity_decode((string) ($row->categorydescription ?: $row->categoryid ?: '')) : '',
            'quantity' => round((float) $row->quantity, $decimalPlaces),
            'locationCount' => (int) $row->location_count,
            'units' => $hasStockMaster ? (string) ($row->units ?? '') : '',
            'decimalPlaces' => $decimalPlaces,
        ];
    }

    private function summary($rows, array $filters): array
    {
        return [
            'items' => $rows->count(),
            'previewRows' => min($rows->count(), 500),
            'totalQuantity' => round((float) $rows->sum('quantity'), 4),
            'visibleLocations' => $this->visibleLocations($filters['userId'])->count(),
            'includeHeader' => (bool) $filters['includeHeader'],
            'asOf' => Carbon::today()->toDateString(),
        ];
    }

    private function visibleLocations(string $userId)
    {
        if (!Schema::hasTable('locations')) {
            return DB::table('locationusers')
                ->where('userid', $userId)
                ->where('canview', 1)
                ->select('loccode')
                ->orderBy('loccode')
                ->get()
                ->map(fn ($row) => [
                    'value' => (string) $row->loccode,
                    'label' => (string) $row->loccode,
                    'code' => (string) $row->loccode,
                ]);
        }

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
            ]);
    }

    private function csv($rows, array $filters): string
    {
        $lines = ["\xEF\xBB\xBF"];

        if ($filters['includeHeader']) {
            $lines[] = "stockid,quantity\n";
        }

        foreach ($rows as $row) {
            $lines[] = $this->stripComma($row['stockId']) . ', ' . $this->stripComma($this->csvNumber($row['quantity'])) . "\n";
        }

        return implode('', $lines);
    }

    private function csvNumber(float $value): string
    {
        $number = rtrim(rtrim(number_format($value, 6, '.', ''), '0'), '.');
        return $number === '-0' || $number === '' ? '0' : $number;
    }

    private function stripComma(string $value): string
    {
        return str_replace(',', '', $value);
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

    private function exportFilename(): string
    {
        return 'stock-quantities-' . Carbon::now()->format('Y-m-d') . '.csv';
    }
}
