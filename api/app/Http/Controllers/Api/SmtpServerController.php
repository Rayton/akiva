<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class SmtpServerController extends Controller
{
    private array $encryptionOptions = ['none', 'tls', 'ssl'];

    public function show()
    {
        return response()->json([
            'success' => true,
            'data' => $this->payload(),
        ]);
    }

    public function update(Request $request)
    {
        $validator = $this->validator($request);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $setting = $this->setting();
        $values = $this->values($request, $setting);

        DB::transaction(function () use ($request, $setting, $values) {
            $setting->fill($values);
            $setting->save();

            DB::table('config')->updateOrInsert(
                ['confname' => 'SmtpSetting'],
                ['confvalue' => $request->boolean('enabled') ? '1' : '0']
            );
        });

        return response()->json([
            'success' => true,
            'message' => 'SMTP server settings saved.',
            'data' => $this->payload(),
        ]);
    }

    public function test(Request $request)
    {
        $validator = $this->validator($request, true);
        if ($validator->fails()) {
            return $this->validationResponse($validator);
        }

        $host = trim((string) $request->input('host'));
        $port = (int) $request->input('port');
        $timeout = (int) $request->input('timeout', 5);
        $encryption = (string) $request->input('encryption', 'none');
        $target = $encryption === 'ssl' ? 'ssl://'.$host : $host;
        $started = microtime(true);
        $errorNumber = 0;
        $errorMessage = '';

        $connection = @fsockopen($target, $port, $errorNumber, $errorMessage, $timeout);
        $elapsed = (int) round((microtime(true) - $started) * 1000);

        if (is_resource($connection)) {
            fclose($connection);

            return response()->json([
                'success' => true,
                'message' => 'SMTP server is reachable.',
                'data' => [
                    'test' => [
                        'status' => 'pass',
                        'host' => $host,
                        'port' => $port,
                        'elapsedMs' => $elapsed,
                    ],
                    ...$this->payload(),
                ],
            ]);
        }

        return response()->json([
            'success' => false,
            'message' => $errorMessage !== '' ? $errorMessage : 'SMTP server could not be reached.',
            'data' => [
                'test' => [
                    'status' => 'failed',
                    'host' => $host,
                    'port' => $port,
                    'elapsedMs' => $elapsed,
                    'errorCode' => $errorNumber,
                ],
                ...$this->payload(),
            ],
        ], 422);
    }

    private function validator(Request $request, bool $forTest = false)
    {
        return Validator::make($request->all(), [
            'enabled' => [$forTest ? 'nullable' : 'required', 'boolean'],
            'host' => ['required', 'string', 'max:255', 'not_regex:/^https?:\/\//i'],
            'port' => ['required', 'integer', 'min:1', 'max:65535'],
            'heloAddress' => ['nullable', 'string', 'max:255'],
            'auth' => ['required', 'boolean'],
            'username' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:255'],
            'timeout' => ['required', 'integer', 'min:1', 'max:120'],
            'encryption' => ['required', 'string', Rule::in($this->encryptionOptions)],
            'fromAddress' => ['nullable', 'email', 'max:255'],
            'fromName' => ['nullable', 'string', 'max:255'],
        ], [
            'host.not_regex' => 'Server host should be a hostname, for example smtp.example.com.',
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

    private function setting(): EmailSetting
    {
        $setting = EmailSetting::query()->orderBy('id')->first();
        if ($setting) {
            return $setting;
        }

        return new EmailSetting([
            'host' => '',
            'port' => 25,
            'heloaddress' => '',
            'username' => '',
            'password' => '',
            'timeout' => 5,
            'auth' => false,
            'encryption' => 'none',
            'from_address' => null,
            'from_name' => null,
        ]);
    }

    private function values(Request $request, EmailSetting $setting): array
    {
        $password = (string) $request->input('password', '');

        return [
            'host' => trim((string) $request->input('host')),
            'port' => (int) $request->input('port'),
            'heloaddress' => trim((string) $request->input('heloAddress', '')),
            'username' => trim((string) $request->input('username', '')),
            'password' => $password !== '' ? $password : (string) $setting->password,
            'timeout' => (int) $request->input('timeout'),
            'auth' => $request->boolean('auth'),
            'encryption' => (string) $request->input('encryption', 'none'),
            'from_address' => trim((string) $request->input('fromAddress', '')) ?: null,
            'from_name' => trim((string) $request->input('fromName', '')) ?: null,
        ];
    }

    private function payload(): array
    {
        $setting = $this->setting();
        $enabled = DB::table('config')->where('confname', 'SmtpSetting')->value('confvalue');

        return [
            'settings' => [
                'enabled' => (string) $enabled === '1',
                'host' => (string) $setting->host,
                'port' => (int) ($setting->port ?: 25),
                'heloAddress' => (string) $setting->heloaddress,
                'auth' => (bool) $setting->auth,
                'username' => (string) $setting->username,
                'password' => '',
                'passwordConfigured' => trim((string) $setting->password) !== '',
                'timeout' => (int) ($setting->timeout ?: 5),
                'encryption' => (string) ($setting->encryption ?: 'none'),
                'fromAddress' => (string) ($setting->from_address ?? ''),
                'fromName' => (string) ($setting->from_name ?? ''),
                'updatedAt' => optional($setting->updated_at)->toJSON(),
            ],
            'lookups' => [
                'encryptionOptions' => [
                    ['value' => 'none', 'label' => 'None'],
                    ['value' => 'tls', 'label' => 'TLS'],
                    ['value' => 'ssl', 'label' => 'SSL'],
                ],
                'commonPorts' => [
                    ['value' => 25, 'label' => '25'],
                    ['value' => 465, 'label' => '465'],
                    ['value' => 587, 'label' => '587'],
                ],
            ],
        ];
    }
}
