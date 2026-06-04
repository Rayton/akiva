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
            $receivablesId = $this->findRootMenuId('Receivables');
            if ($receivablesId === null) {
                return;
            }

            $customersId = $this->insertMenuIfMissing((int) $receivablesId, 'Customers', 'customers');

            foreach ($this->customerQuickActions() as [$caption, $href]) {
                $this->insertMenuIfMissing($customersId, $caption, $href);
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        DB::transaction(function () {
            $receivablesId = $this->findRootMenuId('Receivables');
            if ($receivablesId === null) {
                return;
            }

            $customersId = DB::table('menu')
                ->where('parent', (int) $receivablesId)
                ->where('href', 'customers')
                ->value('id');

            if ($customersId === null) {
                return;
            }

            DB::table('menu')
                ->where('parent', (int) $customersId)
                ->whereIn('href', array_map(fn ($action) => $action[1], $this->customerQuickActions()))
                ->delete();

            if (!DB::table('menu')->where('parent', (int) $customersId)->exists()) {
                DB::table('menu')->where('id', (int) $customersId)->delete();
            }
        });
    }

    private function customerQuickActions(): array
    {
        return [
            ['Transactions', 'transaction-inquiries'],
            ['Statement', 'account-statement'],
            ['Customer Profile', 'customer-details'],
            ['Print Statement', 'print-statement'],
            ['Send Statement', 'email-statement'],
            ['Orders', 'order-inquiries'],
            ['Sales History', 'customer-purchases'],
            ['Open Orders', 'outstanding-sales-orders'],
            ['Allocate Payments', 'allocate-receipts'],
            ['Counter Sale', 'counter-sale'],
            ['New Customer', 'add-customer'],
            ['Edit Customer', 'modify-customer'],
            ['Branches', 'customer-branches'],
            ['Special Prices', 'special-prices'],
            ['EDI Settings', 'edi-configuration'],
            ['Portal Access', 'login-configuration'],
            ['New Contact', 'add-contact'],
            ['New Note', 'add-note'],
        ];
    }

    private function findRootMenuId(string $caption): ?int
    {
        $id = DB::table('menu')
            ->where('parent', -1)
            ->whereRaw('LOWER(caption) = ?', [strtolower($caption)])
            ->orderBy('id')
            ->value('id');

        return $id === null ? null : (int) $id;
    }

    private function insertMenuIfMissing(int $parentId, string $caption, string $href): int
    {
        $existingId = DB::table('menu')
            ->where('parent', $parentId)
            ->where('href', $href)
            ->orderBy('id')
            ->value('id');

        if ($existingId !== null) {
            DB::table('menu')->where('id', (int) $existingId)->update([
                'caption' => $caption,
                'parent' => $parentId,
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
};
