<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const INVENTORY = 'Inventory';

    private const CONFIGURATION = 'Configuration';

    private const GENERAL_SETTINGS = 'General Settings';

    private const INVENTORY_SETUP = 'Inventory Setup';

    private const MANUFACTURING_SETUP = 'Manufacturing Setup';

    public function up(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        DB::transaction(function () {
            $inventoryMaintenanceId = $this->childId(self::INVENTORY, 'Maintenance');
            if ($inventoryMaintenanceId !== null) {
                DB::table('menu')
                    ->where('parent', $inventoryMaintenanceId)
                    ->where('href', 'SelectProduct.php?')
                    ->update(['caption' => 'Inventory Items']);

                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'Stocks.php?');

                DB::table('menu')
                    ->where('parent', $inventoryMaintenanceId)
                    ->where('href', 'PricesBasedOnMarkUp.php?')
                    ->update(['caption' => 'Cost-Based Prices']);

                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'PricesByCost.php?');

                DB::table('menu')
                    ->where('parent', $inventoryMaintenanceId)
                    ->where('href', 'SalesCategories.php?')
                    ->update(['caption' => 'Sales Categories']);
            }

            $inventorySetupId = $this->childId(self::CONFIGURATION, self::INVENTORY_SETUP);
            if ($inventorySetupId === null) {
                return;
            }

            DB::table('menu')
                ->where('parent', $inventorySetupId)
                ->where('href', 'DiscountCategories.php?')
                ->update(['caption' => 'Discount Categories']);

            $this->moveMenuByHref('MRPCalendar.php?', $inventorySetupId, 'MRP Calendar');
            $this->moveMenuByHref('MRPDemandTypes.php?', $inventorySetupId, 'MRP Demand Types');
            $this->moveMenuByHref('Labels.php?', $inventorySetupId, 'Label Templates');

            $this->insertMenuIfMissing($inventorySetupId, 'Location Users', 'LocationUsers.php?');
            $this->insertMenuIfMissing($inventorySetupId, 'User Locations', 'UserLocations.php?');
            $this->insertMenuIfMissing($inventorySetupId, 'Departments', 'Departments.php?');
            $this->insertMenuIfMissing($inventorySetupId, 'Category Roles', 'InternalStockCategoriesByRole.php?');
            $this->moveMenuToEndByHref('Labels.php?');

            $manufacturingSetupId = $this->childId(self::CONFIGURATION, self::MANUFACTURING_SETUP);
            if ($manufacturingSetupId !== null && !DB::table('menu')->where('parent', $manufacturingSetupId)->exists()) {
                $this->deleteMenuById($manufacturingSetupId);
            }

            if ($inventoryMaintenanceId !== null) {
                $this->insertMenuIfMissing($inventoryMaintenanceId, 'Inventory Categories', 'StockCategories.php?');
                $this->insertMenuIfMissing($inventoryMaintenanceId, 'Inventory Locations', 'Locations.php?');
                $this->insertMenuIfMissing($inventoryMaintenanceId, 'Discount Categories', 'DiscountCategories.php?');
                $this->insertMenuIfMissing($inventoryMaintenanceId, 'Units of Measure', 'UnitsOfMeasure.php?');
                $this->insertMenuIfMissing($inventoryMaintenanceId, 'MRP Calendar', 'MRPCalendar.php?');
                $this->insertMenuIfMissing($inventoryMaintenanceId, 'MRP Demand Types', 'MRPDemandTypes.php?');
                $this->insertMenuIfMissing($inventoryMaintenanceId, 'Location Users', 'LocationUsers.php?');
                $this->insertMenuIfMissing($inventoryMaintenanceId, 'User Locations', 'UserLocations.php?');
                $this->insertMenuIfMissing($inventoryMaintenanceId, 'Departments', 'Departments.php?');
                $this->insertMenuIfMissing($inventoryMaintenanceId, 'Category Roles', 'InternalStockCategoriesByRole.php?');
                $this->insertMenuIfMissing($inventoryMaintenanceId, 'Label Templates', 'Labels.php?');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('menu')) {
            return;
        }

        DB::transaction(function () {
            $inventoryMaintenanceId = $this->childId(self::INVENTORY, 'Maintenance');
            if ($inventoryMaintenanceId !== null) {
                DB::table('menu')
                    ->where('parent', $inventoryMaintenanceId)
                    ->where('href', 'SelectProduct.php?')
                    ->where('caption', 'Inventory Items')
                    ->update(['caption' => 'Select An Item']);

                $this->insertMenuIfMissing($inventoryMaintenanceId, 'Add A New Item', 'Stocks.php?');

                DB::table('menu')
                    ->where('parent', $inventoryMaintenanceId)
                    ->where('href', 'PricesBasedOnMarkUp.php?')
                    ->where('caption', 'Cost-Based Prices')
                    ->update(['caption' => 'Add or Update Prices Based On Costs']);

                $this->insertMenuIfMissing($inventoryMaintenanceId, 'View or Update Prices Based On Costs', 'PricesByCost.php?');

                DB::table('menu')
                    ->where('parent', $inventoryMaintenanceId)
                    ->where('href', 'SalesCategories.php?')
                    ->where('caption', 'Sales Categories')
                    ->update(['caption' => 'Sales Category Maintenance']);

                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'StockCategories.php?');
                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'Locations.php?');
                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'DiscountCategories.php?');
                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'UnitsOfMeasure.php?');
                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'MRPCalendar.php?');
                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'MRPDemandTypes.php?');
                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'LocationUsers.php?');
                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'UserLocations.php?');
                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'Departments.php?');
                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'InternalStockCategoriesByRole.php?');
                $this->deleteMenuByParentAndHref($inventoryMaintenanceId, 'Labels.php?');
            }

            $inventorySetupId = $this->childId(self::CONFIGURATION, self::INVENTORY_SETUP);
            if ($inventorySetupId === null) {
                return;
            }

            DB::table('menu')
                ->where('parent', $inventorySetupId)
                ->where('href', 'DiscountCategories.php?')
                ->where('caption', 'Discount Categories')
                ->update(['caption' => 'Discount Category']);

            $this->deleteMenuByParentAndHref($inventorySetupId, 'LocationUsers.php?');
            $this->deleteMenuByParentAndHref($inventorySetupId, 'UserLocations.php?');
            $this->deleteMenuByParentAndHref($inventorySetupId, 'Departments.php?');
            $this->deleteMenuByParentAndHref($inventorySetupId, 'InternalStockCategoriesByRole.php?');

            $configurationId = DB::table('menu')->where('parent', -1)->where('caption', self::CONFIGURATION)->value('id');
            if ($configurationId === null) {
                return;
            }

            $manufacturingSetupId = $this->childId(self::CONFIGURATION, self::MANUFACTURING_SETUP);
            if ($manufacturingSetupId === null) {
                $manufacturingSetupId = $this->insertMenuIfMissing((int) $configurationId, self::MANUFACTURING_SETUP, '#');
            }

            $generalSettingsId = $this->childId(self::CONFIGURATION, self::GENERAL_SETTINGS);

            $this->moveMenuByHref('MRPCalendar.php?', (int) $manufacturingSetupId, 'MRP Available Production Days');
            $this->moveMenuByHref('MRPDemandTypes.php?', (int) $manufacturingSetupId, 'MRP Demand Types');

            if ($generalSettingsId !== null) {
                $this->moveMenuByHref('Labels.php?', (int) $generalSettingsId, 'Label Templates Maintenance');
            }
        });
    }

    private function childId(string $parentCaption, string $childCaption): mixed
    {
        return DB::table('menu as child')
            ->join('menu as parent', 'child.parent', '=', 'parent.id')
            ->where('parent.caption', $parentCaption)
            ->where('child.caption', $childCaption)
            ->value('child.id');
    }

    private function nextMenuId(): int
    {
        return ((int) DB::table('menu')->max('id')) + 1;
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
            DB::table('menu')->where('id', $existingId)->update(['caption' => $caption]);
            return (int) $existingId;
        }

        $id = $this->nextMenuId();
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
            ->value('id');

        if ($menuId === null) {
            $menuId = DB::table('menu')
                ->where('href', $href)
                ->orderBy('id')
                ->value('id');
        }

        if ($menuId === null) {
            return;
        }

        DB::table('menu')
            ->where('id', $menuId)
            ->update([
                'parent' => $parentId,
                'caption' => $caption,
            ]);
    }

    private function moveMenuToEndByHref(string $href): void
    {
        $currentId = DB::table('menu')->where('href', $href)->value('id');
        if ($currentId === null) {
            return;
        }

        $nextId = $this->nextMenuId();
        if ((int) $currentId >= $nextId - 1) {
            return;
        }

        if (Schema::hasTable('usermenurights')) {
            DB::table('usermenurights')->where('menuid', $currentId)->update(['menuid' => $nextId]);
        }

        DB::table('menu')->where('id', $currentId)->update(['id' => $nextId]);
    }

    private function deleteMenuByParentAndHref(int $parentId, string $href): void
    {
        $ids = DB::table('menu')
            ->where('parent', $parentId)
            ->where('href', $href)
            ->pluck('id')
            ->all();

        foreach ($ids as $id) {
            $this->deleteMenuById((int) $id);
        }
    }

    private function deleteMenuById(int $id): void
    {
        if (Schema::hasTable('usermenurights')) {
            DB::table('usermenurights')->where('menuid', $id)->delete();
        }

        DB::table('menu')->where('id', $id)->delete();
    }
};
