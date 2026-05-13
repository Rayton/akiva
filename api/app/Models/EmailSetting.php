<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmailSetting extends Model
{
    use Auditable, SoftDeletes;

    protected $table = 'emailsettings';

    protected $guarded = [];

    protected $hidden = [
        'password',
    ];

    protected $casts = [
        'port' => 'integer',
        'timeout' => 'integer',
        'auth' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];
}
