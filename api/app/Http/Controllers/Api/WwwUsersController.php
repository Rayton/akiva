<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class WwwUsersController extends Controller
{
    private const MODULES = [
        ['key' => 'sales', 'label' => 'Sales'],
        ['key' => 'receivables', 'label' => 'Receivables'],
        ['key' => 'purchases', 'label' => 'Purchases'],
        ['key' => 'payables', 'label' => 'Payables'],
        ['key' => 'inventory', 'label' => 'Inventory'],
        ['key' => 'manufacturing', 'label' => 'Manufacturing'],
        ['key' => 'generalLedger', 'label' => 'General Ledger'],
        ['key' => 'paymentRequest', 'label' => 'Payment Request'],
        ['key' => 'assetManager', 'label' => 'Asset Manager'],
        ['key' => 'pettyCash', 'label' => 'Petty Cash'],
        ['key' => 'setup', 'label' => 'Setup'],
        ['key' => 'utilities', 'label' => 'Utilities'],
    ];

    public function index()
    {
        return response()->json([
            'success' => true,
            'data' => $this->payload(),
        ]);
    }

    public function store(Request $request)
    {
        $validator = $this->validator($request, null);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $payload = $validator->validated();
        $password = (string) ($payload['password'] ?? '');
        $userId = trim((string) $payload['userId']);

        if (stripos($password, $userId) !== false) {
            return response()->json([
                'success' => false,
                'message' => 'Password cannot contain the user ID.',
            ], 422);
        }

        DB::transaction(function () use ($payload, $password, $userId) {
            DB::table('www_users')->insert([
                ...$this->inputValues($payload),
                'userid' => $userId,
                'password' => password_hash($password, PASSWORD_DEFAULT),
                'displayrecordsmax' => 50,
            ]);

            $this->createDefaultAuthorisations($userId, (string) ($payload['defaultLocation'] ?? ''));
        });

        return response()->json([
            'success' => true,
            'message' => 'User created.',
            'data' => [
                ...$this->payload(),
                'selectedUserId' => $userId,
            ],
        ], 201);
    }

    public function update(Request $request, string $userId)
    {
        $userId = trim($userId);
        if (!DB::table('www_users')->where('userid', $userId)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'User was not found.',
            ], 404);
        }

        $validator = $this->validator($request, $userId);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $payload = $validator->validated();
        $password = (string) ($payload['password'] ?? '');

        if ($password !== '' && stripos($password, $userId) !== false) {
            return response()->json([
                'success' => false,
                'message' => 'Password cannot contain the user ID.',
            ], 422);
        }

        $values = $this->inputValues($payload);
        if ($password !== '') {
            $values['password'] = password_hash($password, PASSWORD_DEFAULT);
        }

        DB::table('www_users')->where('userid', $userId)->update($values);

        return response()->json([
            'success' => true,
            'message' => 'User updated.',
            'data' => [
                ...$this->payload(),
                'selectedUserId' => $userId,
            ],
        ]);
    }

    public function destroy(string $userId)
    {
        $userId = trim($userId);

        if (!DB::table('www_users')->where('userid', $userId)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'User was not found.',
            ], 404);
        }

        if (Schema::hasTable('audittrail') && DB::table('audittrail')->where('userid', $userId)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot delete this user because audit trail entries already exist.',
            ], 422);
        }

        DB::transaction(function () use ($userId) {
            foreach (['locationusers', 'glaccountusers', 'bankaccountusers'] as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->where('userid', $userId)->delete();
                }
            }
            DB::table('www_users')->where('userid', $userId)->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'User deleted.',
            'data' => $this->payload(),
        ]);
    }

    private function validator(Request $request, ?string $existingUserId)
    {
        $userIdRules = ['required', 'string', 'min:4', 'max:20', 'regex:/^(?!admin$)[^?+.&\\\\><\'"\s]+$/i'];
        if ($existingUserId === null) {
            $userIdRules[] = Rule::unique('www_users', 'userid');
        }

        return Validator::make($request->all(), [
            'userId' => $existingUserId === null ? $userIdRules : ['required', Rule::in([$existingUserId])],
            'password' => [$existingUserId === null ? 'required' : 'nullable', 'string', 'min:5', 'max:72'],
            'realName' => ['required', 'string', 'max:35'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['required', 'email', 'max:55'],
            'customerId' => ['nullable', 'string', 'max:10'],
            'branchCode' => ['nullable', 'string', 'max:10'],
            'supplierId' => ['nullable', 'string', 'max:10'],
            'salesman' => ['nullable', 'string', 'max:4'],
            'pageSize' => ['required', Rule::in(['A4', 'A3', 'A3_Landscape', 'Letter', 'Letter_Landscape', 'Legal', 'Legal_Landscape'])],
            'securityRoleId' => ['required', 'integer', 'exists:securityroles,secroleid'],
            'canCreateTender' => ['required', 'boolean'],
            'defaultLocation' => ['required', 'string', 'max:5', 'exists:locations,loccode'],
            'modulesAllowed' => ['required', 'array', 'size:' . count(self::MODULES)],
            'modulesAllowed.*' => ['boolean'],
            'showDashboard' => ['required', 'boolean'],
            'showPageHelp' => ['required', 'boolean'],
            'showFieldHelp' => ['required', 'boolean'],
            'blocked' => ['required', 'boolean'],
            'theme' => ['required', 'string', 'max:30'],
            'language' => ['required', 'string', 'max:10'],
            'pdfLanguage' => ['required', 'integer', 'min:0', 'max:3'],
            'department' => ['nullable', 'integer'],
        ], [
            'userId.regex' => 'User ID cannot be admin and cannot contain spaces or the characters ? + . & \\ > < quotes.',
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

    private function inputValues(array $payload): array
    {
        $customerId = trim((string) ($payload['customerId'] ?? ''));

        return [
            'realname' => trim((string) $payload['realName']),
            'customerid' => $customerId,
            'branchcode' => $customerId === '' ? '' : trim((string) ($payload['branchCode'] ?? '')),
            'supplierid' => trim((string) ($payload['supplierId'] ?? '')),
            'salesman' => trim((string) ($payload['salesman'] ?? '')),
            'phone' => trim((string) ($payload['phone'] ?? '')),
            'email' => trim((string) $payload['email']),
            'pagesize' => (string) $payload['pageSize'],
            'fullaccess' => (int) $payload['securityRoleId'],
            'cancreatetender' => $payload['canCreateTender'] ? 1 : 0,
            'defaultlocation' => trim((string) $payload['defaultLocation']),
            'modulesallowed' => $this->modulesToString($payload['modulesAllowed']),
            'showdashboard' => $payload['showDashboard'] ? 1 : 0,
            'showpagehelp' => $payload['showPageHelp'] ? 1 : 0,
            'showfieldhelp' => $payload['showFieldHelp'] ? 1 : 0,
            'blocked' => $payload['blocked'] ? 1 : 0,
            'theme' => trim((string) $payload['theme']),
            'language' => trim((string) $payload['language']),
            'pdflanguage' => (int) $payload['pdfLanguage'],
            'department' => (int) ($payload['department'] ?? 0),
        ];
    }

    private function payload(): array
    {
        $users = DB::table('www_users as wu')
            ->leftJoin('securityroles as sr', 'sr.secroleid', '=', 'wu.fullaccess')
            ->leftJoin('locations as l', 'l.loccode', '=', 'wu.defaultlocation')
            ->select(
                'wu.userid',
                'wu.realname',
                'wu.phone',
                'wu.email',
                'wu.customerid',
                'wu.branchcode',
                'wu.supplierid',
                'wu.salesman',
                'wu.lastvisitdate',
                'wu.fullaccess',
                'wu.cancreatetender',
                'wu.pagesize',
                'wu.defaultlocation',
                'wu.modulesallowed',
                'wu.showdashboard',
                'wu.showpagehelp',
                'wu.showfieldhelp',
                'wu.blocked',
                'wu.theme',
                'wu.language',
                'wu.pdflanguage',
                'wu.department',
                'sr.secrolename',
                'l.locationname'
            )
            ->orderBy('wu.userid')
            ->get()
            ->map(fn ($row) => $this->mapUser($row))
            ->values()
            ->all();

        return [
            'users' => $users,
            'lookups' => $this->lookups(),
            'defaults' => $this->defaults(),
            'stats' => [
                'total' => count($users),
                'open' => collect($users)->where('blocked', false)->count(),
                'blocked' => collect($users)->where('blocked', true)->count(),
                'withRecentLogin' => collect($users)->filter(fn ($user) => $user['lastVisitDate'] !== null)->count(),
            ],
        ];
    }

    private function mapUser(object $row): array
    {
        return [
            'userId' => (string) $row->userid,
            'realName' => (string) $row->realname,
            'phone' => (string) ($row->phone ?? ''),
            'email' => (string) ($row->email ?? ''),
            'customerId' => (string) ($row->customerid ?? ''),
            'branchCode' => (string) ($row->branchcode ?? ''),
            'supplierId' => (string) ($row->supplierid ?? ''),
            'salesman' => (string) ($row->salesman ?? ''),
            'lastVisitDate' => $row->lastvisitdate ? (string) $row->lastvisitdate : null,
            'securityRoleId' => (int) $row->fullaccess,
            'securityRoleName' => (string) ($row->secrolename ?? 'Unassigned'),
            'canCreateTender' => ((int) ($row->cancreatetender ?? 0)) === 1,
            'pageSize' => (string) ($row->pagesize ?? 'A4'),
            'defaultLocation' => (string) ($row->defaultlocation ?? ''),
            'defaultLocationName' => (string) ($row->locationname ?? ''),
            'modulesAllowed' => $this->modulesFromString((string) ($row->modulesallowed ?? '')),
            'showDashboard' => ((int) ($row->showdashboard ?? 0)) === 1,
            'showPageHelp' => ((int) ($row->showpagehelp ?? 1)) === 1,
            'showFieldHelp' => ((int) ($row->showfieldhelp ?? 1)) === 1,
            'blocked' => ((int) ($row->blocked ?? 0)) === 1,
            'theme' => (string) ($row->theme ?? 'fresh'),
            'language' => (string) ($row->language ?? 'en_GB.utf8'),
            'pdfLanguage' => (int) ($row->pdflanguage ?? 0),
            'department' => (int) ($row->department ?? 0),
        ];
    }

    private function lookups(): array
    {
        return [
            'securityRoles' => DB::table('securityroles')
                ->select('secroleid', 'secrolename')
                ->orderBy('secrolename')
                ->get()
                ->map(fn ($row) => [
                    'value' => (int) $row->secroleid,
                    'label' => (string) $row->secrolename,
                ])
                ->all(),
            'locations' => DB::table('locations')
                ->select('loccode', 'locationname')
                ->orderBy('locationname')
                ->get()
                ->map(fn ($row) => [
                    'value' => (string) $row->loccode,
                    'label' => trim((string) $row->locationname) . ' (' . (string) $row->loccode . ')',
                ])
                ->all(),
            'salespeople' => Schema::hasTable('salesman')
                ? DB::table('salesman')
                    ->select('salesmancode', 'salesmanname')
                    ->where('current', 1)
                    ->orderBy('salesmanname')
                    ->get()
                    ->map(fn ($row) => [
                        'value' => (string) $row->salesmancode,
                        'label' => (string) $row->salesmanname,
                    ])
                    ->all()
                : [],
            'departments' => Schema::hasTable('departments')
                ? DB::table('departments')
                    ->select('departmentid', 'description')
                    ->orderBy('description')
                    ->get()
                    ->map(fn ($row) => [
                        'value' => (int) $row->departmentid,
                        'label' => (string) $row->description,
                    ])
                    ->all()
                : [],
            'pageSizes' => [
                ['value' => 'A4', 'label' => 'A4'],
                ['value' => 'A3', 'label' => 'A3'],
                ['value' => 'A3_Landscape', 'label' => 'A3 landscape'],
                ['value' => 'Letter', 'label' => 'Letter'],
                ['value' => 'Letter_Landscape', 'label' => 'Letter landscape'],
                ['value' => 'Legal', 'label' => 'Legal'],
                ['value' => 'Legal_Landscape', 'label' => 'Legal landscape'],
            ],
            'themes' => $this->themes(),
            'languages' => [
                ['value' => 'en_GB.utf8', 'label' => 'English'],
            ],
            'pdfLanguages' => [
                ['value' => 0, 'label' => 'Latin Western Languages - Times'],
                ['value' => 1, 'label' => 'Eastern European, Russian, Japanese, Korean, Hebrew, Arabic, Thai'],
                ['value' => 2, 'label' => 'Chinese'],
                ['value' => 3, 'label' => 'Free Serif'],
            ],
            'modules' => self::MODULES,
        ];
    }

    private function defaults(): array
    {
        $firstRole = DB::table('securityroles')->orderBy('secrolename')->value('secroleid');
        $firstLocation = DB::table('locations')->orderBy('locationname')->value('loccode');

        return [
            'userId' => '',
            'password' => '',
            'realName' => '',
            'phone' => '',
            'email' => '',
            'customerId' => '',
            'branchCode' => '',
            'supplierId' => '',
            'salesman' => '',
            'pageSize' => 'A4',
            'securityRoleId' => (int) ($firstRole ?? 1),
            'canCreateTender' => false,
            'defaultLocation' => (string) ($firstLocation ?? ''),
            'modulesAllowed' => array_fill(0, count(self::MODULES), true),
            'showDashboard' => false,
            'showPageHelp' => true,
            'showFieldHelp' => true,
            'blocked' => false,
            'theme' => $this->themes()[0]['value'] ?? 'fresh',
            'language' => 'en_GB.utf8',
            'pdfLanguage' => 0,
            'department' => 0,
        ];
    }

    private function modulesFromString(string $value): array
    {
        $parts = array_map('trim', explode(',', $value));
        $modules = [];

        for ($index = 0; $index < count(self::MODULES); $index += 1) {
            $modules[] = ($parts[$index] ?? '1') !== '0';
        }

        return $modules;
    }

    private function modulesToString(array $modules): string
    {
        return collect($modules)
            ->take(count(self::MODULES))
            ->map(fn ($enabled) => $enabled ? '1' : '0')
            ->implode(',') . ',';
    }

    private function themes(): array
    {
        $themePath = base_path('../weberp_updated/css');
        if (!is_dir($themePath)) {
            return [['value' => 'fresh', 'label' => 'fresh']];
        }

        $themes = collect(scandir($themePath) ?: [])
            ->filter(fn ($entry) => $entry !== '.' && $entry !== '..' && $entry !== '.svn' && is_dir($themePath . DIRECTORY_SEPARATOR . $entry))
            ->values()
            ->map(fn ($entry) => ['value' => $entry, 'label' => $entry])
            ->all();

        return count($themes) > 0 ? $themes : [['value' => 'fresh', 'label' => 'fresh']];
    }

    private function createDefaultAuthorisations(string $userId, string $defaultLocation): void
    {
        if ($defaultLocation !== '' && Schema::hasTable('locationusers')) {
            DB::table('locationusers')->updateOrInsert(
                ['userid' => $userId, 'loccode' => $defaultLocation],
                ['canview' => 1, 'canupd' => 1]
            );
        }

        if (Schema::hasTable('glaccountusers') && Schema::hasTable('chartmaster')) {
            DB::insert(
                'INSERT INTO glaccountusers (userid, accountcode, canview, canupd)
                 SELECT ?, accountcode, 1, 1 FROM chartmaster
                 WHERE NOT EXISTS (
                    SELECT 1 FROM glaccountusers
                    WHERE glaccountusers.userid = ? AND glaccountusers.accountcode = chartmaster.accountcode
                 )',
                [$userId, $userId]
            );
        }
    }
}
