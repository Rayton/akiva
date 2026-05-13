<?php

namespace App\Models\Concerns;

use App\Support\AuditTrailLogger;

trait Auditable
{
    public static function bootAuditable(): void
    {
        static::created(function ($model) {
            AuditTrailLogger::logModelEvent($model, 'created', [], $model->getAuditNewValues());
        });

        static::updated(function ($model) {
            AuditTrailLogger::logModelEvent($model, 'updated', $model->getAuditOldValues(), $model->getAuditNewValues());
        });

        static::deleted(function ($model) {
            AuditTrailLogger::logModelEvent($model, 'deleted', $model->getAuditOldValues(), []);
        });

        if (method_exists(static::class, 'restored')) {
            static::restored(function ($model) {
                AuditTrailLogger::logModelEvent($model, 'restored', [], $model->getAuditNewValues());
            });
        }
    }

    public function getAuditOldValues(): array
    {
        return $this->filterAuditValues($this->getOriginal());
    }

    public function getAuditNewValues(): array
    {
        return $this->filterAuditValues($this->getAttributes());
    }

    private function filterAuditValues(array $values): array
    {
        $hidden = array_flip($this->getHidden());

        return collect($values)
            ->reject(function ($value, $key) use ($hidden) {
                return isset($hidden[$key]) || preg_match('/password|remember_token|api[_-]?key|secret|token/i', (string) $key) === 1;
            })
            ->all();
    }
}
