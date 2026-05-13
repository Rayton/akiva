<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
            'links' => [
                'runProcess' => '/geocode.php',
                'customerMap' => '/geo_displaymap_customers.php',
                'supplierMap' => '/geo_displaymap_suppliers.php',
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
}
