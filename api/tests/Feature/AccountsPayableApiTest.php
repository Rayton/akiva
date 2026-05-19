<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('requires bill approval before payment and supports approval workflow', function () {
    $supplier = $this->postJson('/api/payables/suppliers', [
        'supplier_code' => 'SUP-001',
        'name' => 'Modern Medical Supplies',
    ])->assertCreated()->json('data');

    DB::table('ap_approval_policies')->insertGetId([
        'name' => 'Default AP Approval',
        'scope' => 'global',
        'currency_code' => 'USD',
        'min_amount' => 0,
        'max_amount' => null,
        'priority' => 1,
        'active' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    $policyId = (int) DB::table('ap_approval_policies')->value('id');
    DB::table('ap_approval_steps')->insert([
        'policy_id' => $policyId,
        'step_order' => 1,
        'role_code' => 'ap_manager',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $bill = $this->postJson('/api/payables/bills', [
        'supplier_id' => $supplier['id'],
        'bill_number' => 'B-1001',
        'bill_date' => '2026-05-01',
        'due_date' => '2026-05-20',
        'lines' => [['description' => 'Surgical gloves', 'quantity' => 10, 'unit_price' => 20, 'tax_rate' => 18]],
    ])->assertCreated()->json('data');

    $this->postJson('/api/payables/payments', [
        'supplier_id' => $supplier['id'],
        'payment_date' => '2026-05-18',
        'payment_method' => 'bank_transfer',
        'amount' => 236,
        'allocations' => [['bill_id' => $bill['id'], 'amount' => 236]],
    ])->assertStatus(422);

    $instance = $this->postJson('/api/payables/bills/'.$bill['id'].'/submit-approval')
        ->assertOk()->json('data.approval_instance_id');

    $this->postJson('/api/payables/approvals/'.$instance.'/actions', [
        'action' => 'approve',
        'actor_user_id' => 'admin',
    ])->assertOk()->assertJsonPath('data.status', 'approved');

    $this->postJson('/api/payables/payments', [
        'supplier_id' => $supplier['id'],
        'payment_date' => '2026-05-18',
        'payment_method' => 'bank_transfer',
        'amount' => 236,
        'allocations' => [['bill_id' => $bill['id'], 'amount' => 236]],
    ])->assertCreated();
});

it('blocks payment for bills flagged as duplicate', function () {
    $supplier = $this->postJson('/api/payables/suppliers', [
        'supplier_code' => 'SUP-002',
        'name' => 'Prime Care Supplier',
    ])->assertCreated()->json('data');

    DB::table('ap_approval_policies')->insert([
        'name' => 'Default AP Approval',
        'scope' => 'global',
        'currency_code' => 'USD',
        'min_amount' => 0,
        'priority' => 1,
        'active' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    $policyId = (int) DB::table('ap_approval_policies')->value('id');
    DB::table('ap_approval_steps')->insert([
        'policy_id' => $policyId,
        'step_order' => 1,
        'role_code' => 'ap_manager',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $first = $this->postJson('/api/payables/bills', [
        'supplier_id' => $supplier['id'], 'bill_number' => 'DUP-100', 'bill_date' => '2026-05-01', 'due_date' => '2026-05-30',
        'lines' => [['description' => 'Masks', 'quantity' => 1, 'unit_price' => 100, 'tax_rate' => 0]],
    ])->assertCreated()->json('data');

    $second = $this->postJson('/api/payables/bills', [
        'supplier_id' => $supplier['id'], 'bill_number' => 'DUP-101', 'bill_date' => '2026-05-03', 'due_date' => '2026-05-30',
        'lines' => [['description' => 'Masks', 'quantity' => 1, 'unit_price' => 100, 'tax_rate' => 0]],
    ])->assertCreated()->json('data');

    DB::table('ap_duplicate_checks')->insert([
        'bill_id' => $second['id'],
        'possible_duplicate_bill_id' => $first['id'],
        'rule_code' => 'manual_test_duplicate',
        'confidence_score' => 95,
        'result' => 'duplicate',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $instance = $this->postJson('/api/payables/bills/'.$second['id'].'/submit-approval')->assertOk()->json('data.approval_instance_id');
    $this->postJson('/api/payables/approvals/'.$instance.'/actions', ['action' => 'approve'])->assertOk();

    $this->postJson('/api/payables/payments', [
        'supplier_id' => $supplier['id'],
        'payment_date' => '2026-05-18',
        'payment_method' => 'bank_transfer',
        'amount' => 100,
        'allocations' => [['bill_id' => $second['id'], 'amount' => 100]],
    ])->assertStatus(422);
});

it('supports matching, aging, recurring templates, and credit notes', function () {
    $supplier = $this->postJson('/api/payables/suppliers', [
        'supplier_code' => 'SUP-900',
        'name' => 'Unified Supplies',
    ])->assertCreated()->json('data');

    $bill = $this->postJson('/api/payables/bills', [
        'supplier_id' => $supplier['id'],
        'bill_number' => 'M-1001',
        'bill_date' => '2026-04-01',
        'due_date' => '2026-04-15',
        'lines' => [['description' => 'Item', 'quantity' => 2, 'unit_price' => 50, 'tax_rate' => 0]],
    ])->assertCreated()->json('data');

    $this->postJson('/api/payables/bills/'.$bill['id'].'/match', [
        'match_type' => 'two_way',
        'purchase_order_no' => 12345,
        'status' => 'matched',
        'variance_qty' => 0,
        'variance_amount' => 0,
    ])->assertCreated();

    $this->getJson('/api/payables/reports/aging')->assertOk()->assertJsonStructure([
        'success', 'data' => ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_91_plus'],
    ]);

    $this->postJson('/api/payables/recurring/templates', [
        'supplier_id' => $supplier['id'],
        'template_name' => 'Monthly Rent',
        'frequency' => 'monthly',
        'start_date' => '2026-05-01',
        'next_run_date' => '2026-06-01',
        'default_amount' => 1000,
    ])->assertCreated();

    $this->postJson('/api/payables/credit-notes', [
        'supplier_id' => $supplier['id'],
        'credit_number' => 'CR-100',
        'credit_date' => '2026-05-10',
        'amount_total' => 150,
    ])->assertCreated();
});

it('supports duplicate resolution, recurring generation, credit allocation, and statement reconciliation', function () {
    $supplier = $this->postJson('/api/payables/suppliers', [
        'supplier_code' => 'SUP-777',
        'name' => 'Enterprise Vendor',
    ])->assertCreated()->json('data');

    $bill = $this->postJson('/api/payables/bills', [
        'supplier_id' => $supplier['id'],
        'bill_number' => 'ENT-1001',
        'bill_date' => '2026-05-01',
        'due_date' => '2026-05-20',
        'lines' => [['description' => 'Service', 'quantity' => 1, 'unit_price' => 500, 'tax_rate' => 0]],
    ])->assertCreated()->json('data');

    $dupId = DB::table('ap_duplicate_checks')->insertGetId([
        'bill_id' => $bill['id'],
        'rule_code' => 'manual',
        'confidence_score' => 92,
        'result' => 'suspected',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $this->postJson('/api/payables/duplicate-checks/'.$dupId.'/resolve', [
        'result' => 'valid',
        'resolution_note' => 'Verified against supplier statement',
    ])->assertOk();

    $this->postJson('/api/payables/recurring/templates', [
        'supplier_id' => $supplier['id'],
        'template_name' => 'Hosting Subscription',
        'frequency' => 'monthly',
        'start_date' => '2026-05-01',
        'next_run_date' => '2026-05-01',
        'default_amount' => 120,
        'requires_approval' => false,
    ])->assertCreated();

    $this->postJson('/api/payables/recurring/run', ['run_date' => '2026-05-01'])
        ->assertOk()
        ->assertJsonStructure(['success', 'data' => ['generated_bill_ids']]);

    $creditId = $this->postJson('/api/payables/credit-notes', [
        'supplier_id' => $supplier['id'],
        'credit_number' => 'CR-ENT-1',
        'credit_date' => '2026-05-10',
        'amount_total' => 100,
    ])->assertCreated()->json('data.credit_note_id');

    $this->postJson('/api/payables/credit-notes/'.$creditId.'/allocate', [
        'bill_id' => $bill['id'],
        'amount' => 80,
    ])->assertOk();

    $statementId = $this->postJson('/api/payables/statements', [
        'supplier_id' => $supplier['id'],
        'statement_date' => '2026-05-31',
        'closing_balance' => 420,
    ])->assertCreated()->json('data.statement_id');

    $this->postJson('/api/payables/statements/'.$statementId.'/reconcile', [
        'lines' => [
            ['bill_id' => $bill['id'], 'statement_amount' => 420, 'system_amount' => 420],
        ],
    ])->assertOk();
});


it('applies tolerance policy to matching and opens exception when exceeded', function () {
    $supplier = $this->postJson('/api/payables/suppliers', [
        'supplier_code' => 'SUP-TOL',
        'name' => 'Tolerance Vendor',
    ])->assertCreated()->json('data');

    $bill = $this->postJson('/api/payables/bills', [
        'supplier_id' => $supplier['id'],
        'bill_number' => 'TOL-1001',
        'bill_date' => '2026-05-01',
        'due_date' => '2026-05-30',
        'lines' => [['description' => 'Item', 'quantity' => 1, 'unit_price' => 100, 'tax_rate' => 0]],
    ])->assertCreated()->json('data');

    DB::table('ap_tolerance_policies')->insert([
        'name' => 'Default Tolerance',
        'qty_tolerance_percent' => 2,
        'price_tolerance_percent' => 1,
        'tax_tolerance_percent' => 0,
        'active' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $response = $this->postJson('/api/payables/bills/'.$bill['id'].'/match', [
        'match_type' => 'three_way',
        'purchase_order_no' => 123,
        'grn_batch_id' => 456,
        'variance_qty' => 5,
        'variance_amount' => 50,
    ])->assertCreated();

    $response->assertJsonPath('data.status', 'exception');

    expect(DB::table('ap_exceptions')->where('bill_id', $bill['id'])->where('type', 'matching_exception')->exists())->toBeTrue();
});

it('enforces approval delegation and limits', function () {
    $supplier = $this->postJson('/api/payables/suppliers', ['supplier_code' => 'SUP-LIM', 'name' => 'Limit Vendor'])->assertCreated()->json('data');

    DB::table('ap_approval_policies')->insert([
        'name' => 'Limit Policy', 'scope' => 'global', 'currency_code' => 'USD', 'min_amount' => 0, 'priority' => 1, 'active' => 1,
        'escalation_hours' => 1, 'created_at' => now(), 'updated_at' => now(),
    ]);
    $policyId = (int) DB::table('ap_approval_policies')->value('id');
    DB::table('ap_approval_steps')->insert([
        'policy_id' => $policyId, 'step_order' => 1, 'role_code' => 'ap_manager', 'created_at' => now(), 'updated_at' => now(),
    ]);

    DB::table('ap_approver_delegations')->insert([
        'approver_user_id' => 'ap_manager', 'delegate_user_id' => 'delegate_user', 'effective_from' => now()->toDateString(),
        'effective_to' => now()->addDays(2)->toDateString(), 'active' => 1, 'created_at' => now(), 'updated_at' => now(),
    ]);

    DB::table('ap_approval_limits')->insert([
        'user_id' => 'delegate_user', 'currency_code' => 'USD', 'amount_limit' => 100, 'created_at' => now(), 'updated_at' => now(),
    ]);

    $bill = $this->postJson('/api/payables/bills', [
        'supplier_id' => $supplier['id'], 'bill_number' => 'LIM-1', 'bill_date' => '2026-05-01', 'due_date' => '2026-05-30',
        'lines' => [['description' => 'Big invoice', 'quantity' => 1, 'unit_price' => 300, 'tax_rate' => 0]],
    ])->assertCreated()->json('data');

    $instance = $this->postJson('/api/payables/bills/'.$bill['id'].'/submit-approval')->assertOk()->json('data.approval_instance_id');

    $this->postJson('/api/payables/approvals/'.$instance.'/actions', ['action' => 'approve', 'actor_user_id' => 'delegate_user'])->assertStatus(403);

    DB::table('ap_approval_limits')->where('user_id', 'delegate_user')->update(['amount_limit' => 500]);
    $this->postJson('/api/payables/approvals/'.$instance.'/actions', ['action' => 'approve', 'actor_user_id' => 'delegate_user'])->assertOk();
});

it('supports payment batch orchestration lifecycle', function () {
    $supplier = $this->postJson('/api/payables/suppliers', ['supplier_code' => 'SUP-BAT', 'name' => 'Batch Vendor'])->assertCreated()->json('data');

    $bill = $this->postJson('/api/payables/bills', [
        'supplier_id' => $supplier['id'], 'bill_number' => 'BAT-1', 'bill_date' => '2026-05-01', 'due_date' => '2026-05-30',
        'lines' => [['description' => 'Batch Item', 'quantity' => 1, 'unit_price' => 150, 'tax_rate' => 0]],
    ])->assertCreated()->json('data');

    DB::table('ap_bills')->where('id', $bill['id'])->update(['status' => 'approved']);

    $batchId = $this->postJson('/api/payables/payment-batches', ['bill_ids' => [$bill['id']]])->assertCreated()->json('data.batch_id');
    $this->postJson('/api/payables/payment-batches/'.$batchId.'/approve', ['actor_user_id' => 'finance_controller'])->assertOk();
    $this->postJson('/api/payables/payment-batches/'.$batchId.'/execute')->assertOk()->assertJsonPath('data.executed', 1);
});

it('handles matching lifecycle blocked and override for payment', function () {
    $supplier = $this->postJson('/api/payables/suppliers', ['supplier_code' => 'SUP-MAT2', 'name' => 'Match Vendor'])->assertCreated()->json('data');
    DB::table('ap_approval_policies')->insert(['name'=>'P','scope'=>'global','currency_code'=>'USD','min_amount'=>0,'priority'=>1,'active'=>1,'escalation_hours'=>1,'created_at'=>now(),'updated_at'=>now()]);
    $pid=(int)DB::table('ap_approval_policies')->value('id');
    DB::table('ap_approval_steps')->insert(['policy_id'=>$pid,'step_order'=>1,'role_code'=>'ap_manager','created_at'=>now(),'updated_at'=>now()]);
    DB::table('ap_approval_limits')->insert(['user_id'=>'ap_manager','currency_code'=>'USD','amount_limit'=>10000,'created_at'=>now(),'updated_at'=>now()]);

    $bill = $this->postJson('/api/payables/bills', ['supplier_id'=>$supplier['id'],'bill_number'=>'M2','bill_date'=>'2026-05-01','due_date'=>'2026-05-30','lines'=>[['description'=>'x','quantity'=>1,'unit_price'=>100,'tax_rate'=>0]]])->assertCreated()->json('data');
    $this->postJson('/api/payables/bills/'.$bill['id'].'/matching/evaluate', ['match_mode'=>'three_way','supplier_id'=>$supplier['id'],'variance_qty'=>2,'overbilling'=>true])->assertCreated()->assertJsonPath('data.blocked', true);

    $instance=$this->postJson('/api/payables/bills/'.$bill['id'].'/submit-approval')->assertOk()->json('data.approval_instance_id');
    $this->postJson('/api/payables/approvals/'.$instance.'/actions', ['action'=>'approve','actor_user_id'=>'ap_manager'])->assertOk();

    $this->postJson('/api/payables/payments', ['supplier_id'=>$supplier['id'],'payment_date'=>'2026-05-18','payment_method'=>'bank_transfer','amount'=>100,'allocations'=>[['bill_id'=>$bill['id'],'amount'=>100]]])->assertStatus(422);

    $this->postJson('/api/payables/bills/'.$bill['id'].'/matching/override-approve', ['actor_user_id'=>'finance_controller'])->assertOk();
    $this->postJson('/api/payables/payments', ['supplier_id'=>$supplier['id'],'payment_date'=>'2026-05-18','payment_method'=>'bank_transfer','amount'=>100,'allocations'=>[['bill_id'=>$bill['id'],'amount'=>100]]])->assertCreated();
});

it('supports exception queue actions with audits', function () {
    $id = DB::table('ap_exceptions')->insertGetId(['type'=>'duplicate_invoice','status'=>'open','severity'=>'high','message'=>'test','created_at'=>now(),'updated_at'=>now()]);
    $this->postJson('/api/payables/exceptions/'.$id.'/assign', ['assigned_to_user_id'=>'ap_reviewer','actor_user_id'=>'manager'])->assertOk();
    $this->postJson('/api/payables/exceptions/'.$id.'/comment', ['actor_user_id'=>'ap_reviewer','comment'=>'investigating'])->assertOk();
    $this->postJson('/api/payables/exceptions/'.$id.'/escalate', ['actor_user_id'=>'ap_reviewer'])->assertOk();
    $this->postJson('/api/payables/exceptions/'.$id.'/resolve', ['resolution_code'=>'false_positive','actor_user_id'=>'manager'])->assertOk();
    $this->postJson('/api/payables/exceptions/'.$id.'/reopen', ['actor_user_id'=>'auditor'])->assertOk();
    expect(DB::table('ap_exception_audits')->where('exception_id',$id)->count())->toBe(5);
});

it('supports credit allocation reversal and dispute lifecycle', function () {
    $supplier=$this->postJson('/api/payables/suppliers',['supplier_code'=>'SUP-CR2','name'=>'Credit Vendor'])->assertCreated()->json('data');
    $bill=$this->postJson('/api/payables/bills',['supplier_id'=>$supplier['id'],'bill_number'=>'CRB','bill_date'=>'2026-05-01','due_date'=>'2026-05-30','lines'=>[['description'=>'x','quantity'=>1,'unit_price'=>120,'tax_rate'=>0]]])->assertCreated()->json('data');
    $creditId=$this->postJson('/api/payables/credit-notes',['supplier_id'=>$supplier['id'],'credit_number'=>'CRX','credit_date'=>'2026-05-10','amount_total'=>100])->assertCreated()->json('data.credit_note_id');
    $this->postJson('/api/payables/credit-notes/'.$creditId.'/allocate',['bill_id'=>$bill['id'],'amount'=>60])->assertOk();
    $allocId=(int)DB::table('ap_credit_allocations')->where('credit_note_id',$creditId)->value('id');
    $this->postJson('/api/payables/credit-allocations/'.$allocId.'/reverse',['actor_user_id'=>'ap_manager'])->assertOk();
    $this->postJson('/api/payables/credit-notes/'.$creditId.'/disputes/open',['owner_user_id'=>'ap_manager','evidence_meta'=>['doc'=>'s3://x']])->assertOk();
    $this->postJson('/api/payables/credit-notes/'.$creditId.'/disputes/resolve')->assertOk();
    expect(DB::table('ap_credit_notes')->where('id',$creditId)->value('dispute_status'))->toBe('resolved');
});

it('builds forecasting, overdue trend, and aging snapshots', function () {
    $supplier = $this->postJson('/api/payables/suppliers', ['supplier_code' => 'SUP-FOR', 'name' => 'Forecast Vendor'])->assertCreated()->json('data');

    $this->postJson('/api/payables/bills', [
        'supplier_id' => $supplier['id'],
        'bill_number' => 'FOR-1',
        'bill_date' => '2026-04-01',
        'due_date' => '2026-04-15',
        'lines' => [['description' => 'Forecasted', 'quantity' => 1, 'unit_price' => 250, 'tax_rate' => 0]],
    ])->assertCreated();

    DB::table('ap_bills')->where('bill_number', 'FOR-1')->update(['status' => 'approved']);

    $this->getJson('/api/payables/reports/forecasting?days=60')->assertOk()->assertJsonStructure([
        'success', 'data' => ['horizon_days', 'projected_outflow', 'suppliers'],
    ]);

    $this->getJson('/api/payables/reports/overdue-trend?months=3')->assertOk()->assertJsonStructure([
        'success', 'data',
    ]);

    $this->postJson('/api/payables/reports/snapshots/generate', ['snapshot_date' => '2026-05-18'])
        ->assertOk()
        ->assertJsonPath('success', true);

    expect(DB::table('ap_aging_snapshots')->count())->toBeGreaterThan(0);
});
