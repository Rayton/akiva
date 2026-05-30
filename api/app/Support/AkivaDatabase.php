<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class AkivaDatabase
{
    public const CONTROL_CONNECTION = 'mysql_control';

    public static function controlConnectionName(): string
    {
        return config('database.connections.' . self::CONTROL_CONNECTION)
            ? self::CONTROL_CONNECTION
            : (string) config('database.default', 'mysql');
    }

    public static function controlConnection()
    {
        return DB::connection(self::controlConnectionName());
    }

    public static function defaultDatabaseName(): string
    {
        $connection = self::controlConnectionName();
        return (string) config("database.connections.$connection.database", '');
    }

    public static function switchToCompanyDatabase(string $database): void
    {
        $database = self::validateDatabaseName($database);
        $connection = (string) config('database.default', 'mysql');

        config(["database.connections.$connection.database" => $database]);
        DB::purge($connection);
        DB::reconnect($connection);
    }

    public static function validateDatabaseName(string $database): string
    {
        $database = trim($database);

        if ($database === '' || !preg_match('/^[A-Za-z0-9_]+$/', $database)) {
            throw new InvalidArgumentException('Company database is not valid.');
        }

        return $database;
    }
}
