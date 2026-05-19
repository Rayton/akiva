<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ApSupplier extends Model
{
    use SoftDeletes;
    use Auditable;

    protected $fillable = ['supplier_code', 'name', 'email', 'phone', 'currency_code', 'payment_term_code', 'credit_limit', 'active'];
}
