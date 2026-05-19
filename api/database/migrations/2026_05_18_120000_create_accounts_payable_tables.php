<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('ap_suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('supplier_code', 30)->unique();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone', 60)->nullable();
            $table->string('currency_code', 10)->default('USD');
            $table->string('payment_term_code', 20)->nullable();
            $table->decimal('credit_limit', 18, 2)->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('ap_bills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('ap_suppliers');
            $table->string('bill_number', 50);
            $table->date('bill_date');
            $table->date('due_date');
            $table->string('status', 20)->default('draft');
            $table->decimal('subtotal', 18, 2)->default(0);
            $table->decimal('tax_total', 18, 2)->default(0);
            $table->decimal('total', 18, 2)->default(0);
            $table->decimal('amount_paid', 18, 2)->default(0);
            $table->decimal('amount_due', 18, 2)->default(0);
            $table->text('memo')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['supplier_id', 'bill_number']);
            $table->index(['status', 'due_date']);
        });

        Schema::create('ap_bill_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bill_id')->constrained('ap_bills');
            $table->string('description');
            $table->string('expense_account', 40)->nullable();
            $table->decimal('quantity', 14, 4)->default(1);
            $table->decimal('unit_price', 18, 2)->default(0);
            $table->decimal('tax_rate', 8, 4)->default(0);
            $table->decimal('line_total', 18, 2)->default(0);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('ap_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('ap_suppliers');
            $table->date('payment_date');
            $table->string('payment_method', 30);
            $table->string('reference', 80)->nullable();
            $table->decimal('amount', 18, 2);
            $table->string('status', 20)->default('posted');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('ap_payment_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_id')->constrained('ap_payments');
            $table->foreignId('bill_id')->constrained('ap_bills');
            $table->decimal('amount', 18, 2);
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['payment_id', 'bill_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ap_payment_allocations');
        Schema::dropIfExists('ap_payments');
        Schema::dropIfExists('ap_bill_lines');
        Schema::dropIfExists('ap_bills');
        Schema::dropIfExists('ap_suppliers');
    }
};
