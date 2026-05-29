<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AssetManagerController extends Controller
{
    public function dashboard(Request $request)
    {
        try {
            if (!Schema::hasTable('fixedassets')) {
                return response()->json(['success' => true, 'data' => $this->emptyDashboard()]);
            }

            $filters = $this->filters($request);
            $assets = $this->assetRows($filters);
            $recentTransactions = $this->recentTransactions();

            return response()->json([
                'success' => true,
                'data' => [
                    'settings' => $this->settings(),
                    'asOf' => now()->toIso8601String(),
                    'summary' => $this->summary($assets),
                    'assets' => $assets->values(),
                    'categoryExposure' => $this->categoryExposure($assets),
                    'locationExposure' => $this->locationExposure($assets),
                    'recentTransactions' => $recentTransactions,
                    'filterOptions' => [
                        'categories' => $this->categoryOptions(),
                        'locations' => $this->locationOptions(),
                    ],
                ],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'success' => false,
                'message' => 'Asset manager dashboard could not be loaded.',
            ], 500);
        }
    }

    private function filters(Request $request): array
    {
        return [
            'q' => trim((string) $request->query('q', '')),
            'category' => trim((string) $request->query('category', 'all')),
            'location' => trim((string) $request->query('location', 'all')),
            'status' => trim((string) $request->query('status', 'all')),
        ];
    }

    private function assetRows(array $filters): Collection
    {
        $query = DB::table('fixedassets as fa');

        if (Schema::hasTable('fixedassetcategories')) {
            $query->leftJoin('fixedassetcategories as fc', 'fc.categoryid', '=', 'fa.assetcategoryid');
        }

        if (Schema::hasTable('fixedassetlocations')) {
            $query->leftJoin('fixedassetlocations as fl', 'fl.locationid', '=', 'fa.assetlocation');
        }

        if ($filters['q'] !== '') {
            $needle = '%' . $filters['q'] . '%';
            $query->where(function ($inner) use ($needle) {
                $inner
                    ->where('fa.description', 'like', $needle)
                    ->orWhere('fa.longdescription', 'like', $needle)
                    ->orWhere('fa.serialno', 'like', $needle)
                    ->orWhere('fa.barcode', 'like', $needle)
                    ->orWhere('fa.assetid', 'like', $needle);
            });
        }

        if ($filters['category'] !== '' && strtolower($filters['category']) !== 'all') {
            $query->where('fa.assetcategoryid', $filters['category']);
        }

        if ($filters['location'] !== '' && strtolower($filters['location']) !== 'all') {
            $query->where('fa.assetlocation', $filters['location']);
        }

        if ($filters['status'] === 'active') {
            $query->where(function ($inner) {
                $inner->whereNull('fa.disposaldate')
                    ->orWhere('fa.disposaldate', '')
                    ->orWhere('fa.disposaldate', '0000-00-00');
            });
        } elseif ($filters['status'] === 'disposed') {
            $query->whereNotNull('fa.disposaldate')
                ->where('fa.disposaldate', '!=', '')
                ->where('fa.disposaldate', '!=', '0000-00-00');
        }

        $selects = [
            'fa.assetid',
            'fa.serialno',
            'fa.assetlocation',
            'fa.cost',
            'fa.accumdepn',
            'fa.datepurchased',
            'fa.disposalproceeds',
            'fa.assetcategoryid',
            'fa.description',
            'fa.longdescription',
            'fa.depntype',
            'fa.depnrate',
            'fa.barcode',
            'fa.disposaldate',
        ];

        if (Schema::hasTable('fixedassetcategories')) {
            $selects[] = 'fc.categorydescription';
        }

        if (Schema::hasTable('fixedassetlocations')) {
            $selects[] = 'fl.locationdescription';
        }

        return $query
            ->select($selects)
            ->orderBy('fa.assetid')
            ->limit(5000)
            ->get()
            ->map(fn (object $row) => $this->mapAsset($row));
    }

    private function mapAsset(object $row): array
    {
        $cost = (float) ($row->cost ?? 0);
        $accumulatedDepreciation = (float) ($row->accumdepn ?? 0);
        $disposalDate = $this->validDate($row->disposaldate ?? null);
        $status = $disposalDate === null ? 'Active' : 'Disposed';

        return [
            'id' => (string) ($row->assetid ?? ''),
            'assetId' => (int) ($row->assetid ?? 0),
            'description' => (string) ($row->description ?? ''),
            'longDescription' => (string) ($row->longdescription ?? ''),
            'serialNo' => (string) ($row->serialno ?? ''),
            'barcode' => (string) ($row->barcode ?? ''),
            'categoryId' => (string) ($row->assetcategoryid ?? ''),
            'categoryDescription' => (string) ($row->categorydescription ?? $row->assetcategoryid ?? ''),
            'locationId' => (string) ($row->assetlocation ?? ''),
            'locationDescription' => (string) ($row->locationdescription ?? $row->assetlocation ?? ''),
            'cost' => $cost,
            'accumulatedDepreciation' => $accumulatedDepreciation,
            'netBookValue' => $cost - $accumulatedDepreciation,
            'depreciationRate' => (float) ($row->depnrate ?? 0),
            'depreciationType' => (int) ($row->depntype ?? 0),
            'depreciationTypeLabel' => ((int) ($row->depntype ?? 0)) === 0 ? 'Straight line' : 'Diminishing value',
            'datePurchased' => $this->validDate($row->datepurchased ?? null),
            'disposalDate' => $disposalDate,
            'disposalProceeds' => (float) ($row->disposalproceeds ?? 0),
            'status' => $status,
        ];
    }

    private function summary(Collection $assets): array
    {
        $active = $assets->where('status', 'Active');

        return [
            'totalAssets' => $assets->count(),
            'activeAssets' => $active->count(),
            'disposedAssets' => $assets->where('status', 'Disposed')->count(),
            'totalCost' => (float) $assets->sum('cost'),
            'accumulatedDepreciation' => (float) $assets->sum('accumulatedDepreciation'),
            'netBookValue' => (float) $assets->sum('netBookValue'),
            'disposalProceeds' => (float) $assets->sum('disposalProceeds'),
            'averageDepreciationRate' => $active->count() > 0 ? round((float) $active->avg('depreciationRate'), 2) : 0,
        ];
    }

    private function categoryExposure(Collection $assets): array
    {
        return $assets
            ->groupBy('categoryId')
            ->map(function (Collection $rows) {
                $first = $rows->first();

                return [
                    'categoryId' => (string) ($first['categoryId'] ?? ''),
                    'categoryDescription' => (string) ($first['categoryDescription'] ?? 'Uncategorised'),
                    'assetCount' => $rows->count(),
                    'activeCount' => $rows->where('status', 'Active')->count(),
                    'cost' => (float) $rows->sum('cost'),
                    'accumulatedDepreciation' => (float) $rows->sum('accumulatedDepreciation'),
                    'netBookValue' => (float) $rows->sum('netBookValue'),
                ];
            })
            ->sortByDesc('netBookValue')
            ->take(8)
            ->values()
            ->all();
    }

    private function locationExposure(Collection $assets): array
    {
        return $assets
            ->groupBy('locationId')
            ->map(function (Collection $rows) {
                $first = $rows->first();

                return [
                    'locationId' => (string) ($first['locationId'] ?? ''),
                    'locationDescription' => (string) ($first['locationDescription'] ?? 'Unassigned'),
                    'assetCount' => $rows->count(),
                    'activeCount' => $rows->where('status', 'Active')->count(),
                    'cost' => (float) $rows->sum('cost'),
                    'netBookValue' => (float) $rows->sum('netBookValue'),
                ];
            })
            ->sortByDesc('netBookValue')
            ->take(8)
            ->values()
            ->all();
    }

    private function recentTransactions(): array
    {
        if (!Schema::hasTable('fixedassettrans')) {
            return [];
        }

        $query = DB::table('fixedassettrans as fat')
            ->leftJoin('fixedassets as fa', 'fa.assetid', '=', 'fat.assetid')
            ->select(
                'fat.id',
                'fat.assetid',
                'fa.description',
                'fat.transtype',
                'fat.transdate',
                'fat.transno',
                'fat.periodno',
                'fat.inputdate',
                'fat.fixedassettranstype',
                'fat.amount'
            )
            ->orderByDesc('fat.transdate')
            ->orderByDesc('fat.id')
            ->limit(50);

        return $query->get()->map(fn (object $row) => [
            'id' => (int) ($row->id ?? 0),
            'assetId' => (int) ($row->assetid ?? 0),
            'assetDescription' => (string) ($row->description ?? ''),
            'type' => (int) ($row->transtype ?? 0),
            'transactionType' => (string) ($row->fixedassettranstype ?? ''),
            'date' => $this->validDate($row->transdate ?? null),
            'inputDate' => $this->validDate($row->inputdate ?? null),
            'transactionNo' => (int) ($row->transno ?? 0),
            'periodNo' => (int) ($row->periodno ?? 0),
            'amount' => (float) ($row->amount ?? 0),
        ])->values()->all();
    }

    private function categoryOptions(): array
    {
        if (!Schema::hasTable('fixedassetcategories')) {
            return [];
        }

        return DB::table('fixedassetcategories')
            ->select('categoryid', 'categorydescription')
            ->orderBy('categorydescription')
            ->get()
            ->map(fn (object $row) => [
                'id' => (string) ($row->categoryid ?? ''),
                'label' => trim((string) ($row->categorydescription ?? '')) ?: (string) ($row->categoryid ?? ''),
            ])
            ->values()
            ->all();
    }

    private function locationOptions(): array
    {
        if (!Schema::hasTable('fixedassetlocations')) {
            return [];
        }

        return DB::table('fixedassetlocations')
            ->select('locationid', 'locationdescription')
            ->orderBy('locationdescription')
            ->get()
            ->map(fn (object $row) => [
                'id' => (string) ($row->locationid ?? ''),
                'label' => trim((string) ($row->locationdescription ?? '')) ?: (string) ($row->locationid ?? ''),
            ])
            ->values()
            ->all();
    }

    private function settings(): array
    {
        $company = Schema::hasTable('companies')
            ? DB::table('companies')->orderBy('coycode')->select('coyname', 'currencydefault')->first()
            : null;

        $currencyCode = strtoupper(trim((string) ($company->currencydefault ?? '')));
        if ($currencyCode === '') {
            $currencyCode = 'USD';
        }

        $currency = Schema::hasTable('currencies')
            ? DB::table('currencies')->where('currabrev', $currencyCode)->select('currency', 'currabrev', 'decimalplaces')->first()
            : null;

        return [
            'companyName' => (string) ($company->coyname ?? 'Company'),
            'currencyCode' => (string) ($currency->currabrev ?? $currencyCode),
            'currencyName' => (string) ($currency->currency ?? $currencyCode),
            'currencyDecimalPlaces' => (int) ($currency->decimalplaces ?? 2),
            'dateFormat' => $this->dateFormat(),
        ];
    }

    private function dateFormat(): string
    {
        if (!Schema::hasTable('config')) {
            return 'Y-m-d';
        }

        return (string) (DB::table('config')
            ->where('confname', 'DefaultDateFormat')
            ->value('confvalue') ?? 'Y-m-d');
    }

    private function validDate(mixed $value): ?string
    {
        $date = trim((string) ($value ?? ''));
        if ($date === '' || $date === '0000-00-00') {
            return null;
        }

        return substr($date, 0, 10);
    }

    private function emptyDashboard(): array
    {
        return [
            'settings' => $this->settings(),
            'asOf' => now()->toIso8601String(),
            'summary' => [
                'totalAssets' => 0,
                'activeAssets' => 0,
                'disposedAssets' => 0,
                'totalCost' => 0,
                'accumulatedDepreciation' => 0,
                'netBookValue' => 0,
                'disposalProceeds' => 0,
                'averageDepreciationRate' => 0,
            ],
            'assets' => [],
            'categoryExposure' => [],
            'locationExposure' => [],
            'recentTransactions' => [],
            'filterOptions' => [
                'categories' => [],
                'locations' => [],
            ],
        ];
    }
}
