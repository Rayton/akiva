<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ApBill extends Model
{
    use SoftDeletes;
    use Auditable;

    protected $fillable = ['supplier_id', 'bill_number', 'bill_date', 'due_date', 'status', 'subtotal', 'tax_total', 'total', 'amount_paid', 'amount_due', 'memo'];
    protected $casts = ['bill_date' => 'date', 'due_date' => 'date'];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(ApSupplier::class, 'supplier_id');
    }
}
