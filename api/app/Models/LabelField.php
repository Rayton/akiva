<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class LabelField extends Model
{
    use Auditable, SoftDeletes;

    protected $table = 'labelfields';

    protected $primaryKey = 'labelfieldid';

    protected $guarded = [];

    protected $casts = [
        'labelid' => 'integer',
        'vpos' => 'float',
        'hpos' => 'float',
        'fontsize' => 'integer',
        'barcode' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    public function labelTemplate(): BelongsTo
    {
        return $this->belongsTo(LabelTemplate::class, 'labelid', 'labelid');
    }
}
