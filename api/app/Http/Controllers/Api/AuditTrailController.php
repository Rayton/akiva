<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class AuditTrailController extends Controller
{
    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'user' => ['nullable', 'string', 'max:60'],
            'table' => ['nullable', 'string', 'max:128'],
            'event' => ['nullable', 'in:insert,update,delete,created,updated,deleted,restored'],
            'text' => ['nullable', 'string', 'max:120'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        if (!Schema::hasTable('audittrail')) {
            return response()->json([
                'success' => true,
                'data' => [
                    'records' => [],
                    'summary' => $this->emptySummary(),
                    'lookups' => $this->lookups(),
                    'pagination' => $this->pagination(1, (int) $request->integer('per_page', 50), 0),
                ],
            ]);
        }

        $page = max(1, (int) $request->integer('page', 1));
        $perPage = min(100, max(1, (int) $request->integer('per_page', 50)));
        $from = $this->fromDate($request->input('from'));
        $to = $this->toDate($request->input('to'));
        $selectedUser = trim((string) $request->input('user', ''));
        $selectedTable = trim((string) $request->input('table', ''));
        $selectedEvent = trim((string) $request->input('event', ''));
        $text = trim((string) $request->input('text', ''));
        $columns = Schema::getColumnListing('audittrail');

        $query = DB::table('audittrail')
            ->whereBetween('transactiondate', [$from->toDateTimeString(), $to->toDateTimeString()]);

        if (in_array('deleted_at', $columns, true)) {
            $query->whereNull('deleted_at');
        }

        if ($selectedUser !== '' && strtoupper($selectedUser) !== 'ALL') {
            $query->where('userid', $selectedUser);
        }

        if ($selectedTable !== '' && strtoupper($selectedTable) !== 'ALL') {
            $query->where(function ($tableQuery) use ($selectedTable, $columns) {
                if (in_array('table_name', $columns, true)) {
                    $tableQuery->where('table_name', $selectedTable);
                }
                $tableQuery
                    ->orWhere('querystring', 'like', '% ' . $selectedTable . '%')
                    ->orWhere('querystring', 'like', '%`' . $selectedTable . '`%');
            });
        }

        if ($selectedEvent !== '') {
            $legacyEvent = strtoupper($selectedEvent);
            $query->where(function ($eventQuery) use ($selectedEvent, $legacyEvent, $columns) {
                if (in_array('event', $columns, true)) {
                    $eventQuery->where('event', $selectedEvent);
                }
                $eventQuery->orWhere('querystring', 'like', $legacyEvent . ' %');
            });
        }

        if ($text !== '') {
            $query->where('querystring', 'like', '%' . $text . '%');
        }

        $total = (clone $query)->count();
        $rows = $query
            ->orderByDesc('transactiondate')
            ->offset(($page - 1) * $perPage)
            ->limit($perPage)
            ->get();

        $records = $rows->map(fn ($row) => $this->formatAuditRow($row))->values();

        return response()->json([
            'success' => true,
            'data' => [
                'records' => $records,
                'summary' => $this->summary($from, $to, $total),
                'lookups' => $this->lookups(),
                'pagination' => $this->pagination($page, $perPage, $total),
            ],
        ]);
    }

    private function fromDate(?string $value): Carbon
    {
        if ($value) {
            return Carbon::parse($value)->startOfDay();
        }

        $months = 1;
        if (Schema::hasTable('config')) {
            $configured = DB::table('config')->where('confname', 'MonthsAuditTrail')->value('confvalue');
            if (is_numeric($configured) && (int) $configured > 0) {
                $months = (int) $configured;
            }
        }

        return now()->subMonths($months)->startOfDay();
    }

    private function toDate(?string $value): Carbon
    {
        return $value ? Carbon::parse($value)->endOfDay() : now()->endOfDay();
    }

    private function formatAuditRow(object $row): array
    {
        $queryString = (string) ($row->querystring ?? '');
        $event = strtolower((string) ($row->event ?? $this->legacyEvent($queryString)));
        $tableName = (string) ($row->table_name ?? $this->legacyTable($queryString, $event));

        return [
            'transactionDate' => (string) $row->transactiondate,
            'userId' => (string) $row->userid,
            'event' => $event,
            'source' => (string) ($row->source ?? 'legacy'),
            'tableName' => trim($tableName),
            'auditableType' => (string) ($row->auditable_type ?? ''),
            'auditableId' => (string) ($row->auditable_id ?? ''),
            'queryString' => $queryString,
            'oldValues' => $this->decodeJson($row->old_values ?? null),
            'newValues' => $this->decodeJson($row->new_values ?? null),
            'url' => (string) ($row->url ?? ''),
            'requestMethod' => (string) ($row->request_method ?? ''),
            'ipAddress' => (string) ($row->ip_address ?? ''),
            'executionMs' => isset($row->execution_ms) ? (int) $row->execution_ms : null,
        ];
    }

    private function legacyEvent(string $queryString): string
    {
        if (preg_match('/^\s*(insert|update|delete)\b/i', $queryString, $matches) !== 1) {
            return 'unknown';
        }

        return strtolower($matches[1]);
    }

    private function legacyTable(string $queryString, string $event): string
    {
        $patterns = [
            'insert' => '/^\s*insert\s+(?:ignore\s+)?into\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i',
            'update' => '/^\s*update\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i',
            'delete' => '/^\s*delete\s+from\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i',
        ];

        if (!isset($patterns[$event]) || preg_match($patterns[$event], $queryString, $matches) !== 1) {
            return '';
        }

        return $matches[1];
    }

    private function decodeJson(mixed $value): array
    {
        if (!is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function lookups(): array
    {
        return [
            'users' => $this->users(),
            'tables' => $this->tables(),
        ];
    }

    private function users(): array
    {
        $users = collect();

        if (Schema::hasTable('www_users')) {
            $users = $users->merge(DB::table('www_users')->orderBy('userid')->pluck('userid'));
        }

        if (Schema::hasTable('audittrail')) {
            $users = $users->merge(DB::table('audittrail')->distinct()->orderBy('userid')->pluck('userid'));
        }

        return $users
            ->filter(fn ($value) => trim((string) $value) !== '')
            ->unique()
            ->values()
            ->map(fn ($value) => ['value' => (string) $value, 'label' => (string) $value])
            ->all();
    }

    private function tables(): array
    {
        $tables = collect();

        if (Schema::hasTable('audittrail') && Schema::hasColumn('audittrail', 'table_name')) {
            $tables = $tables->merge(DB::table('audittrail')->distinct()->whereNotNull('table_name')->pluck('table_name'));
        }

        try {
            foreach (DB::select('SHOW TABLES') as $row) {
                $values = array_values((array) $row);
                if (isset($values[0])) {
                    $tables->push((string) $values[0]);
                }
            }
        } catch (\Throwable) {
            // The audit view can work without a complete table lookup list.
        }

        return $tables
            ->filter(fn ($value) => trim((string) $value) !== '')
            ->unique()
            ->sort()
            ->values()
            ->map(fn ($value) => ['value' => (string) $value, 'label' => (string) $value])
            ->all();
    }

    private function summary(Carbon $from, Carbon $to, int $total): array
    {
        $latest = Schema::hasTable('audittrail')
            ? DB::table('audittrail')->max('transactiondate')
            : null;

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'total' => $total,
            'latest' => $latest ? (string) $latest : '',
        ];
    }

    private function emptySummary(): array
    {
        return [
            'from' => now()->subMonth()->toDateString(),
            'to' => now()->toDateString(),
            'total' => 0,
            'latest' => '',
        ];
    }

    private function pagination(int $page, int $perPage, int $total): array
    {
        return [
            'page' => $page,
            'perPage' => $perPage,
            'total' => $total,
            'lastPage' => max(1, (int) ceil($total / $perPage)),
        ];
    }
}
