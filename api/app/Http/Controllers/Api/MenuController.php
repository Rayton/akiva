<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;

class MenuController extends Controller
{
    /**
     * Get all menu items (hierarchical). Uses default DB connection.
     * Returns empty array on failure so the UI can load.
     */
    public function index()
    {
        try {
            $menuItems = DB::table('menu')
                ->orderBy('parent', 'asc')
                ->orderBy('id', 'asc')
                ->get()
                ->toArray();
            $menuItems = $this->withLegacyPurchasesMenu($menuItems);

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
    public function categories()
    {
        try {
            $categories = DB::table('menu')
                ->where('parent', -1)
                ->orderBy('id', 'asc')
                ->get()
                ->toArray();

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
    public function byParent($parentId)
    {
        try {
            $items = DB::table('menu')
                ->orderBy('id', 'asc')
                ->get()
                ->toArray();
            $items = collect($this->withLegacyPurchasesMenu($items))
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

    private function withLegacyPurchasesMenu(array $items): array
    {
        $purchases = $this->findMenuItem($items, -1, 'Purchases');
        if (!$purchases) {
            return $items;
        }

        $nextId = max(900000, ((int) max(array_map(fn ($item) => (int) $item->id, $items))) + 1);
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
