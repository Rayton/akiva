<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ApPayment extends Model
{
    use SoftDeletes;
    use Auditable;

    protected $fillable = ['supplier_id', 'payment_date', 'payment_method', 'reference', 'amount', 'status', 'notes'];
    protected $casts = ['payment_date' => 'date'];
}
