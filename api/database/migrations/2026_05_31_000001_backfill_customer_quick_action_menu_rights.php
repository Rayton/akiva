<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('menu') || !Schema::hasTable('usermenurights')) {
            return;
        }

        DB::transaction(function () {
            $receivablesId = DB::table('menu')
                ->where('parent', -1)
                ->whereRaw('LOWER(caption) = ?', ['receivables'])
                ->orderBy('id')
                ->value('id');

            if ($receivablesId === null) {
                return;
            }

            $customerRootId = DB::table('menu')
                ->where('parent', (int) $receivablesId)
                ->where('href', 'customers')
                ->orderBy('id')
                ->value('id');

            if ($customerRootId === null) {
                return;
            }

            $customerMenuIds = DB::table('menu')
                ->where('id', (int) $customerRootId)
                ->orWhere('parent', (int) $customerRootId)
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values()
                ->all();

            if (count($customerMenuIds) === 0) {
                return;
            }

            $legacyCustomerIds = DB::table('menu')
                ->where('href', 'SelectCustomer.php?')
                ->whereRaw('LOWER(caption) = ?', ['customers'])
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $anchorMenuIds = array_values(array_unique(array_filter([
                (int) $receivablesId,
                (int) $customerRootId,
                ...$legacyCustomerIds,
            ])));

            $userIds = DB::table('usermenurights')
                ->where('access', 1)
                ->whereIn('menuid', $anchorMenuIds)
                ->pluck('userid')
                ->map(fn ($userId) => (string) $userId)
                ->unique()
                ->values()
                ->all();

            if (count($userIds) === 0) {
                return;
            }

            $existing = DB::table('usermenurights')
                ->whereIn('userid', $userIds)
                ->whereIn('menuid', $customerMenuIds)
                ->get(['userid', 'menuid'])
                ->mapWithKeys(fn ($right) => [(string) $right->userid . ':' . (int) $right->menuid => true]);

            $rows = [];
            foreach ($userIds as $userId) {
                foreach ($customerMenuIds as $menuId) {
                    $key = $userId . ':' . $menuId;
                    if ($existing->has($key)) {
                        continue;
                    }

                    $rows[] = [
                        'userid' => $userId,
                        'menuid' => $menuId,
                        'access' => 1,
                    ];
                }
            }

            if (count($rows) > 0) {
                DB::table('usermenurights')->insert($rows);
            }
        });
    }

    public function down(): void
    {
        // Keep permission changes on rollback; administrators may have edited them after this backfill.
    }
};
