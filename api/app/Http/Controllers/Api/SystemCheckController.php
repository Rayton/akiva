<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SystemCheckController extends Controller
{
    public function show()
    {
        $sections = [
            $this->applicationSection(),
            $this->databaseSection(),
            $this->storageSection(),
            $this->configurationSection(),
            $this->dataSection(),
        ];

        $items = collect($sections)->flatMap(fn ($section) => $section['items']);
        $failed = $items->where('status', 'fail')->count();
        $warnings = $items->where('status', 'warning')->count();
        $passed = $items->where('status', 'pass')->count();

        return response()->json([
            'success' => true,
            'data' => [
                'summary' => [
                    'status' => $failed > 0 ? 'fail' : ($warnings > 0 ? 'warning' : 'pass'),
                    'passed' => $passed,
                    'warnings' => $warnings,
                    'failed' => $failed,
                    'total' => $items->count(),
                    'checkedAt' => now()->toIso8601String(),
                    'environment' => (string) config('app.env'),
                ],
                'sections' => $sections,
            ],
        ]);
    }

    private function applicationSection(): array
    {
        $requiredExtensions = ['bcmath', 'ctype', 'curl', 'fileinfo', 'json', 'mbstring', 'openssl', 'pdo', 'tokenizer', 'xml'];

        $items = [
            $this->item(
                'PHP version',
                version_compare(PHP_VERSION, '8.2.0', '>=') ? 'pass' : 'fail',
                PHP_VERSION,
                'Laravel requires PHP 8.2 or newer.'
            ),
            $this->item(
                'Laravel framework',
                'pass',
                app()->version(),
                'Application framework is available.'
            ),
            $this->item(
                'Application key',
                config('app.key') ? 'pass' : 'fail',
                config('app.key') ? 'Configured' : 'Missing',
                'Required for encrypted application data.'
            ),
            $this->item(
                'Debug mode',
                config('app.debug') ? 'warning' : 'pass',
                config('app.debug') ? 'Enabled' : 'Disabled',
                config('app.debug') ? 'Disable debug mode outside development.' : 'Debug output is disabled.'
            ),
        ];

        foreach ($requiredExtensions as $extension) {
            $items[] = $this->item(
                sprintf('PHP extension: %s', $extension),
                extension_loaded($extension) ? 'pass' : 'fail',
                extension_loaded($extension) ? 'Loaded' : 'Missing',
                'Required by Laravel or common Akiva services.'
            );
        }

        return $this->section('application', 'Application runtime', 'PHP, framework, and required runtime capabilities.', 'Server', $items);
    }

    private function databaseSection(): array
    {
        $items = [];

        try {
            DB::connection()->getPdo();
            $version = DB::selectOne('select version() as version');
            $charset = DB::selectOne('select @@character_set_database as charset, @@collation_database as collation');
            $databaseName = (string) DB::connection()->getDatabaseName();
            $tableCount = DB::table('information_schema.tables')
                ->where('table_schema', $databaseName)
                ->count();

            $items[] = $this->item('Database connection', 'pass', 'Connected', 'Akiva can connect to the configured database.');
            $items[] = $this->item('Database server', 'pass', (string) ($version->version ?? 'Available'), 'Server version reported by the database.');
            $items[] = $this->item(
                'Database charset',
                str_contains(strtolower((string) ($charset->charset ?? '')), 'utf8') ? 'pass' : 'warning',
                trim(sprintf('%s %s', $charset->charset ?? 'Unknown', $charset->collation ?? '')),
                'UTF-8 character sets are recommended.'
            );
            $items[] = $this->item('Database tables', $tableCount > 0 ? 'pass' : 'fail', (string) $tableCount, 'Tables found in the configured schema.');
        } catch (\Throwable $e) {
            $items[] = $this->item('Database connection', 'fail', 'Unavailable', $e->getMessage());
        }

        foreach (['config', 'menu', 'www_users', 'audittrail'] as $table) {
            $exists = $this->tableExists($table);
            $items[] = $this->item(
                sprintf('Required table: %s', $table),
                $exists ? 'pass' : 'fail',
                $exists ? 'Present' : 'Missing',
                'Core table used by migrated Akiva screens.'
            );
        }

        return $this->section('database', 'Database', 'Connectivity, schema, and required tables.', 'Database', $items);
    }

    private function storageSection(): array
    {
        $paths = [
            ['label' => 'Storage directory', 'path' => storage_path()],
            ['label' => 'Cache directory', 'path' => storage_path('framework/cache')],
            ['label' => 'Views directory', 'path' => storage_path('framework/views')],
            ['label' => 'Sessions directory', 'path' => storage_path('framework/sessions')],
            ['label' => 'Logs directory', 'path' => storage_path('logs')],
        ];

        $items = collect($paths)->map(function ($path) {
            $exists = is_dir($path['path']);
            $writable = $exists && is_writable($path['path']);

            return $this->item(
                $path['label'],
                $writable ? 'pass' : 'fail',
                $writable ? 'Writable' : ($exists ? 'Not writable' : 'Missing'),
                $path['path']
            );
        })->values()->all();

        return $this->section('storage', 'Storage and logs', 'Writable directories required for cache, sessions, and logs.', 'FolderCheck', $items);
    }

    private function configurationSection(): array
    {
        $auditMonths = $this->configValue('MonthsAuditTrail');
        $logPath = $this->configValue('LogPath');

        return $this->section('configuration', 'System configuration', 'Operational settings that affect reliability and traceability.', 'Settings2', [
            $this->item('Audit trail retention', $auditMonths === null || (int) $auditMonths > 0 ? 'pass' : 'warning', $auditMonths ?? 'Default', 'MonthsAuditTrail should be greater than zero when audit history is required.'),
            $this->item('Application timezone', config('app.timezone') ? 'pass' : 'warning', (string) config('app.timezone'), 'Used for displayed dates and scheduled work.'),
            $this->item('Cache driver', config('cache.default') ? 'pass' : 'warning', (string) config('cache.default'), 'Configured cache store.'),
            $this->item('Queue driver', config('queue.default') ? 'pass' : 'warning', (string) config('queue.default'), 'Configured background queue connection.'),
            $this->item('Log path setting', $logPath !== null ? 'pass' : 'warning', $logPath ?? 'Not configured', 'Optional legacy log path setting.'),
        ]);
    }

    private function dataSection(): array
    {
        return $this->section('data', 'Business data readiness', 'Core data needed by the main configuration screens.', 'ClipboardCheck', [
            $this->rowCountItem('Configuration records', 'config', 'System parameter records.'),
            $this->rowCountItem('Menu records', 'menu', 'Navigation menu records.'),
            $this->rowCountItem('User records', 'www_users', 'Application users.'),
            $this->rowCountItem('Fiscal periods', 'periods', 'Accounting periods.'),
            $this->rowCountItem('Currencies', 'currencies', 'Available trading currencies.'),
        ]);
    }

    private function rowCountItem(string $label, string $table, string $detail): array
    {
        if (!$this->tableExists($table)) {
            return $this->item($label, 'fail', 'Missing table', $detail);
        }

        try {
            $count = DB::table($table)->count();
            return $this->item($label, $count > 0 ? 'pass' : 'warning', (string) $count, $detail);
        } catch (\Throwable $e) {
            return $this->item($label, 'fail', 'Unavailable', $e->getMessage());
        }
    }

    private function tableExists(string $table): bool
    {
        try {
            return Schema::hasTable($table);
        } catch (\Throwable $e) {
            return false;
        }
    }

    private function configValue(string $name): ?string
    {
        if (!$this->tableExists('config')) {
            return null;
        }

        $value = DB::table('config')->where('confname', $name)->value('confvalue');
        return $value === null ? null : (string) $value;
    }

    private function section(string $id, string $title, string $description, string $icon, array $items): array
    {
        return compact('id', 'title', 'description', 'icon', 'items');
    }

    private function item(string $label, string $status, string $value, string $detail): array
    {
        return compact('label', 'status', 'value', 'detail');
    }
}
