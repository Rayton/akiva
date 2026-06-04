<?php

namespace App\Http\Controllers\Api;

use App\Support\AkivaDatabase;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MenuController extends Controller
{
    /**
     * Get all menu items (hierarchical). Uses default DB connection.
     * Returns empty array on failure so the UI can load.
     */
    public function index(Request $request)
    {
        try {
            $menuItems = DB::table('menu')
                ->orderBy('parent', 'asc')
                ->orderBy('id', 'asc')
                ->get()
                ->toArray();
            $menuItems = $this->withLegacyPurchasesMenu($menuItems);
            $menuItems = $this->withPayablesMenu($menuItems);
            $menuItems = $this->withEnterpriseConfigurationMenu($menuItems);
            $menuItems = $this->filterMenuItemsForUser($menuItems, $request);

            $hierarchical = $this->buildTree($menuItems);

            return response()->json([
                'success' => true,
                'data' => $hierarchical,
                'flat' => $menuItems,
            ]);
        } catch (\Exception $e) {
            report($e);
            return response()->json([
                'success' => true,
                'data' => [],
                'flat' => [],
            ]);
        }
    }

    /**
     * Get top-level menu items (parent = -1).
     */
    public function categories(Request $request)
    {
        try {
            $items = DB::table('menu')
                ->orderBy('id', 'asc')
                ->get()
                ->toArray();
            $items = $this->withLegacyPurchasesMenu($items);
            $items = $this->withPayablesMenu($items);
            $items = $this->withEnterpriseConfigurationMenu($items);
            $items = $this->filterMenuItemsForUser($items, $request);
            $categories = collect($items)
                ->where('parent', -1)
                ->values()
                ->all();

            return response()->json([
                'success' => true,
                'data' => $categories,
            ]);
        } catch (\Exception $e) {
            report($e);
            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    /**
     * Get menu items by parent ID.
     */
    public function byParent(Request $request, $parentId)
    {
        try {
            $items = DB::table('menu')
                ->orderBy('id', 'asc')
                ->get()
                ->toArray();
            $items = $this->withLegacyPurchasesMenu($items);
            $items = $this->withPayablesMenu($items);
            $items = $this->withEnterpriseConfigurationMenu($items);
            $items = $this->filterMenuItemsForUser($items, $request);
            $items = collect($items)
                ->where('parent', (int) $parentId)
                ->values()
                ->all();

            return response()->json([
                'success' => true,
                'data' => $items,
            ]);
        } catch (\Exception $e) {
            report($e);
            return response()->json([
                'success' => true,
                'data' => [],
            ]);
        }
    }

    private function buildTree($items)
    {
        $grouped = [];
        foreach ($items as $item) {
            $grouped[$item->parent][] = $item;
        }

        return $this->buildNode($grouped, -1);
    }

    private function filterMenuItemsForUser(array $items, Request $request): array
    {
        $userId = $this->userIdFromRequest($request);
        if ($userId === '' || !Schema::hasTable('usermenurights')) {
            return $items;
        }

        $allowedMenuIds = DB::table('usermenurights')
            ->whereRaw('LOWER(userid) = ?', [strtolower($userId)])
            ->where('access', 1)
            ->pluck('menuid')
            ->map(fn ($menuId) => (int) $menuId)
            ->unique()
            ->values()
            ->all();

        if (count($allowedMenuIds) === 0) {
            return [];
        }

        $parentsById = [];
        foreach ($items as $item) {
            $parentsById[(int) $item->id] = (int) $item->parent;
        }

        $visibleIds = [];
        $allowedIds = array_fill_keys($allowedMenuIds, true);
        foreach ($allowedMenuIds as $menuId) {
            if (!array_key_exists($menuId, $parentsById)) {
                continue;
            }

            $currentId = $menuId;
            while ($currentId !== -1 && array_key_exists($currentId, $parentsById)) {
                $visibleIds[$currentId] = true;
                $currentId = $parentsById[$currentId];
            }
        }

        return array_values(array_map(function ($item) use ($allowedIds) {
            $item->allowed = isset($allowedIds[(int) $item->id]);
            return $item;
        }, array_filter($items, function ($item) use ($visibleIds) {
            return isset($visibleIds[(int) $item->id]);
        })));
    }

    private function userIdFromRequest(Request $request): string
    {
        $headerUserId = trim((string) $request->header('X-User-Id', ''));
        if ($headerUserId !== '') {
            return $headerUserId;
        }

        $token = $this->bearerToken($request);
        if ($token === '' || !Schema::connection(AkivaDatabase::controlConnectionName())->hasTable('akiva_auth_sessions')) {
            return '';
        }

        $userId = AkivaDatabase::controlConnection()
            ->table('akiva_auth_sessions')
            ->where('token_hash', hash('sha256', $token))
            ->where('expires_at', '>', now())
            ->value('user_id');

        return trim((string) $userId);
    }

    private function bearerToken(Request $request): string
    {
        $header = trim((string) $request->header('Authorization', ''));
        if (preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            return trim($matches[1]);
        }

        return trim((string) $request->header('X-Akiva-Auth', ''));
    }

    private function withLegacyPurchasesMenu(array $items): array
    {
        $purchases = $this->findMenuItem($items, -1, 'Purchases');
        if (!$purchases) {
            return $items;
        }

        $nextId = $this->nextSyntheticMenuId($items);
        $transactions = $this->ensureMenuCategory($items, $nextId, (int) $purchases->id, 'Transactions');
        $reports = $this->ensureMenuCategory($items, $nextId, (int) $purchases->id, 'Inquiries and Reports');
        $maintenance = $this->ensureMenuCategory($items, $nextId, (int) $purchases->id, 'Maintenance');

        $this->ensureMenuChildren($items, $nextId, (int) $transactions->id, [
            ['Select Supplier', 'supplier-select'],
            ['Supplier Allocations', 'supplier-allocations'],
        ]);

        $this->ensureMenuChildren($items, $nextId, (int) $reports->id, [
            ['Allocated Inquiry', 'supplier-allocated-inquiry'],
            ['Aged Suppliers', 'aged-suppliers'],
            ['Payment Run', 'payment-run'],
            ['Remittances', 'remittances'],
            ['Outstanding GRNs', 'outstanding-grns'],
            ['Prior Balances', 'prior-supplier-balances'],
            ['Daily Transactions', 'supplier-daily-transactions'],
            ['Supplier Transactions', 'supplier-transactions'],
        ]);

        $this->ensureMenuChildren($items, $nextId, (int) $maintenance->id, [
            ['Add Supplier', 'add-supplier'],
            ['Select Supplier', 'supplier-maintenance'],
            ['Factor Companies', 'factor-companies'],
        ]);

        return $items;
    }

    private function withPayablesMenu(array $items): array
    {
        $nextId = $this->nextSyntheticMenuId($items);
        $existingPayables = $this->findMenuItem($items, -1, 'Payables');
        $payables = $this->ensureMenuCategory($items, $nextId, -1, 'Payables');
        $hadPayablesChildren = $existingPayables ? $this->hasMenuChildren($items, (int) $payables->id) : false;
        $transactions = $this->ensureMenuCategory($items, $nextId, (int) $payables->id, 'Transactions');

        $this->ensureMenuChildren($items, $nextId, (int) $transactions->id, [
            ['Accounts Payable', 'payables'],
        ]);

        if ($hadPayablesChildren) {
            return $items;
        }

        $reports = $this->ensureMenuCategory($items, $nextId, (int) $payables->id, 'Inquiries and Reports');
        $maintenance = $this->ensureMenuCategory($items, $nextId, (int) $payables->id, 'Maintenance');

        $this->ensureMenuChildren($items, $nextId, (int) $transactions->id, [
            ['Select Supplier', 'supplier-select'],
            ['Supplier Allocations', 'supplier-allocations'],
        ]);

        $this->ensureMenuChildren($items, $nextId, (int) $reports->id, [
            ['Allocated Inquiry', 'supplier-allocated-inquiry'],
            ['Aged Suppliers', 'aged-suppliers'],
            ['Payment Run', 'payment-run'],
            ['Remittances', 'remittances'],
            ['Prior Balances', 'prior-supplier-balances'],
            ['Daily Transactions', 'supplier-daily-transactions'],
            ['Supplier Transactions', 'supplier-transactions'],
        ]);

        $this->ensureMenuChildren($items, $nextId, (int) $maintenance->id, [
            ['Add Supplier', 'add-supplier'],
            ['Select Supplier', 'supplier-maintenance'],
            ['Factor Companies', 'factor-companies'],
        ]);

        return $items;
    }

    private function withEnterpriseConfigurationMenu(array $items): array
    {
        $configuration = $this->findMenuItem($items, -1, 'Configuration');
        if (!$configuration) {
            return $items;
        }

        $nextId = $this->nextSyntheticMenuId($items);
        $enterprise = $this->ensureMenuCategory($items, $nextId, (int) $configuration->id, 'Enterprise Controls');

        $this->ensureMenuChildren($items, $nextId, (int) $enterprise->id, [
            ['Enterprise Configuration', 'enterprise-configuration'],
            ['Fiscal Years', 'fiscal-years'],
            ['Fiscal Periods', 'fiscal-periods'],
            ['Financial Dimensions', 'financial-dimensions'],
            ['Dimension Values', 'dimension-values'],
            ['Grants and Donors', 'grants-and-donors'],
            ['Donors', 'donors'],
            ['Grants', 'grants'],
            ['Tax Rate Versions', 'tax-rate-versions'],
            ['Currency Rates', 'currency-rates'],
            ['Allocation Keys', 'allocation-keys'],
            ['Allocation Key Lines', 'allocation-key-lines'],
            ['Report Templates', 'report-templates'],
            ['Audit Policies', 'audit-policies'],
            ['Dashboard Templates', 'dashboard-templates'],
            ['Notification Rules', 'notification-rules'],
        ]);

        return $items;
    }

    private function nextSyntheticMenuId(array $items): int
    {
        $ids = array_map(fn ($item) => (int) $item->id, $items);
        $highest = empty($ids) ? 0 : max($ids);

        return max(900000, $highest + 1);
    }

    private function ensureMenuCategory(array &$items, int &$nextId, int $parentId, string $caption): object
    {
        $existing = $this->findMenuItem($items, $parentId, $caption);
        if ($existing) {
            return $existing;
        }

        $item = (object) [
            'id' => $nextId++,
            'caption' => $caption,
            'parent' => $parentId,
            'href' => '#',
        ];
        $items[] = $item;

        return $item;
    }

    private function ensureMenuChildren(array &$items, int &$nextId, int $parentId, array $children): void
    {
        foreach ($children as [$caption, $href]) {
            if ($this->findMenuItem($items, $parentId, $caption)) {
                continue;
            }

            $items[] = (object) [
                'id' => $nextId++,
                'caption' => $caption,
                'parent' => $parentId,
                'href' => $href,
            ];
        }
    }

    private function findMenuItem(array $items, int $parentId, string $caption): ?object
    {
        $captionKey = $this->menuKey($caption);
        foreach ($items as $item) {
            if ((int) $item->parent === $parentId && $this->menuKey((string) $item->caption) === $captionKey) {
                return $item;
            }
        }

        return null;
    }

    private function hasMenuChildren(array $items, int $parentId): bool
    {
        foreach ($items as $item) {
            if ((int) $item->parent === $parentId) {
                return true;
            }
        }

        return false;
    }

    private function menuKey(string $value): string
    {
        return preg_replace('/[^a-z0-9]/', '', strtolower($value)) ?? '';
    }

    private function buildNode(&$grouped, $parentId)
    {
        $nodes = [];
        if (!isset($grouped[$parentId])) {
            return $nodes;
        }

        foreach ($grouped[$parentId] as $item) {
            $node = (array) $item;
            $node['children'] = $this->buildNode($grouped, $item->id);
            $nodes[] = $node;
        }

        return $nodes;
    }
}
