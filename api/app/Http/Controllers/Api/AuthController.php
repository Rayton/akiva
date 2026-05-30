<?php

namespace App\Http\Controllers\Api;

use App\Support\AkivaDatabase;
use App\Http\Controllers\Controller;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function signInEmail(Request $request)
    {
        if (!$this->controlHasTable('akiva_user_companies')) {
            return response()->json([
                'success' => false,
                'message' => 'Akiva user companies table has not been migrated.',
            ], 503);
        }
        if (!$this->controlHasTable('akiva_auth_sessions')) {
            return response()->json([
                'success' => false,
                'message' => 'Akiva auth session table has not been migrated.',
            ], 503);
        }

        $validator = Validator::make($request->all(), [
            'email' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
            'rememberMe' => ['sometimes', 'boolean'],
            'callbackURL' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $credentials = $validator->validated();
        $identifier = trim((string) $credentials['email']);
        $password = (string) $credentials['password'];
        ['user' => $user, 'company' => $company] = $this->resolveLoginUserAndCompany($identifier);

        if (!$user || !$this->verifyPassword($password, (string) $user->password, (string) $user->userid)) {
            return response()->json([
                'success' => false,
                'message' => 'The email/user ID or password is incorrect.',
            ], 401);
        }

        if ((int) ($user->blocked ?? 0) === 1) {
            return response()->json([
                'success' => false,
                'message' => 'This Akiva account is blocked. Contact an administrator.',
            ], 423);
        }

        if (!$this->userCanUseCompany((string) $user->userid, $company['database'])) {
            return response()->json([
                'success' => false,
                'message' => 'This user is not assigned to the default company.',
            ], 403);
        }

        $now = now();
        DB::table('www_users')
            ->where('userid', (string) $user->userid)
            ->update(['lastvisitdate' => $now->format('Y-m-d H:i:s')]);

        $session = $this->createSession(
            (string) $user->userid,
            $company,
            $request,
            $request->boolean('rememberMe')
        );

        return response()->json([
            'success' => true,
            'message' => 'Signed in.',
            'data' => [
                'token' => $session['token'],
                'expiresAt' => $session['expiresAt'],
                'user' => $this->mapUser($user, $company),
                'company' => $company,
                'url' => $this->safeCallbackUrl((string) ($credentials['callbackURL'] ?? '/dashboard')),
            ],
        ]);
    }

    public function session(Request $request)
    {
        $session = $this->sessionFromRequest($request);

        if (!$session) {
            return response()->json([
                'success' => false,
                'message' => 'No active Akiva session.',
            ], 401);
        }

        return response()->json([
            'success' => true,
            'data' => $session,
        ]);
    }

    public function signOut(Request $request)
    {
        $token = $this->bearerToken($request);
        if ($token !== '' && $this->controlHasTable('akiva_auth_sessions')) {
            AkivaDatabase::controlConnection()
                ->table('akiva_auth_sessions')
                ->where('token_hash', hash('sha256', $token))
                ->delete();
        }

        return response()->json([
            'success' => true,
            'message' => 'Signed out.',
        ]);
    }

    public function requestPasswordReset(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => ['required', 'string', 'max:255'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => 'If the account exists, ask an Akiva administrator to reset its password from User Management.',
            'data' => [
                'message' => 'If the account exists, ask an Akiva administrator to reset its password from User Management.',
            ],
        ]);
    }

    private function resolveLoginUserAndCompany(string $identifier): array
    {
        $fallbackCompany = $this->defaultCompanyForIdentifier($identifier);

        foreach ($this->loginCompanyCandidates($identifier) as $company) {
            if (!$this->switchToCompanyIfAvailable($company)) {
                continue;
            }

            $user = $this->findUser($identifier);
            if (!$user) {
                continue;
            }

            $defaultCompany = $this->defaultCompanyForUserId((string) $user->userid) ?? $company;
            if ($defaultCompany['database'] !== $company['database']) {
                $usingDefaultCompany = false;
                if ($this->switchToCompanyIfAvailable($defaultCompany)) {
                    $defaultUser = $this->findUser((string) $user->userid);
                    if ($defaultUser) {
                        $user = $defaultUser;
                        $company = $defaultCompany;
                        $usingDefaultCompany = true;
                    }
                }

                if (!$usingDefaultCompany) {
                    $this->switchToCompanyIfAvailable($company);
                }
            }

            return [
                'user' => $user,
                'company' => $company,
            ];
        }

        $this->switchToCompanyIfAvailable($fallbackCompany);

        return [
            'user' => null,
            'company' => $fallbackCompany,
        ];
    }

    private function loginCompanyCandidates(string $identifier): array
    {
        return $this->uniqueCompanies([
            $this->defaultCompanyForIdentifier($identifier),
            $this->defaultCompany(),
            ...$this->companyOptions($identifier),
            ...$this->companyOptions(),
        ]);
    }

    private function defaultCompanyForIdentifier(string $identifier): array
    {
        return $this->defaultCompanyForUserId($identifier) ?? $this->defaultCompany();
    }

    private function defaultCompanyForUserId(string $userId): ?array
    {
        $userId = trim($userId);
        if ($userId === '' || !$this->controlHasTable('akiva_user_companies')) {
            return null;
        }

        $row = AkivaDatabase::controlConnection()
            ->table('akiva_user_companies')
            ->whereRaw('LOWER(user_id) = ?', [Str::lower($userId)])
            ->where('active', 1)
            ->orderByDesc('is_default')
            ->orderBy('company_name')
            ->first();

        return $row ? $this->mapCompanyRow($row) : null;
    }

    private function switchToCompanyIfAvailable(array $company): bool
    {
        try {
            AkivaDatabase::switchToCompanyDatabase((string) ($company['database'] ?? ''));
            return Schema::hasTable('www_users');
        } catch (\Throwable) {
            return false;
        }
    }

    private function uniqueCompanies(array $companies): array
    {
        $seen = [];
        $unique = [];

        foreach ($companies as $company) {
            $database = (string) ($company['database'] ?? '');
            if ($database === '' || isset($seen[$database])) {
                continue;
            }

            $seen[$database] = true;
            $unique[] = $company;
        }

        return $unique;
    }

    private function companyOptions(string $identifier = ''): array
    {
        if (!$this->controlHasTable('akiva_user_companies')) {
            return [$this->defaultCompany()];
        }

        $query = AkivaDatabase::controlConnection()
            ->table('akiva_user_companies')
            ->where('active', 1);

        if ($identifier !== '') {
            $query->whereRaw('LOWER(user_id) = ?', [Str::lower($identifier)]);
        }

        $rows = $this->companyRows($query);
        if ($identifier !== '' && count($rows) === 0) {
            $rows = $this->companyRows(
                AkivaDatabase::controlConnection()
                    ->table('akiva_user_companies')
                    ->where('active', 1)
            );
        }

        return count($rows) > 0 ? $rows : [$this->defaultCompany()];
    }

    private function companyRows(Builder $query): array
    {
        return $query
            ->select('company_name', 'database_name', DB::raw('MAX(is_default) as is_default'))
            ->groupBy('company_name', 'database_name')
            ->orderByDesc('is_default')
            ->orderBy('company_name')
            ->get()
            ->map(fn ($row) => $this->mapCompanyRow($row))
            ->values()
            ->all();
    }

    private function mapCompanyRow(object $row): array
    {
        return [
            'database' => (string) $row->database_name,
            'name' => (string) $row->company_name,
            'isDefault' => ((int) ($row->is_default ?? 0)) === 1,
        ];
    }

    private function companyForDatabase(string $database): ?array
    {
        try {
            $database = AkivaDatabase::validateDatabaseName($database);
        } catch (\InvalidArgumentException) {
            return null;
        }

        foreach ($this->companyOptions() as $company) {
            if ($company['database'] === $database) {
                return $company;
            }
        }

        return null;
    }

    private function defaultCompany(): array
    {
        $database = AkivaDatabase::defaultDatabaseName();
        $name = $database;
        $controlConnection = AkivaDatabase::controlConnectionName();

        if ($database !== '' && Schema::connection($controlConnection)->hasTable('companies')) {
            $name = (string) (AkivaDatabase::controlConnection()->table('companies')->where('coycode', 1)->value('coyname') ?: $name);
        }

        return [
            'database' => $database,
            'name' => $name,
            'isDefault' => true,
        ];
    }

    private function userCanUseCompany(string $userId, string $database): bool
    {
        if (!$this->controlHasTable('akiva_user_companies')) {
            return $database === AkivaDatabase::defaultDatabaseName();
        }

        return AkivaDatabase::controlConnection()
            ->table('akiva_user_companies')
            ->whereRaw('LOWER(user_id) = ?', [Str::lower($userId)])
            ->where('database_name', $database)
            ->where('active', 1)
            ->exists();
    }

    private function findUser(string $identifier): ?object
    {
        return DB::table('www_users as wu')
            ->leftJoin('securityroles as sr', 'sr.secroleid', '=', 'wu.fullaccess')
            ->leftJoin('locations as l', 'l.loccode', '=', 'wu.defaultlocation')
            ->select(
                'wu.*',
                'sr.secrolename',
                'l.locationname'
            )
            ->where(function ($query) use ($identifier) {
                $query
                    ->whereRaw('LOWER(wu.email) = ?', [Str::lower($identifier)])
                    ->orWhereRaw('LOWER(wu.userid) = ?', [Str::lower($identifier)]);
            })
            ->first();
    }

    private function verifyPassword(string $password, string $hash, string $userId): bool
    {
        if ($hash !== '' && password_verify($password, $hash)) {
            return true;
        }

        $legacyMatches = (
            hash_equals(sha1($password), $hash) ||
            hash_equals(md5($password), $hash) ||
            hash_equals($password, $hash)
        );

        if ($legacyMatches) {
            DB::table('www_users')
                ->where('userid', $userId)
                ->update(['password' => password_hash($password, PASSWORD_DEFAULT)]);
        }

        return $legacyMatches;
    }

    private function createSession(string $userId, array $company, Request $request, bool $rememberMe): array
    {
        $now = now();
        $expiresAt = $rememberMe ? $now->copy()->addDays(30) : $now->copy()->addHours(12);
        $token = bin2hex(random_bytes(32));

        AkivaDatabase::controlConnection()->table('akiva_auth_sessions')->where('expires_at', '<=', $now)->delete();
        AkivaDatabase::controlConnection()->table('akiva_auth_sessions')->insert([
            'user_id' => $userId,
            'company_database' => $company['database'],
            'company_name' => $company['name'],
            'token_hash' => hash('sha256', $token),
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 1000),
            'last_seen_at' => $now,
            'expires_at' => $expiresAt,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return [
            'token' => $token,
            'expiresAt' => $expiresAt->toIso8601String(),
        ];
    }

    private function sessionFromRequest(Request $request): ?array
    {
        $token = $this->bearerToken($request);
        if ($token === '' || !$this->controlHasTable('akiva_auth_sessions')) {
            return null;
        }

        $row = AkivaDatabase::controlConnection()
            ->table('akiva_auth_sessions')
            ->where('token_hash', hash('sha256', $token))
            ->where('expires_at', '>', now())
            ->first();

        if (!$row) {
            return null;
        }

        $company = [
            'database' => (string) ($row->company_database ?: AkivaDatabase::defaultDatabaseName()),
            'name' => (string) ($row->company_name ?: ($row->company_database ?: AkivaDatabase::defaultDatabaseName())),
            'isDefault' => false,
        ];

        AkivaDatabase::switchToCompanyDatabase($company['database']);

        if (!Schema::hasTable('www_users')) {
            return null;
        }

        $user = $this->findUser((string) $row->user_id);
        if (!$user || (int) ($user->blocked ?? 0) === 1) {
            return null;
        }

        AkivaDatabase::controlConnection()
            ->table('akiva_auth_sessions')
            ->where('id', $row->id)
            ->update([
                'last_seen_at' => now(),
                'updated_at' => now(),
            ]);

        return [
            'token' => $token,
            'expiresAt' => (string) $row->expires_at,
            'user' => $this->mapUser($user, $company),
            'company' => $company,
        ];
    }

    private function bearerToken(Request $request): string
    {
        $header = trim((string) $request->header('Authorization', ''));
        if (preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            return trim($matches[1]);
        }

        return trim((string) $request->header('X-Akiva-Auth', ''));
    }

    private function mapUser(object $row, ?array $company = null): array
    {
        return [
            'id' => (string) $row->userid,
            'name' => (string) ($row->realname ?: $row->userid),
            'email' => (string) ($row->email ?? ''),
            'role' => (string) ($row->secrolename ?? ('Role ' . (int) ($row->fullaccess ?? 0))),
            'companyDatabase' => $company['database'] ?? '',
            'companyName' => $company['name'] ?? '',
            'defaultLocation' => (string) ($row->defaultlocation ?? ''),
            'defaultLocationName' => (string) ($row->locationname ?? ''),
            'securityRoleId' => (int) ($row->fullaccess ?? 0),
            'modulesAllowed' => $this->modulesFromString((string) ($row->modulesallowed ?? '')),
            'showDashboard' => ((int) ($row->showdashboard ?? 0)) === 1,
        ];
    }

    private function modulesFromString(string $value): array
    {
        $parts = array_map('trim', explode(',', $value));
        $modules = [];

        for ($index = 0; $index < 12; $index += 1) {
            $modules[] = ($parts[$index] ?? '1') !== '0';
        }

        return $modules;
    }

    private function safeCallbackUrl(string $callbackUrl): string
    {
        if ($callbackUrl === '' || str_starts_with($callbackUrl, '//') || preg_match('/^https?:\/\//i', $callbackUrl)) {
            return '/dashboard';
        }

        return str_starts_with($callbackUrl, '/') ? $callbackUrl : '/dashboard';
    }

    private function controlHasTable(string $table): bool
    {
        return Schema::connection(AkivaDatabase::controlConnectionName())->hasTable($table);
    }
}
