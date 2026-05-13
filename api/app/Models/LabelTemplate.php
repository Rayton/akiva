<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class LabelTemplate extends Model
{
    use Auditable, SoftDeletes;

    protected $table = 'labels';

    protected $primaryKey = 'labelid';

    protected $guarded = [];

    protected $casts = [
        'pagewidth' => 'float',
        'pageheight' => 'float',
        'height' => 'float',
        'width' => 'float',
        'topmargin' => 'float',
        'leftmargin' => 'float',
        'rowheight' => 'float',
        'columnwidth' => 'float',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    public function fields(): HasMany
    {
        return $this->hasMany(LabelField::class, 'labelid', 'labelid')->orderBy('vpos')->orderBy('hpos');
    }
}
