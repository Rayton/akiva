<?php

namespace App\Http\Middleware;

use App\Support\AkivaDatabase;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;

class UseAkivaCompanyDatabase
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $this->bearerToken($request);

        if ($token !== '' && Schema::connection(AkivaDatabase::controlConnectionName())->hasTable('akiva_auth_sessions')) {
            $session = AkivaDatabase::controlConnection()
                ->table('akiva_auth_sessions')
                ->where('token_hash', hash('sha256', $token))
                ->where('expires_at', '>', now())
                ->first();

            $database = trim((string) ($session->company_database ?? ''));
            if ($database !== '') {
                AkivaDatabase::switchToCompanyDatabase($database);
                $request->attributes->set('akiva_company_database', $database);
                $request->attributes->set('akiva_company_name', (string) ($session->company_name ?? $database));
            }
        }

        return $next($request);
    }

    private function bearerToken(Request $request): string
    {
        $header = trim((string) $request->header('Authorization', ''));
        if (preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            return trim($matches[1]);
        }

        return trim((string) $request->header('X-Akiva-Auth', ''));
    }
}
