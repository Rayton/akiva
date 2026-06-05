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
            $customerMenuId = $this->customerMenuId();
            if ($customerMenuId === null) {
                return;
            }

            $menuIds = DB::table('menu')
                ->where('parent', $customerMenuId)
                ->where('href', 'print-statement')
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();

            if (count($menuIds) === 0) {
                return;
            }

            if (Schema::hasTable('usermenurights')) {
                DB::table('usermenurights')->whereIn('menuid', $menuIds)->delete();
            }

            DB::table('menu')->whereIn('id', $menuIds)->delete();
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        DB::transaction(function () {
            $customerMenuId = $this->customerMenuId();
            if ($customerMenuId === null) {
                return;
            }

            $existingId = DB::table('menu')
                ->where('parent', $customerMenuId)
                ->where('href', 'print-statement')
                ->value('id');

            if ($existingId !== null) {
                return;
            }

            DB::table('menu')->insert([
                'id' => ((int) DB::table('menu')->max('id')) + 1,
                'parent' => $customerMenuId,
                'caption' => 'Print Statement',
                'href' => 'print-statement',
            ]);
        });
    }

    private function customerMenuId(): ?int
    {
        $receivablesId = DB::table('menu')
            ->where('parent', -1)
            ->whereRaw('LOWER(caption) = ?', ['receivables'])
            ->orderBy('id')
            ->value('id');

        if ($receivablesId === null) {
            return null;
        }

        $customersId = DB::table('menu')
            ->where('parent', (int) $receivablesId)
            ->where('href', 'customers')
            ->orderBy('id')
            ->value('id');

        return $customersId === null ? null : (int) $customersId;
    }
};
