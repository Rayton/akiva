<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class AuditTrailLogger
{
    private const AUDIT_TABLE = 'audittrail';

    private const IGNORED_TABLES = [
        'audittrail',
        'audit_trails',
        'cache',
        'cache_locks',
        'failed_jobs',
        'job_batches',
        'jobs',
        'migrations',
        'password_reset_tokens',
        'sessions',
    ];

    private static ?array $auditColumns = null;

    public static function logQuery(QueryExecuted $query): void
    {
        $operation = self::queryOperation($query->sql);
        if ($operation === null || !self::shouldLog()) {
            return;
        }

        $tableName = self::queryTable($query->sql, $operation);
        if ($tableName === null || in_array(strtolower($tableName), self::IGNORED_TABLES, true)) {
            return;
        }

        self::write([
            'event' => $operation,
            'source' => 'query',
            'table_name' => $tableName,
            'querystring' => self::interpolateSql($query->sql, $query->bindings),
            'bindings' => self::safeJson(self::sanitizeValue($query->bindings, $query->sql)),
            'execution_ms' => (int) round($query->time),
        ]);
    }

    public static function logModelEvent(Model $model, string $event, array $oldValues = [], array $newValues = []): void
    {
        if (!self::shouldLog()) {
            return;
        }

        self::write([
            'event' => $event,
            'source' => 'model',
            'table_name' => $model->getTable(),
            'auditable_type' => $model::class,
            'auditable_id' => (string) $model->getKey(),
            'old_values' => self::safeJson(self::sanitizeValue($oldValues)),
            'new_values' => self::safeJson(self::sanitizeValue($newValues)),
            'querystring' => sprintf('MODEL %s %s#%s', strtoupper($event), $model::class, (string) $model->getKey()),
        ]);
    }

    private static function write(array $attributes): void
    {
        try {
            if (!Schema::hasTable(self::AUDIT_TABLE)) {
                return;
            }

            $now = now();
            $request = request();
            $userId = self::resolveUserId();
            $payload = [
                'transactiondate' => $now->toDateTimeString(),
                'userid' => $userId,
                'querystring' => (string) ($attributes['querystring'] ?? ''),
                'event' => $attributes['event'] ?? null,
                'source' => $attributes['source'] ?? null,
                'table_name' => $attributes['table_name'] ?? null,
                'auditable_type' => $attributes['auditable_type'] ?? null,
                'auditable_id' => $attributes['auditable_id'] ?? null,
                'old_values' => $attributes['old_values'] ?? null,
                'new_values' => $attributes['new_values'] ?? null,
                'bindings' => $attributes['bindings'] ?? null,
                'url' => $request?->fullUrl(),
                'request_method' => $request?->method(),
                'ip_address' => $request?->ip(),
                'user_agent' => $request?->userAgent(),
                'request_id' => (string) Str::uuid(),
                'execution_ms' => $attributes['execution_ms'] ?? null,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            $columns = self::auditColumns();
            DB::table(self::AUDIT_TABLE)->insert(array_intersect_key($payload, array_flip($columns)));
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private static function shouldLog(): bool
    {
        try {
            if (!Schema::hasTable(self::AUDIT_TABLE)) {
                return false;
            }

            if (Schema::hasTable('config')) {
                $months = DB::table('config')->where('confname', 'MonthsAuditTrail')->value('confvalue');
                if ($months !== null && is_numeric($months) && (int) $months <= 0) {
                    return false;
                }
            }

            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    private static function resolveUserId(): string
    {
        $request = request();
        $candidates = [
            Auth::user()?->email,
            Auth::user()?->name,
            $request?->header('X-Akiva-User'),
            $request?->header('X-User-Id'),
            $request?->user()?->email,
            $request?->user()?->name,
            'api',
        ];

        try {
            if (Schema::hasTable('www_users')) {
                foreach ($candidates as $candidate) {
                    $candidate = substr(trim((string) $candidate), 0, 20);
                    if ($candidate !== '' && DB::table('www_users')->where('userid', $candidate)->exists()) {
                        return $candidate;
                    }
                }

                $admin = DB::table('www_users')->where('userid', 'admin')->value('userid');
                if ($admin !== null) {
                    return 'admin';
                }

                $firstUser = DB::table('www_users')->orderBy('userid')->value('userid');
                if ($firstUser !== null) {
                    return substr((string) $firstUser, 0, 20);
                }
            }
        } catch (\Throwable) {
            // Fall through to the API actor.
        }

        return 'api';
    }

    private static function auditColumns(): array
    {
        if (self::$auditColumns !== null) {
            return self::$auditColumns;
        }

        return self::$auditColumns = Schema::getColumnListing(self::AUDIT_TABLE);
    }

    private static function queryOperation(string $sql): ?string
    {
        if (preg_match('/^\s*(insert|update|delete)\b/i', $sql, $matches) !== 1) {
            return null;
        }

        return strtolower($matches[1]);
    }

    private static function queryTable(string $sql, string $operation): ?string
    {
        $patterns = [
            'insert' => '/^\s*insert\s+(?:ignore\s+)?into\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i',
            'update' => '/^\s*update\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i',
            'delete' => '/^\s*delete\s+from\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i',
        ];

        if (preg_match($patterns[$operation], $sql, $matches) !== 1) {
            return null;
        }

        return $matches[1];
    }

    private static function interpolateSql(string $sql, array $bindings): string
    {
        $redactAll = self::containsSensitiveKey($sql);
        foreach ($bindings as $binding) {
            $replacement = $redactAll ? "'[redacted]'" : self::quoteBinding($binding);
            $sql = preg_replace('/\?/', $replacement, $sql, 1) ?? $sql;
        }

        return $sql;
    }

    private static function quoteBinding(mixed $binding): string
    {
        if ($binding === null) {
            return 'NULL';
        }

        if ($binding instanceof \DateTimeInterface) {
            return "'" . $binding->format('Y-m-d H:i:s') . "'";
        }

        if (is_bool($binding)) {
            return $binding ? '1' : '0';
        }

        if (is_int($binding) || is_float($binding)) {
            return (string) $binding;
        }

        return "'" . str_replace("'", "''", (string) $binding) . "'";
    }

    private static function sanitizeValue(mixed $value, string $context = ''): mixed
    {
        if (self::containsSensitiveKey($context)) {
            return '[redacted]';
        }

        if (is_array($value)) {
            $clean = [];
            foreach ($value as $key => $item) {
                $keyString = (string) $key;
                $clean[$key] = self::containsSensitiveKey($keyString) ? '[redacted]' : self::sanitizeValue($item);
            }

            return $clean;
        }

        return $value;
    }

    private static function containsSensitiveKey(string $value): bool
    {
        return preg_match('/password|remember_token|api[_-]?key|secret|token/i', $value) === 1;
    }

    private static function safeJson(mixed $value): ?string
    {
        $encoded = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return $encoded === false ? null : $encoded;
    }
}
