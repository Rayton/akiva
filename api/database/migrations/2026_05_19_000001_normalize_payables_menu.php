<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        DB::transaction(function () {
            $payablesId = $this->insertMenuIfMissing(-1, 'Payables', '#');
            $transactionsId = $this->insertMenuIfMissing($payablesId, 'Transactions', '#');
            $reportsId = $this->insertMenuIfMissing($payablesId, 'Inquiries and Reports', '#');
            $maintenanceId = $this->insertMenuIfMissing($payablesId, 'Maintenance', '#');

            $this->insertMenuIfMissing($transactionsId, 'Accounts Payable', 'payables');
            $this->moveMenuByHref('SelectSupplier.php?', $transactionsId, 'Select Supplier');
            $this->moveMenuByHref('SupplierAllocations.php?', $transactionsId, 'Supplier Allocations');

            $this->moveMenuByHref('AgedSuppliers.php?', $reportsId, 'Aged Suppliers');
            $this->moveMenuByHref('SuppPaymentRun.php?', $reportsId, 'Payment Run Report');
            $this->moveMenuByHref('PDFRemittanceAdvice.php?', $reportsId, 'Remittance Advices');
            $this->moveMenuByHref('OutstandingGRNs.php?', $reportsId, 'Outstanding GRNs');
            $this->moveMenuByHref('SupplierBalsAtPeriodEnd.php?', $reportsId, 'Prior Balances');
            $this->moveMenuByHref('PDFSuppTransListing.php?', $reportsId, 'Daily Transactions');
            $this->moveMenuByHref('SupplierTransInquiry.php?', $reportsId, 'Supplier Transactions');

            $this->moveMenuByHref('Suppliers.php?', $maintenanceId, 'Add Supplier');
            $this->moveMenuByHref('Factors.php?', $maintenanceId, 'Factor Companies');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        DB::table('menu')->where('href', 'payables')->delete();
    }

    private function insertMenuIfMissing(int $parentId, string $caption, string $href): int
    {
        $query = DB::table('menu')->where('parent', $parentId);
        if ($href === '#') {
            $query->where('caption', $caption);
        } else {
            $query->where('href', $href);
        }

        $existingId = $query->value('id');
        if ($existingId !== null) {
            DB::table('menu')->where('id', $existingId)->update([
                'parent' => $parentId,
                'caption' => $caption,
                'href' => $href,
            ]);

            return (int) $existingId;
        }

        $id = ((int) DB::table('menu')->max('id')) + 1;
        DB::table('menu')->insert([
            'id' => $id,
            'parent' => $parentId,
            'caption' => $caption,
            'href' => $href,
        ]);

        return $id;
    }

    private function moveMenuByHref(string $href, int $parentId, string $caption): void
    {
        $menuId = DB::table('menu')
            ->where('href', $href)
            ->where('parent', $parentId)
            ->orderBy('id')
            ->value('id');

        if ($menuId === null) {
            $this->insertMenuIfMissing($parentId, $caption, $href);
            return;
        }

        DB::table('menu')
            ->where('id', $menuId)
            ->update([
                'parent' => $parentId,
                'caption' => $caption,
            ]);
    }
};
