<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ManufacturingSetupController extends Controller
{
    public function index()
    {
        return response()->json([
            'success' => true,
            'data' => $this->payload(),
        ]);
    }

    public function store(Request $request, string $entity)
    {
        $entity = $this->normalizeEntity($entity);
        $this->prepareRequest($request, $entity);

        $validator = $this->validator($request, $entity, null);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();

        if ($entity === 'mrp-calendar') {
            DB::table('mrpcalendar')->insert([
                'calendardate' => (string) $data['calendarDate'],
                'daynumber' => 1,
                'manufacturingflag' => $data['manufacturingAvailable'] ? 1 : 0,
            ]);
            $this->recalculateCalendarDayNumbers();

            return $this->savedResponse('MRP calendar day created.', (string) $data['calendarDate'], 201);
        }

        DB::table('mrpdemandtypes')->insert([
            'mrpdemandtype' => (string) $data['code'],
            'description' => trim((string) $data['name']),
        ]);

        return $this->savedResponse('MRP demand type created.', (string) $data['code'], 201);
    }

    public function update(Request $request, string $entity, string $id)
    {
        $entity = $this->normalizeEntity($entity);
        $id = $this->normalizeId($entity, $id);
        $this->prepareRequest($request, $entity, $id);

        if (!$this->entityExists($entity, $id)) {
            return response()->json([
                'success' => false,
                'message' => $this->entityLabel($entity) . ' was not found.',
            ], 404);
        }

        $validator = $this->validator($request, $entity, $id);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $data = $validator->validated();

        if ($entity === 'mrp-calendar') {
            DB::table('mrpcalendar')->where('calendardate', $id)->update([
                'manufacturingflag' => $data['manufacturingAvailable'] ? 1 : 0,
            ]);
            $this->recalculateCalendarDayNumbers();

            return $this->savedResponse('MRP calendar day updated.', $id);
        }

        DB::table('mrpdemandtypes')->where('mrpdemandtype', $id)->update([
            'description' => trim((string) $data['name']),
        ]);

        return $this->savedResponse('MRP demand type updated.', $id);
    }

    public function destroy(string $entity, string $id)
    {
        $entity = $this->normalizeEntity($entity);
        $id = $this->normalizeId($entity, $id);

        if (!$this->entityExists($entity, $id)) {
            return response()->json([
                'success' => false,
                'message' => $this->entityLabel($entity) . ' was not found.',
            ], 404);
        }

        $blockers = $this->deleteBlockers($entity, $id);
        if ($blockers !== []) {
            return response()->json([
                'success' => false,
                'message' => $this->entityLabel($entity) . ' cannot be deleted because it is in use.',
                'dependencies' => $blockers,
            ], 409);
        }

        if ($entity === 'mrp-calendar') {
            DB::table('mrpcalendar')->where('calendardate', $id)->delete();
            $this->recalculateCalendarDayNumbers();
        } else {
            DB::table('mrpdemandtypes')->where('mrpdemandtype', $id)->delete();
        }

        return $this->savedResponse($this->entityLabel($entity) . ' deleted.', $id);
    }

    private function payload(): array
    {
        $calendar = DB::table('mrpcalendar')
            ->select('calendardate', 'daynumber', 'manufacturingflag')
            ->orderBy('calendardate')
            ->get()
            ->map(static function ($row) {
                $date = (string) $row->calendardate;
                return [
                    'calendarDate' => $date,
                    'weekday' => date('l', strtotime($date)),
                    'dayNumber' => (int) $row->daynumber,
                    'manufacturingAvailable' => (int) $row->manufacturingflag === 1,
                ];
            })
            ->values();

        $demandTypes = DB::table('mrpdemandtypes')
            ->select('mrpdemandtype', 'description')
            ->orderBy('mrpdemandtype')
            ->get()
            ->map(static function ($row) {
                $code = (string) $row->mrpdemandtype;
                return [
                    'code' => $code,
                    'name' => (string) $row->description,
                    'demandCount' => DB::table('mrpdemands')->where('mrpdemandtype', $code)->count(),
                    'requirementCount' => DB::table('mrprequirements')->where('mrpdemandtype', $code)->count(),
                ];
            })
            ->values();

        return [
            'calendar' => $calendar,
            'demandTypes' => $demandTypes,
            'stats' => [
                'calendarDays' => $calendar->count(),
                'manufacturingDays' => $calendar->where('manufacturingAvailable', true)->count(),
                'nonManufacturingDays' => $calendar->where('manufacturingAvailable', false)->count(),
                'demandTypes' => $demandTypes->count(),
            ],
        ];
    }

    private function prepareRequest(Request $request, string $entity, ?string $id = null): void
    {
        $request->merge([
            'calendarDate' => trim((string) $request->input('calendarDate', $id ?? '')),
            'manufacturingAvailable' => filter_var($request->input('manufacturingAvailable', true), FILTER_VALIDATE_BOOLEAN),
            'code' => strtoupper(str_replace(' ', '', trim((string) $request->input('code', $id ?? '')))),
            'name' => trim((string) $request->input('name', '')),
        ]);
    }

    private function normalizeEntity(string $entity): string
    {
        $key = strtolower(str_replace('_', '-', trim($entity)));
        if (in_array($key, ['mrp-calendar', 'mrpcalendar'], true)) return 'mrp-calendar';
        if (in_array($key, ['mrp-demand-types', 'mrpdemandtypes'], true)) return 'mrp-demand-types';
        abort(404, 'Unknown setup area.');
    }

    private function normalizeId(string $entity, string $id): string
    {
        $id = trim(rawurldecode($id));
        return $entity === 'mrp-demand-types' ? strtoupper($id) : $id;
    }

    private function validator(Request $request, string $entity, ?string $id)
    {
        if ($entity === 'mrp-calendar') {
            $dateRules = ['required', 'date'];
            $dateRules[] = $id === null ? Rule::unique('mrpcalendar', 'calendardate') : Rule::in([$id]);

            return Validator::make($request->all(), [
                'calendarDate' => $dateRules,
                'manufacturingAvailable' => ['required', 'boolean'],
            ]);
        }

        $codeRules = ['required', 'string', 'max:6', 'regex:/^[A-Za-z0-9_]+$/'];
        $codeRules[] = $id === null ? Rule::unique('mrpdemandtypes', 'mrpdemandtype') : Rule::in([$id]);

        return Validator::make($request->all(), [
            'code' => $codeRules,
            'name' => ['required', 'string', 'max:30'],
        ]);
    }

    private function entityExists(string $entity, string $id): bool
    {
        if ($entity === 'mrp-calendar') return DB::table('mrpcalendar')->where('calendardate', $id)->exists();
        return DB::table('mrpdemandtypes')->where('mrpdemandtype', $id)->exists();
    }

    private function deleteBlockers(string $entity, string $id): array
    {
        $blockers = [];
        if ($entity === 'mrp-demand-types') {
            $this->addBlocker($blockers, 'MRP demands', DB::table('mrpdemands')->where('mrpdemandtype', $id)->count());
            $this->addBlocker($blockers, 'MRP requirements', DB::table('mrprequirements')->where('mrpdemandtype', $id)->count());
        }
        return $blockers;
    }

    private function recalculateCalendarDayNumbers(): void
    {
        $dayNumber = 1;
        $rows = DB::table('mrpcalendar')->select('calendardate', 'manufacturingflag')->orderBy('calendardate')->get();

        foreach ($rows as $row) {
            if ((int) $row->manufacturingflag === 1) {
                $dayNumber++;
            }
            DB::table('mrpcalendar')->where('calendardate', (string) $row->calendardate)->update(['daynumber' => $dayNumber]);
        }
    }

    private function addBlocker(array &$blockers, string $name, $count): void
    {
        $count = (int) $count;
        if ($count > 0) {
            $blockers[] = ['name' => $name, 'count' => $count];
        }
    }

    private function validationResponse($validator)
    {
        return response()->json([
            'success' => false,
            'message' => 'Validation failed.',
            'errors' => $validator->errors(),
        ], 422);
    }

    private function savedResponse(string $message, $selectedId, int $status = 200)
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => array_merge($this->payload(), ['selectedId' => $selectedId]),
        ], $status);
    }

    private function entityLabel(string $entity): string
    {
        return [
            'mrp-calendar' => 'MRP calendar day',
            'mrp-demand-types' => 'MRP demand type',
        ][$entity] ?? 'Setup record';
    }
}
