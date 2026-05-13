<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class GeocodeSetupController extends Controller
{
    public function show()
    {
        $this->ensureTableExists();

        return response()->json([
            'success' => true,
            'data' => $this->payload(),
        ]);
    }

    public function store(Request $request)
    {
        $this->ensureTableExists();

        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $id = DB::table('geocode_param')->insertGetId($this->inputValues($request));

        return response()->json([
            'success' => true,
            'message' => 'Geocode setup added.',
            'data' => [
                ...$this->payload(),
                'selectedId' => (int) $id,
            ],
        ], 201);
    }

    public function update(Request $request, int $id)
    {
        $this->ensureTableExists();

        $exists = DB::table('geocode_param')->where('geocodeid', $id)->exists();
        if (!$exists) {
            return response()->json([
                'success' => false,
                'message' => 'Geocode setup record was not found.',
            ], 404);
        }

        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        DB::table('geocode_param')->where('geocodeid', $id)->update($this->inputValues($request));

        return response()->json([
            'success' => true,
            'message' => 'Geocode setup updated.',
            'data' => [
                ...$this->payload(),
                'selectedId' => $id,
            ],
        ]);
    }

    public function destroy(int $id)
    {
        $this->ensureTableExists();

        DB::table('geocode_param')->where('geocodeid', $id)->delete();

        return response()->json([
            'success' => true,
            'message' => 'Geocode setup deleted.',
            'data' => $this->payload(),
        ]);
    }

    public function updateSettings(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'enabled' => ['required', 'boolean'],
        ]);

        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        DB::table('config')->updateOrInsert(
            ['confname' => 'geocode_integration'],
            ['confvalue' => $request->boolean('enabled') ? '1' : '0']
        );

        return response()->json([
            'success' => true,
            'message' => 'Geocode integration setting updated.',
            'data' => $this->payload(),
        ]);
    }

    public function run(Request $request)
    {
        $this->ensureTableExists();

        $validator = Validator::make($request->all(), [
            'target' => ['nullable', Rule::in(['all', 'customers', 'suppliers'])],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'missingOnly' => ['nullable', 'boolean'],
        ]);

        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $setup = $this->activeSetup();
        if (!$setup) {
            return response()->json([
                'success' => false,
                'message' => 'Add a geocode setup record before running geocoding.',
            ], 422);
        }

        if (trim((string) $setup->geocode_key) === '') {
            return response()->json([
                'success' => false,
                'message' => 'A geocode API key is required before running geocoding.',
            ], 422);
        }

        $target = (string) $request->input('target', 'all');
        $limit = (int) $request->input('limit', 25);
        $missingOnly = $request->boolean('missingOnly', true);
        $remaining = $limit;
        $results = [];

        if (($target === 'all' || $target === 'customers') && $remaining > 0) {
            $customerResults = $this->geocodeCustomers($setup, $remaining, $missingOnly);
            $results = array_merge($results, $customerResults);
            $remaining -= count($customerResults);
        }

        if (($target === 'all' || $target === 'suppliers') && $remaining > 0) {
            $supplierResults = $this->geocodeSuppliers($setup, $remaining, $missingOnly);
            $results = array_merge($results, $supplierResults);
        }

        $updated = collect($results)->where('status', 'updated')->count();
        $failed = collect($results)->where('status', 'failed')->count();
        $skipped = collect($results)->where('status', 'skipped')->count();

        return response()->json([
            'success' => true,
            'message' => sprintf('Geocoding finished. %d updated, %d failed, %d skipped.', $updated, $failed, $skipped),
            'data' => [
                ...$this->payload(),
                'run' => [
                    'updated' => $updated,
                    'failed' => $failed,
                    'skipped' => $skipped,
                    'processed' => count($results),
                    'results' => $results,
                ],
            ],
        ]);
    }

    public function locations(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'target' => ['nullable', Rule::in(['all', 'customers', 'suppliers'])],
            'limit' => ['nullable', 'integer', 'min:1', 'max:300'],
        ]);

        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $target = (string) $request->input('target', 'all');
        $limit = (int) $request->input('limit', 100);
        $locations = [];

        if ($target === 'all' || $target === 'customers') {
            $customerLimit = $target === 'all' ? (int) ceil($limit / 2) : $limit;
            $locations = array_merge($locations, $this->customerLocations($customerLimit));
        }

        if ($target === 'all' || $target === 'suppliers') {
            $supplierLimit = $target === 'all' ? max(0, $limit - count($locations)) : $limit;
            $locations = array_merge($locations, $this->supplierLocations($supplierLimit));
        }

        return response()->json([
            'success' => true,
            'data' => [
                'locations' => array_values(array_slice($locations, 0, $limit)),
            ],
        ]);
    }

    private function validator(Request $request)
    {
        return Validator::make($request->all(), [
            'geocodeKey' => ['nullable', 'string', 'max:200'],
            'centerLong' => ['nullable', 'numeric', 'between:-180,180'],
            'centerLat' => ['nullable', 'numeric', 'between:-90,90'],
            'mapHeight' => ['required', 'integer', 'min:80', 'max:2000'],
            'mapWidth' => ['required', 'integer', 'min:80', 'max:2000'],
            'mapHost' => ['required', 'string', 'max:50', Rule::notIn(['http://', 'https://'])],
        ], [
            'mapHost.not_in' => 'Map host should be a host name, for example maps.googleapis.com.',
        ]);
    }

    private function validationResponse($validator)
    {
        return response()->json([
            'success' => false,
            'message' => 'Validation failed.',
            'errors' => $validator->errors(),
        ], 422);
    }

    private function inputValues(Request $request): array
    {
        return [
            'geocode_key' => trim((string) $request->input('geocodeKey', '')),
            'center_long' => trim((string) $request->input('centerLong', '')),
            'center_lat' => trim((string) $request->input('centerLat', '')),
            'map_height' => (string) $request->integer('mapHeight'),
            'map_width' => (string) $request->integer('mapWidth'),
            'map_host' => trim((string) $request->input('mapHost', '')),
        ];
    }

    private function payload(): array
    {
        $records = DB::table('geocode_param')
            ->select('geocodeid', 'geocode_key', 'center_long', 'center_lat', 'map_height', 'map_width', 'map_host')
            ->orderBy('geocodeid')
            ->get()
            ->map(fn ($row) => [
                'id' => (int) $row->geocodeid,
                'geocodeKey' => (string) $row->geocode_key,
                'centerLong' => (string) $row->center_long,
                'centerLat' => (string) $row->center_lat,
                'mapHeight' => (string) $row->map_height,
                'mapWidth' => (string) $row->map_width,
                'mapHost' => (string) $row->map_host,
            ])
            ->values();

        return [
            'enabled' => $this->enabled(),
            'records' => $records,
            'stats' => $this->stats(),
            'defaults' => [
                'geocodeKey' => '',
                'centerLong' => '0',
                'centerLat' => '0',
                'mapHeight' => '420',
                'mapWidth' => '640',
                'mapHost' => 'maps.googleapis.com',
            ],
        ];
    }

    private function enabled(): bool
    {
        $value = DB::table('config')->where('confname', 'geocode_integration')->value('confvalue');
        return (string) $value === '1';
    }

    private function stats(): array
    {
        return [
            'customerBranches' => $this->geocodeStats('custbranch'),
            'suppliers' => $this->geocodeStats('suppliers'),
        ];
    }

    private function geocodeStats(string $table): array
    {
        if (!Schema::hasTable($table)) {
            return ['total' => 0, 'geocoded' => 0, 'missing' => 0];
        }

        $total = DB::table($table)->count();
        $geocoded = DB::table($table)
            ->where(function ($query) {
                $query
                    ->where('lat', '<>', 0)
                    ->orWhere('lng', '<>', 0);
            })
            ->count();

        return [
            'total' => (int) $total,
            'geocoded' => (int) $geocoded,
            'missing' => max(0, (int) $total - (int) $geocoded),
        ];
    }

    private function ensureTableExists(): void
    {
        if (Schema::hasTable('geocode_param')) {
            return;
        }

        Schema::create('geocode_param', function ($table) {
            $table->tinyIncrements('geocodeid');
            $table->string('geocode_key', 200)->default('');
            $table->string('center_long', 20)->default('');
            $table->string('center_lat', 20)->default('');
            $table->string('map_height', 10)->default('');
            $table->string('map_width', 10)->default('');
            $table->string('map_host', 50)->default('');
        });
    }

    private function activeSetup(): ?object
    {
        return DB::table('geocode_param')
            ->orderBy('geocodeid')
            ->first();
    }

    private function geocodeCustomers(object $setup, int $limit, bool $missingOnly): array
    {
        if (!Schema::hasTable('custbranch')) {
            return [];
        }

        $query = DB::table('custbranch')
            ->select(
                'debtorno',
                'branchcode',
                'brname',
                'braddress1',
                'braddress2',
                'braddress3',
                'braddress4',
                'braddress5',
                'braddress6'
            )
            ->orderBy('debtorno')
            ->orderBy('branchcode')
            ->limit($limit);

        if ($missingOnly) {
            $query->where('lat', 0)->where('lng', 0);
        }

        return $query->get()
            ->map(fn ($row) => $this->geocodeCustomerRow($setup, $row))
            ->all();
    }

    private function geocodeSuppliers(object $setup, int $limit, bool $missingOnly): array
    {
        if (!Schema::hasTable('suppliers')) {
            return [];
        }

        $query = DB::table('suppliers')
            ->select(
                'supplierid',
                'suppname',
                'address1',
                'address2',
                'address3',
                'address4',
                'address5',
                'address6'
            )
            ->orderBy('supplierid')
            ->limit($limit);

        if ($missingOnly) {
            $query->where('lat', 0)->where('lng', 0);
        }

        return $query->get()
            ->map(fn ($row) => $this->geocodeSupplierRow($setup, $row))
            ->all();
    }

    private function geocodeCustomerRow(object $setup, object $row): array
    {
        $address = $this->address([
            $row->brname,
            $row->braddress1,
            $row->braddress2,
            $row->braddress3,
            $row->braddress4,
            $row->braddress5,
            $row->braddress6,
        ]);

        $result = $this->geocodeAddress($setup, $address);
        if ($result['status'] === 'updated') {
            DB::table('custbranch')
                ->where('debtorno', $row->debtorno)
                ->where('branchcode', $row->branchcode)
                ->update([
                    'lat' => $result['lat'],
                    'lng' => $result['lng'],
                ]);
        }

        return [
            'type' => 'customer',
            'id' => sprintf('%s/%s', $row->debtorno, $row->branchcode),
            'name' => (string) $row->brname,
            'address' => $address,
            ...$result,
        ];
    }

    private function geocodeSupplierRow(object $setup, object $row): array
    {
        $address = $this->address([
            $row->suppname,
            $row->address1,
            $row->address2,
            $row->address3,
            $row->address4,
            $row->address5,
            $row->address6,
        ]);

        $result = $this->geocodeAddress($setup, $address);
        if ($result['status'] === 'updated') {
            DB::table('suppliers')
                ->where('supplierid', $row->supplierid)
                ->update([
                    'lat' => $result['lat'],
                    'lng' => $result['lng'],
                ]);
        }

        return [
            'type' => 'supplier',
            'id' => (string) $row->supplierid,
            'name' => (string) $row->suppname,
            'address' => $address,
            ...$result,
        ];
    }

    private function geocodeAddress(object $setup, string $address): array
    {
        if ($address === '') {
            return [
                'status' => 'skipped',
                'message' => 'Address is empty.',
                'lat' => null,
                'lng' => null,
            ];
        }

        $host = trim((string) $setup->map_host) ?: 'maps.googleapis.com';
        $host = preg_replace('#^https?://#i', '', $host);
        $host = trim((string) $host, '/');

        try {
            $response = Http::timeout(15)
                ->acceptJson()
                ->get(sprintf('https://%s/maps/api/geocode/json', $host), [
                    'address' => $address,
                    'key' => (string) $setup->geocode_key,
                ]);

            if (!$response->ok()) {
                return [
                    'status' => 'failed',
                    'message' => sprintf('Geocode service returned HTTP %d.', $response->status()),
                    'lat' => null,
                    'lng' => null,
                ];
            }

            $json = $response->json();
            $apiStatus = (string) ($json['status'] ?? 'UNKNOWN');
            $location = $json['results'][0]['geometry']['location'] ?? null;

            if ($apiStatus !== 'OK' || !is_array($location)) {
                return [
                    'status' => $apiStatus === 'ZERO_RESULTS' ? 'skipped' : 'failed',
                    'message' => (string) ($json['error_message'] ?? $apiStatus),
                    'lat' => null,
                    'lng' => null,
                ];
            }

            return [
                'status' => 'updated',
                'message' => (string) ($json['results'][0]['formatted_address'] ?? 'Coordinates updated.'),
                'lat' => (float) $location['lat'],
                'lng' => (float) $location['lng'],
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'failed',
                'message' => $e->getMessage(),
                'lat' => null,
                'lng' => null,
            ];
        }
    }

    private function customerLocations(int $limit): array
    {
        if ($limit <= 0 || !Schema::hasTable('custbranch')) {
            return [];
        }

        return DB::table('custbranch')
            ->select('debtorno', 'branchcode', 'brname', 'braddress1', 'braddress2', 'braddress3', 'braddress4', 'braddress5', 'braddress6', 'lat', 'lng')
            ->where(function ($query) {
                $query->where('lat', '<>', 0)->orWhere('lng', '<>', 0);
            })
            ->orderBy('brname')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => $this->location('customer', sprintf('%s/%s', $row->debtorno, $row->branchcode), $row->brname, $this->address([
                $row->braddress1,
                $row->braddress2,
                $row->braddress3,
                $row->braddress4,
                $row->braddress5,
                $row->braddress6,
            ]), (float) $row->lat, (float) $row->lng))
            ->all();
    }

    private function supplierLocations(int $limit): array
    {
        if ($limit <= 0 || !Schema::hasTable('suppliers')) {
            return [];
        }

        return DB::table('suppliers')
            ->select('supplierid', 'suppname', 'address1', 'address2', 'address3', 'address4', 'address5', 'address6', 'lat', 'lng')
            ->where(function ($query) {
                $query->where('lat', '<>', 0)->orWhere('lng', '<>', 0);
            })
            ->orderBy('suppname')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => $this->location('supplier', $row->supplierid, $row->suppname, $this->address([
                $row->address1,
                $row->address2,
                $row->address3,
                $row->address4,
                $row->address5,
                $row->address6,
            ]), (float) $row->lat, (float) $row->lng))
            ->all();
    }

    private function location(string $type, string $id, string $name, string $address, float $lat, float $lng): array
    {
        return [
            'type' => $type,
            'id' => $id,
            'name' => $name,
            'address' => $address,
            'lat' => $lat,
            'lng' => $lng,
            'mapUrl' => sprintf('https://www.google.com/maps/search/?api=1&query=%s,%s', $lat, $lng),
            'embedUrl' => sprintf('https://www.google.com/maps?q=%s,%s&output=embed', $lat, $lng),
        ];
    }

    private function address(array $parts): string
    {
        return collect($parts)
            ->map(fn ($part) => trim((string) $part))
            ->filter()
            ->unique()
            ->implode(', ');
    }
}
