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
                ->where('parent', $parentId)
                ->orderBy('id', 'asc')
                ->get()
                ->toArray();

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
