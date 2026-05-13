<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class AuditTrail extends Model
{
    use SoftDeletes;

    protected $table = 'audittrail';

    protected $guarded = [];

    protected $casts = [
        'transactiondate' => 'datetime',
        'old_values' => 'array',
        'new_values' => 'array',
        'bindings' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];
}
