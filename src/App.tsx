import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import { Header } from './components/layout/Header';
import { OfflineStatusBar } from './components/layout/OfflineStatusBar';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { ChartOfAccounts } from './pages/ChartOfAccounts';
import { GeneralLedger } from './pages/GeneralLedger';
import { AccountsReceivable } from './pages/AccountsReceivable';
import { AccountsPayable } from './pages/AccountsPayable';
import { Inventory } from './pages/Inventory';
import { InventoryItems } from './pages/InventoryItems';
import { MarkupPrices } from './pages/MarkupPrices';
import { SalesCategories } from './pages/SalesCategories';
import { SalesOrders } from './pages/SalesOrders';
import { PurchaseOrders } from './pages/PurchaseOrders';
import { InventoryTransfer } from './pages/InventoryTransfer';
import { InventoryTransferReceive } from './pages/InventoryTransferReceive';
import { StockAdjustments } from './pages/StockAdjustments';
import { StockCheck } from './pages/StockCheck';
import { StockCheckComparison } from './pages/StockCheckComparison';
import { StockCounts } from './pages/StockCounts';
import { StockIssues } from './pages/StockIssues';
import { StockSerialItemResearch } from './pages/StockSerialItemResearch';
import { PrintPriceLabels } from './pages/PrintPriceLabels';
import { StockMovements } from './pages/StockMovements';
import { StockLocationMovements } from './pages/StockLocationMovements';
import { StockStatus } from './pages/StockStatus';
import { StockLocationStatus } from './pages/StockLocationStatus';
import { StockUsage } from './pages/StockUsage';
import { AllInventoryUsage } from './pages/AllInventoryUsage';
import { InventoryQuantities } from './pages/InventoryQuantities';
import { StockQuantitiesCsv } from './pages/StockQuantitiesCsv';
import { StockQuantityByDate } from './pages/StockQuantityByDate';
import { StockNegatives } from './pages/StockNegatives';
import { StockTransactionListing } from './pages/StockTransactionListing';
import { InventoryPlanning } from './pages/InventoryPlanning';
import { InventoryValuation } from './pages/InventoryValuation';
import { ReorderLevel } from './pages/ReorderLevel';
import { ReorderLevelLocation } from './pages/ReorderLevelLocation';
import { StockDispatch } from './pages/StockDispatch';
import { ReverseGoodsReceived } from './pages/ReverseGoodsReceived';
import { FinancialReports } from './pages/FinancialReports';
import { UserManagement } from './pages/UserManagement';
import { AccessPermissions } from './pages/AccessPermissions';
import { MenuAccess } from './pages/MenuAccess';
import { GeneralLedgerSetup } from './pages/GeneralLedgerSetup';
import { SalesReceivablesSetup } from './pages/SalesReceivablesSetup';
import { PurchasesPayablesSetup } from './pages/PurchasesPayablesSetup';
import { InventorySetup } from './pages/InventorySetup';
import { ManufacturingSetup } from './pages/ManufacturingSetup';
import { ConfigurationDashboard } from './pages/ConfigurationDashboard';
import { CompanyPreferences } from './pages/CompanyPreferences';
import { SystemParameters } from './pages/SystemParameters';
import { AuditTrail } from './pages/AuditTrail';
import { SystemCheck } from './pages/SystemCheck';
import { GeocodeSetup } from './pages/GeocodeSetup';
import { FormDesigner } from './pages/FormDesigner';
import { Labels } from './pages/Labels';
import { SmtpServer } from './pages/SmtpServer';
import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  DollarSign,
  FileSearch,
  FileText,
  FolderOpen,
  Home,
  MapPin,
  Menu,
  Package,
  Search,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Star,
  Tags,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { hrefToSlug } from './data/menuApi';
import { menuDisplayCaption } from './data/menuPresentation';
import type { SalesModuleMode } from './pages/SalesOrders';
import type { MenuCategory, MenuItem } from './types/menu';

const NAVIGATION_EVENT = 'akiva:navigation';

function normalizeMenuSlug(pageId: string): string {
  if (!pageId.startsWith('menu-')) return '';
  const firstDash = pageId.indexOf('-', 5);
  return firstDash > -1 ? pageId.slice(firstDash + 1) : '';
}

function normalizedSlugKey(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSalesMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  if (!key) return false;
  return [
    'sales',
    'order',
    'invoice',
    'debtor',
    'customer',
    'quotation',
    'countersales',
    'credit',
    'topitems',
    'dailysalesinquiry',
    'pdflowgp',
    'pdfpricelist',
    'pdforderstatus',
    'pdfordersinvoiced',
    'pdfdeliverydifferences',
    'pdfdifot',
    'salesinquiry',
    'selectorderitems',
    'specialorder',
    'recurringsalesordersprocess',
    'selectrecurringsalesorder',
    'selectcompletedorder',
    'selectsalesorder',
  ].some((keyword) => key.includes(keyword));
}

function isGeneralLedgerMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  if (!key) return false;
  return [
    'gl',
    'journal',
    'bankaccount',
    'bankmatching',
    'bankreconciliation',
    'accountgroup',
    'accountsection',
    'glaccount',
    'trialbalance',
    'balancesheet',
    'profitloss',
    'cashflows',
    'gltag',
    'selectglaccount',
    'glaccountgraph',
    'glaccountreport',
    'glaccountcsv',
    'dailybanktransactions',
    'importbanktrans',
    'customerreceipt',
    'payment',
  ].some((keyword) => key.includes(keyword));
}

function isGeneralLedgerPathSegment(segment: string): boolean {
  const key = segment.toLowerCase().replace(/[^a-z0-9]/g, '');
  return key === 'generalledger' || key === 'gl';
}

function isConfigurationMenuCaption(caption: string): boolean {
  return normalizedSlugKey(caption) === 'configuration';
}

function isCompanyPreferencesMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'companypreferences' || key.includes('companypreferences');
}

function isSystemParametersMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'systemparameters' || key.includes('systemparameters');
}

function isAuditTrailMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'audittrail' || key.includes('audittrail');
}

function isSystemCheckMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'systemcheck' || key.includes('systemcheck');
}

function isGeocodeSetupMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'geocodesetup' || key.includes('geocodesetup');
}

function isFormDesignerMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'formdesigner' || key.includes('formdesigner') || key.includes('documenttemplate');
}

function isLabelsMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'labels' || key.includes('labeltemplates') || key.includes('pricelabels');
}

function isPrintPriceLabelsMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'pdfprintlabel' ||
    key === 'printpricelabels' ||
    key === 'printlabels' ||
    key.includes('pdfprintlabel') ||
    key.includes('printpricelabel')
  );
}

function isSmtpServerMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'smtpserver' || key.includes('smtpserver') || key.includes('mailserver');
}

function isWwwUsersMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'wwwusers' || key.includes('wwwusers') || key.includes('usermanagement');
}

function isAccessPermissionsMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'wwwaccess' || key.includes('wwwaccess') || key.includes('accesspermissions');
}

function isMenuAccessMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'menuaccess' || key.includes('menuaccess') || key.includes('menurights');
}

function isGeneralLedgerSetupMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'generalledgersetup' ||
    key.includes('bankaccounts') ||
    key.includes('currencies') ||
    key.includes('taxauthorities') ||
    key.includes('taxgroups') ||
    key.includes('taxprovinces') ||
    key.includes('taxcategories') ||
    key.includes('periodsinquiry')
  );
}

function isSalesReceivablesSetupMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'salesreceivablessetup' ||
    key === 'salestypes' ||
    key.includes('salestypes') ||
    key === 'customertypes' ||
    key.includes('customertypes') ||
    key === 'creditstatus' ||
    key.includes('creditstatus') ||
    key === 'holdreasons' ||
    key.includes('holdreasons') ||
    key === 'paymentterms' ||
    key.includes('paymentterms') ||
    key === 'paymentmethods' ||
    key.includes('paymentmethods') ||
    key === 'salespeople' ||
    key.includes('salespeople') ||
    key === 'salesman' ||
    key.includes('salesman') ||
    key === 'areas' ||
    key.includes('salesareas') ||
    key === 'salesglpostings' ||
    key.includes('salesglpostings') ||
    key === 'salesglposting' ||
    key.includes('salesglposting') ||
    key === 'cogsglpostings' ||
    key.includes('cogsglpostings') ||
    key === 'cogsglposting' ||
    key.includes('cogsglposting') ||
    key === 'discountmatrix' ||
    key.includes('discountmatrix')
  );
}

function isPurchasesPayablesSetupMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'purchasespayablessetup' ||
    key === 'supplier-types' ||
    key.includes('suppliertypes') ||
    key === 'paymentterms' ||
    key.includes('paymentterms') ||
    key === 'poauthorisationlevels' ||
    key.includes('poauthorisationlevels') ||
    key === 'poauthorizationlevels' ||
    key.includes('poauthorizationlevels') ||
    key === 'paymentmethods' ||
    key.includes('paymentmethods') ||
    key === 'shippers' ||
    key.includes('shippers') ||
    key === 'freightcosts' ||
    key.includes('freightcosts')
  );
}

function isPurchaseOrderMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'poselectospurchorder' ||
    key.includes('poselectospurchorder') ||
    key === 'poheader' ||
    key === 'poitems' ||
    key === 'purchaseorders' ||
    key.includes('purchorder') ||
    key.includes('goodsreceived') ||
    key.includes('reprintgrn') ||
    key.includes('outstandinggrns') ||
    key.includes('suppinvgrns')
  );
}

function isReverseGrnMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'reversegrn' ||
    key === 'reversegoodsreceived' ||
    key.includes('reversegrn') ||
    key.includes('reversegoodsreceived')
  );
}

function isInventoryTransferMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockloctransfer' ||
    key === 'stocktransfers' ||
    key.includes('stockloctransfer') ||
    key.includes('stocktransfers') ||
    key.includes('bulkinventorytransfer') ||
    key.includes('inventorylocationtransfer') ||
    key.includes('stocklocationtransfer') ||
    key.includes('locationtransfers')
  );
}

function isInventoryTransferReceiveMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockloctransferreceive' ||
    key.includes('stockloctransferreceive') ||
    key.includes('bulkinventorytransferreceive')
  );
}

function isStockAdjustmentMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockadjustments' ||
    key === 'inventoryadjustments' ||
    key.includes('stockadjustments') ||
    key.includes('inventoryadjustments')
  );
}

function isStockCheckMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockcheck' ||
    key === 'inventorystockchecksheets' ||
    key.includes('stockcheck')
  );
}

function isStockCheckComparisonMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'pdfstockcheckcomparison' ||
    key === 'stockcheckcomparison' ||
    key === 'inventorycomparisonreport' ||
    key.includes('pdfstockcheckcomparison') ||
    key.includes('stockcheckcomparison')
  );
}

function isStockCountsMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockcounts' ||
    key === 'enterstockcounts' ||
    key.includes('stockcounts') ||
    key.includes('enterstockcounts')
  );
}

function isStockIssueMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockissue' ||
    key === 'stockissues' ||
    key === 'enterstockissue' ||
    key.includes('stockissue') ||
    key.includes('enterstockissue')
  );
}

function isStockSerialItemResearchMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockserialitemresearch' ||
    key === 'serialitemresearch' ||
    key.includes('stockserialitemresearch') ||
    key.includes('serialitemresearch')
  );
}

function isStockMovementsMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockmovements' ||
    key === 'stockmovement' ||
    key.includes('stockmovements') ||
    key.includes('stockmovement')
  );
}

function isStockLocationMovementsMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stocklocmovements' ||
    key === 'stocklocationmovements' ||
    key === 'allinventorymovementsbylocationdate' ||
    key.includes('stocklocmovements') ||
    key.includes('stocklocationmovements') ||
    key.includes('inventorymovementsbylocation')
  );
}

function isStockStatusMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockstatus' ||
    key === 'stock-status' ||
    key.includes('stockstatus')
  );
}

function isStockLocationStatusMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stocklocstatus' ||
    key === 'stocklocationstatus' ||
    key === 'listinventorystatusbylocationcategory' ||
    key.includes('stocklocstatus') ||
    key.includes('stocklocationstatus') ||
    key.includes('inventorystatusbylocation')
  );
}

function isStockUsageMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockusage' ||
    key === 'stock-usage' ||
    key === 'inventoryitemusage' ||
    key.includes('stockusage') ||
    key.includes('inventoryitemusage')
  );
}

function isAllInventoryUsageMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'allinventoryusage' ||
    key === 'allstockusage' ||
    key.includes('allinventoryusage') ||
    key.includes('allstockusage')
  );
}

function isInventoryQuantitiesMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'inventoryquantities' ||
    key === 'inventory-quantities' ||
    key.includes('inventoryquantities')
  );
}

function isStockQuantitiesCsvMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockqtiescsv' ||
    key === 'stockquantitiescsv' ||
    key === 'makeinventoryquantitiescsv' ||
    key.includes('stockqtiescsv') ||
    key.includes('stockquantitiescsv')
  );
}

function isStockQuantityByDateMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockquantitybydate' ||
    key === 'historicalstockquantity' ||
    key === 'historicalstockquantitybylocationcategory' ||
    key.includes('stockquantitybydate') ||
    key.includes('historicalstockquantity')
  );
}

function isStockNegativesMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'pdfstocknegatives' ||
    key === 'stocknegatives' ||
    key === 'negativestocklisting' ||
    key === 'listnegativestocks' ||
    key.includes('pdfstocknegatives') ||
    key.includes('stocknegatives') ||
    key.includes('negativestock')
  );
}

function isStockTransactionListingMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'pdfstocktranslisting' ||
    key === 'pdfperiodstocktranslisting' ||
    key === 'stocktransactionlisting' ||
    key === 'periodstocktransactionlisting' ||
    key === 'dailystocktransactionlisting' ||
    key.includes('pdfstocktranslisting') ||
    key.includes('pdfperiodstocktranslisting') ||
    key.includes('stocktransactionlisting')
  );
}

function isInventoryValuationMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'inventoryvaluation' ||
    key === 'stockvaluation' ||
    key === 'inventoryvaluationreport' ||
    key.includes('inventoryvaluation') ||
    key.includes('stockvaluation')
  );
}

function isInventoryPlanningMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'inventoryplanning' ||
    key === 'inventoryplanningreport' ||
    key.includes('inventoryplanning')
  );
}

function isReorderLevelMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'reorderlevel' ||
    key === 'reorder-level' ||
    key === 'stockreorderlevel' ||
    key.includes('reorderlevel')
  );
}

function isReorderLevelLocationMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'reorderlevellocation' ||
    key === 'reorder-level-location' ||
    key.includes('reorderlevellocation')
  );
}

function isStockDispatchMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'stockdispatch' ||
    key === 'dispatchstocktransfer' ||
    key.includes('stockdispatch') ||
    key.includes('dispatchstocktransfer')
  );
}

function isInventoryItemsMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'selectproduct' ||
    key === 'stocks' ||
    key === 'stockmaster' ||
    key === 'inventoryitems' ||
    key.includes('selectproduct') ||
    key.includes('inventoryitems') ||
    key.includes('stockmaster')
  );
}

function isSalesCategoriesMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'salescategories' || key.includes('salescategories');
}

function isMarkupPricesMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'pricesbasedonmarkup' ||
    key === 'pricesbycost' ||
    key === 'costbasedprices' ||
    key.includes('pricesbasedonmarkup') ||
    key.includes('pricesbycost') ||
    key.includes('costbasedprices')
  );
}

function isInventorySetupMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'inventorysetup' ||
    key.includes('stockcategories') ||
    key === 'locations' ||
    key.includes('inventorylocations') ||
    key.includes('discountcategories') ||
    key.includes('unitsofmeasure') ||
    key.includes('unitsofmeasurement') ||
    key.includes('locationusers') ||
    key.includes('userlocations') ||
    key.includes('departments') ||
    key.includes('internalstockcategoriesbyrole')
  );
}

function isManufacturingSetupMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return (
    key === 'manufacturingsetup' ||
    key.includes('mrpcalendar') ||
    key.includes('mrpavailableproductiondays') ||
    key.includes('mrpdemandtypes')
  );
}

function resolveSalesReceivablesSetupTab(slug: string) {
  const key = normalizedSlugKey(slug);
  if (key.includes('customertypes')) return 'customer-types' as const;
  if (key.includes('creditstatus') || key.includes('holdreasons')) return 'credit-status' as const;
  if (key.includes('paymentterms')) return 'payment-terms' as const;
  if (key.includes('paymentmethods')) return 'payment-methods' as const;
  if (key.includes('salespeople') || key.includes('salesman')) return 'sales-people' as const;
  if (key.includes('areas') || key.includes('salesareas')) return 'areas' as const;
  if (key.includes('salesglpostings') || key.includes('salesglposting')) return 'sales-gl-postings' as const;
  if (key.includes('cogsglpostings') || key.includes('cogsglposting')) return 'cogs-gl-postings' as const;
  if (key.includes('discountmatrix')) return 'discount-matrix' as const;
  return 'sales-types' as const;
}

function resolvePurchasesPayablesSetupTab(slug: string) {
  const key = normalizedSlugKey(slug);
  if (key.includes('paymentterms')) return 'payment-terms' as const;
  if (key.includes('poauthorisationlevels') || key.includes('poauthorizationlevels')) return 'po-authorisation-levels' as const;
  if (key.includes('paymentmethods')) return 'payment-methods' as const;
  if (key.includes('shippers')) return 'shippers' as const;
  if (key.includes('freightcosts')) return 'freight-costs' as const;
  return 'supplier-types' as const;
}

function resolveInventorySetupTab(slug: string) {
  const key = normalizedSlugKey(slug);
  if (key.includes('locations') || key.includes('locationusers') || key.includes('userlocations') || key.includes('departments')) return 'locations' as const;
  if (key.includes('discountcategories')) return 'discount-categories' as const;
  if (key.includes('unitsofmeasure') || key.includes('unitsofmeasurement')) return 'units-of-measure' as const;
  return 'stock-categories' as const;
}

function resolveManufacturingSetupTab(slug: string) {
  const key = normalizedSlugKey(slug);
  if (key.includes('mrpdemandtypes')) return 'mrp-demand-types' as const;
  return 'mrp-calendar' as const;
}

function resolveGeneralLedgerSetupTab(slug: string) {
  const key = normalizedSlugKey(slug);
  if (key.includes('currencies')) return 'currencies' as const;
  if (key.includes('taxauthorities')) return 'tax-authorities' as const;
  if (key.includes('taxgroups')) return 'tax-groups' as const;
  if (key.includes('taxprovinces')) return 'tax-provinces' as const;
  if (key.includes('taxcategories')) return 'tax-categories' as const;
  if (key.includes('periodsinquiry') || key.includes('periodsdefined')) return 'periods' as const;
  return 'bank-accounts' as const;
}

function knownSettingsViewFromPath(pathname: string) {
  const pathKey = normalizedSlugKey(pathname);

  if (pathKey.includes('configurationgeneralledgersetup')) {
    return <GeneralLedgerSetup initialTab={resolveGeneralLedgerSetupTab(pathname)} />;
  }

  if (pathKey.includes('configurationsalesreceivablessetup')) {
    return <SalesReceivablesSetup initialTab={resolveSalesReceivablesSetupTab(pathname)} />;
  }

  if (pathKey.includes('configurationpurchasespayablessetup')) {
    return <PurchasesPayablesSetup initialTab={resolvePurchasesPayablesSetupTab(pathname)} />;
  }

  if (pathKey.includes('configurationinventorysetup')) {
    return <InventorySetup initialTab={resolveInventorySetupTab(pathname)} />;
  }

  if (pathKey.includes('configurationmanufacturingsetup')) {
    return <ManufacturingSetup initialTab={resolveManufacturingSetupTab(pathname)} />;
  }

  if (isInventoryItemsMenuSlug(pathname)) {
    return <InventoryItems />;
  }

  if (isMarkupPricesMenuSlug(pathname)) {
    return <MarkupPrices />;
  }

  if (isSalesCategoriesMenuSlug(pathname)) {
    return <SalesCategories />;
  }

  if (pathKey.includes('configurationuserswwwusers')) {
    return <UserManagement />;
  }

  if (pathKey.includes('configurationuserswwwaccess')) {
    return <AccessPermissions />;
  }

  if (pathKey.includes('configurationusersmenuaccess') || pathKey.includes('configurationusersmenurights')) {
    return <MenuAccess />;
  }

  return null;
}

type GeneralLedgerView = 'transactions' | 'accounts';

function resolveGeneralLedgerView(slug: string): GeneralLedgerView {
  const key = normalizedSlugKey(slug);

  if (
    key.includes('accountsection') ||
    key.includes('accountgroup') ||
    key.includes('glaccounts')
  ) {
    return 'accounts';
  }

  if (
    key.includes('trialbalance') ||
    key.includes('balancesheet') ||
    key.includes('profitloss') ||
    key.includes('cashflows') ||
    key.includes('gltag') ||
    key.includes('analysishorizontal') ||
    key.includes('tax')
  ) {
    return 'transactions';
  }

  return 'transactions';
}

function resolveSalesMode(slug: string): SalesModuleMode {
  const key = normalizedSlugKey(slug);

  const reportKeywords = [
    'report',
    'analysis',
    'inquiry',
    'statement',
    'aged',
    'status',
    'pdfpricelist',
    'pdforderstatus',
    'pdfordersinvoiced',
    'dailysalesinquiry',
    'pdfdeliverydifferences',
    'pdfdifot',
    'salesinquiry',
    'topitems',
    'pdflowgp',
    'selectcompletedorder',
  ];
  const settingsKeywords = [
    'setup',
    'config',
    'maintenance',
    'type',
    'salestypes',
    'sales-types',
    'price',
    'discount',
    'paymentterms',
    'payment-terms',
    'salespeople',
    'salesman',
    'salesglpostings',
    'sales-gl-postings',
    'cogsglpostings',
    'cogs-gl-postings',
    'discountmatrix',
    'discount-matrix',
    'holdreasons',
    'hold-reasons',
    'maintenance',
    'contract',
  ];

  if (reportKeywords.some((keyword) => key.includes(keyword))) return 'reports';
  if (settingsKeywords.some((keyword) => key.includes(keyword))) return 'settings';
  return 'transactions';
}

function menuSlugToTitle(slug: string): string {
  if (!slug) return 'Module';
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

type MenuNode = MenuCategory | MenuItem;

function parseMenuNodeId(pageId: string): number | null {
  if (!pageId.startsWith('menu-')) return null;
  const firstDash = pageId.indexOf('-', 5);
  if (firstDash <= 5) return null;
  const rawId = pageId.slice(5, firstDash);
  const id = Number(rawId);
  return Number.isFinite(id) ? id : null;
}

function findMenuNodeById(nodes: MenuNode[], id: number): MenuNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const children = node.children as MenuNode[] | undefined;
    if (!children || children.length === 0) continue;
    const match = findMenuNodeById(children, id);
    if (match) return match;
  }
  return null;
}

function findMenuNodeTrailById(nodes: MenuNode[], id: number, trail: MenuNode[] = []): MenuNode[] | null {
  for (const node of nodes) {
    const nextTrail = [...trail, node];
    if (node.id === id) return nextTrail;
    const children = node.children as MenuNode[] | undefined;
    if (!children || children.length === 0) continue;
    const match = findMenuNodeTrailById(children, id, nextTrail);
    if (match) return match;
  }
  return null;
}

function fallbackMenuSlug(caption: string): string {
  return caption.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

function menuNodePageId(node: MenuNode): string {
  const slug = hrefToSlug(node.href ?? '') || fallbackMenuSlug(node.caption);
  return `menu-${node.id}-${slug}`;
}

function isHiddenMobileMenuNode(node: MenuNode): boolean {
  const captionKey = normalizedSlugKey(node.caption);
  const slugKey = normalizedSlugKey(hrefToSlug(node.href ?? ''));
  return captionKey.includes('pagesecurity') || slugKey === 'pagesecurity' || captionKey === 'reportbuildertool' || slugKey === 'reportcreator';
}

function getMobileMenuIcon(node: MenuNode, hasChildren: boolean): LucideIcon {
  const captionKey = normalizedSlugKey(node.caption);
  const key = normalizedSlugKey(`${node.href ?? ''} ${node.caption}`);

  if (captionKey === 'transactions') return ArrowLeftRight;
  if (captionKey === 'inquiriesandreports') return BarChart3;
  if (captionKey === 'maintenance') return Settings;
  if (key.includes('selectproduct') || key.includes('stocks')) return Package;
  if (key.includes('pricesbasedonmarkup') || key.includes('pricesbycost')) return DollarSign;
  if (key.includes('salescategories')) return Tags;
  if (key.includes('locationusers') || key.includes('userlocations')) return MapPin;
  if (key.includes('departments')) return FolderOpen;
  if (key.includes('internalstockcategoriesbyrole')) return ShieldAlert;
  if (key.includes('labels')) return Tags;
  if (key.includes('pdfprintlabel') || key.includes('pricelabel')) return Tags;
  if (key.includes('stockserialitemresearch') || key.includes('stockstatus')) return Search;
  if (key.includes('stocklocmovements') || key.includes('stocklocstatus') || key.includes('reorderlevellocation')) return MapPin;
  if (key.includes('stockmovements') || key.includes('pdfstocktranslisting')) return ArrowLeftRight;
  if (key.includes('stockusage') || key.includes('allstockusage') || key.includes('inventoryplanning')) return BarChart3;
  if (key.includes('stockcheckcomparison')) return ClipboardCheck;
  if (key.includes('inventoryquantities') || key.includes('stockqtiescsv') || key.includes('stockcheck')) return ClipboardList;
  if (key.includes('stockquantitybydate')) return CalendarDays;
  if (key.includes('pdfstocknegatives')) return ShieldAlert;
  if (key.includes('inventoryvaluation')) return DollarSign;
  if (key.includes('reorderlevel')) return ClipboardCheck;
  if (key.includes('stockdispatch')) return Truck;
  if (key.includes('stock') || key.includes('inventory')) return Package;
  if (hasChildren) return FolderOpen;
  return FileText;
}

function AppContent() {
  const { currentPage, setCurrentPage, mobileSidebarOpen, appMenu } = useApp();
  const [locationPathname, setLocationPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const syncLocation = () => setLocationPathname(window.location.pathname);
    window.addEventListener('popstate', syncLocation);
    window.addEventListener(NAVIGATION_EVENT, syncLocation);
    return () => {
      window.removeEventListener('popstate', syncLocation);
      window.removeEventListener(NAVIGATION_EVENT, syncLocation);
    };
  }, []);

  const renderCurrentPage = () => {
    const normalizedPath = locationPathname.replace(/\/+$/, '').toLowerCase();

    if (normalizedPath === '/inventory') {
      return <Inventory />;
    }

    if (currentPage.startsWith('main-')) {
      const mainId = parseInt(currentPage.replace('main-', ''), 10);
      const mainModule = appMenu.find((item) => item.id === mainId);

      if (mainModule && isConfigurationMenuCaption(mainModule.caption)) {
        return <ConfigurationDashboard module={mainModule} onSelectPage={setCurrentPage} />;
      }

      return (
        <div className="p-4 md:p-8">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            {mainModule?.caption ?? 'Module'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Select a submenu from the right panel to continue.
          </p>
        </div>
      );
    }

    const menuSlug = normalizeMenuSlug(currentPage);
    const primaryPathSegment = locationPathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
    const menuNodeId = parseMenuNodeId(currentPage);
    const currentMenuNode = menuNodeId !== null ? findMenuNodeById(appMenu as MenuNode[], menuNodeId) : null;
    const currentMenuTrail = menuNodeId !== null ? findMenuNodeTrailById(appMenu as MenuNode[], menuNodeId) ?? [] : [];
    const currentMenuHref = currentMenuNode?.href ?? '';
    const currentMenuCaption = currentMenuNode?.caption ?? '';
    const isConfigurationMenuContext = currentMenuTrail.some((node) => normalizedSlugKey(node.caption) === 'configuration');
    const isGeneralLedgerSetupMenuContext = currentMenuTrail.some((node) => normalizedSlugKey(node.caption) === 'generalledgersetup');
    const isPurchasesPayablesSetupMenuContext = currentMenuTrail.some((node) => normalizedSlugKey(node.caption) === 'purchasespayablessetup');
    const isPurchasesPayablesSetupPathContext = normalizedSlugKey(locationPathname).includes('configurationpurchasespayablessetup');
    const isInventorySetupMenuContext = currentMenuTrail.some((node) => normalizedSlugKey(node.caption) === 'inventorysetup');
    const isInventorySetupPathContext = normalizedSlugKey(locationPathname).includes('configurationinventorysetup');
    const isManufacturingSetupMenuContext = currentMenuTrail.some((node) => normalizedSlugKey(node.caption) === 'manufacturingsetup');
    const isManufacturingSetupPathContext = normalizedSlugKey(locationPathname).includes('configurationmanufacturingsetup');

    if (menuSlug) {
      if (isCompanyPreferencesMenuSlug(menuSlug)) {
        return <CompanyPreferences />;
      }

      if (isSystemParametersMenuSlug(menuSlug)) {
        return <SystemParameters />;
      }

      if (isAuditTrailMenuSlug(menuSlug)) {
        return <AuditTrail />;
      }

      if (isSystemCheckMenuSlug(menuSlug)) {
        return <SystemCheck />;
      }

      if (isGeocodeSetupMenuSlug(menuSlug)) {
        return <GeocodeSetup />;
      }

      if (isFormDesignerMenuSlug(menuSlug)) {
        return <FormDesigner />;
      }

      if (isPrintPriceLabelsMenuSlug(menuSlug)) {
        return <PrintPriceLabels />;
      }

      if (isLabelsMenuSlug(menuSlug)) {
        return <Labels />;
      }

      if (isSmtpServerMenuSlug(menuSlug)) {
        return <SmtpServer />;
      }

      if (isWwwUsersMenuSlug(menuSlug)) {
        return <UserManagement />;
      }

      if (isAccessPermissionsMenuSlug(menuSlug)) {
        return <AccessPermissions />;
      }

      if (isMenuAccessMenuSlug(menuSlug)) {
        return <MenuAccess />;
      }

      if (
        (primaryPathSegment === 'configuration' || isConfigurationMenuContext || isGeneralLedgerSetupMenuContext) &&
        isGeneralLedgerSetupMenuSlug(menuSlug)
      ) {
        return <GeneralLedgerSetup initialTab={resolveGeneralLedgerSetupTab(menuSlug)} />;
      }

      if (
        (isPurchasesPayablesSetupMenuContext || isPurchasesPayablesSetupPathContext || normalizedSlugKey(menuSlug) === 'purchasespayablessetup') &&
        isPurchasesPayablesSetupMenuSlug(menuSlug)
      ) {
        return <PurchasesPayablesSetup initialTab={resolvePurchasesPayablesSetupTab(menuSlug)} />;
      }

      if (isInventoryItemsMenuSlug(menuSlug)) {
        return <InventoryItems />;
      }

      if (isMarkupPricesMenuSlug(menuSlug)) {
        return <MarkupPrices />;
      }

      if (isSalesCategoriesMenuSlug(menuSlug)) {
        return <SalesCategories />;
      }

      if (isManufacturingSetupMenuSlug(menuSlug)) {
        return <ManufacturingSetup initialTab={resolveManufacturingSetupTab(menuSlug)} />;
      }

      if (isInventorySetupMenuSlug(menuSlug)) {
        return <InventorySetup initialTab={resolveInventorySetupTab(menuSlug)} />;
      }

      if (
        (isInventorySetupMenuContext || isInventorySetupPathContext || normalizedSlugKey(menuSlug) === 'inventorysetup') &&
        isInventorySetupMenuSlug(menuSlug)
      ) {
        return <InventorySetup initialTab={resolveInventorySetupTab(menuSlug)} />;
      }

      if (
        (isManufacturingSetupMenuContext || isManufacturingSetupPathContext || normalizedSlugKey(menuSlug) === 'manufacturingsetup') &&
        isManufacturingSetupMenuSlug(menuSlug)
      ) {
        return <ManufacturingSetup initialTab={resolveManufacturingSetupTab(menuSlug)} />;
      }

      if ((primaryPathSegment === 'configuration' || isConfigurationMenuContext) && !isPurchasesPayablesSetupMenuContext && isSalesReceivablesSetupMenuSlug(menuSlug)) {
        return <SalesReceivablesSetup initialTab={resolveSalesReceivablesSetupTab(menuSlug)} />;
      }

      if (!isConfigurationMenuContext && (isGeneralLedgerPathSegment(primaryPathSegment) || isGeneralLedgerMenuSlug(menuSlug))) {
        const glView = resolveGeneralLedgerView(menuSlug);
        if (glView === 'accounts') {
          return <ChartOfAccounts sourceSlug={menuSlug} />;
        }
        return <GeneralLedger sourceSlug={menuSlug} sourceHref={currentMenuHref} sourceCaption={currentMenuCaption} />;
      }

      if (isStockAdjustmentMenuSlug(menuSlug)) {
        return <StockAdjustments />;
      }

      if (isStockCheckComparisonMenuSlug(menuSlug)) {
        return <StockCheckComparison />;
      }

      if (isStockCheckMenuSlug(menuSlug)) {
        return <StockCheck />;
      }

      if (isStockCountsMenuSlug(menuSlug)) {
        return <StockCounts />;
      }

      if (isStockIssueMenuSlug(menuSlug)) {
        return <StockIssues />;
      }

      if (isStockSerialItemResearchMenuSlug(menuSlug)) {
        return <StockSerialItemResearch />;
      }

      if (isStockLocationMovementsMenuSlug(menuSlug)) {
        return <StockLocationMovements />;
      }

      if (isStockMovementsMenuSlug(menuSlug)) {
        return <StockMovements />;
      }

      if (isStockLocationStatusMenuSlug(menuSlug)) {
        return <StockLocationStatus />;
      }

      if (isStockStatusMenuSlug(menuSlug)) {
        return <StockStatus />;
      }

      if (isAllInventoryUsageMenuSlug(menuSlug)) {
        return <AllInventoryUsage />;
      }

      if (isStockQuantitiesCsvMenuSlug(menuSlug)) {
        return <StockQuantitiesCsv />;
      }

      if (isStockQuantityByDateMenuSlug(menuSlug)) {
        return <StockQuantityByDate />;
      }

      if (isStockNegativesMenuSlug(menuSlug)) {
        return <StockNegatives />;
      }

      if (isStockTransactionListingMenuSlug(menuSlug)) {
        return <StockTransactionListing />;
      }

      if (isInventoryQuantitiesMenuSlug(menuSlug)) {
        return <InventoryQuantities />;
      }

      if (isInventoryValuationMenuSlug(menuSlug)) {
        return <InventoryValuation />;
      }

      if (isInventoryPlanningMenuSlug(menuSlug)) {
        return <InventoryPlanning />;
      }

      if (isReorderLevelLocationMenuSlug(menuSlug)) {
        return <ReorderLevelLocation />;
      }

      if (isReorderLevelMenuSlug(menuSlug)) {
        return <ReorderLevel />;
      }

      if (isStockDispatchMenuSlug(menuSlug)) {
        return <StockDispatch />;
      }

      if (isStockUsageMenuSlug(menuSlug)) {
        return <StockUsage />;
      }

      if (isReverseGrnMenuSlug(menuSlug)) {
        return <ReverseGoodsReceived />;
      }

      if (isPurchaseOrderMenuSlug(menuSlug)) {
        return <PurchaseOrders />;
      }

      if (isInventoryTransferReceiveMenuSlug(menuSlug)) {
        return <InventoryTransferReceive />;
      }

      if (isInventoryTransferMenuSlug(menuSlug)) {
        return <InventoryTransfer />;
      }

      if (primaryPathSegment === 'sales' || isSalesMenuSlug(menuSlug)) {
        return <SalesOrders mode={resolveSalesMode(menuSlug)} sourceSlug={menuSlug} />;
      }

      return (
        <div className="p-4 md:p-8">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            {menuSlugToTitle(menuSlug)}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            This module is not available yet.
          </p>
        </div>
      );
    }

    const routeView = knownSettingsViewFromPath(locationPathname);
    if (routeView) return routeView;

    if (isPrintPriceLabelsMenuSlug(locationPathname)) {
      return <PrintPriceLabels />;
    }

    if (isStockCheckComparisonMenuSlug(locationPathname)) {
      return <StockCheckComparison />;
    }

    if (isStockCheckMenuSlug(locationPathname)) {
      return <StockCheck />;
    }

    if (isStockLocationMovementsMenuSlug(locationPathname)) {
      return <StockLocationMovements />;
    }

    if (isStockMovementsMenuSlug(locationPathname)) {
      return <StockMovements />;
    }

    if (isStockLocationStatusMenuSlug(locationPathname)) {
      return <StockLocationStatus />;
    }

    if (isStockStatusMenuSlug(locationPathname)) {
      return <StockStatus />;
    }

    if (isAllInventoryUsageMenuSlug(locationPathname)) {
      return <AllInventoryUsage />;
    }

    if (isStockQuantitiesCsvMenuSlug(locationPathname)) {
      return <StockQuantitiesCsv />;
    }

    if (isStockQuantityByDateMenuSlug(locationPathname)) {
      return <StockQuantityByDate />;
    }

    if (isStockNegativesMenuSlug(locationPathname)) {
      return <StockNegatives />;
    }

    if (isStockTransactionListingMenuSlug(locationPathname)) {
      return <StockTransactionListing />;
    }

    if (isInventoryQuantitiesMenuSlug(locationPathname)) {
      return <InventoryQuantities />;
    }

    if (isInventoryValuationMenuSlug(locationPathname)) {
      return <InventoryValuation />;
    }

    if (isInventoryPlanningMenuSlug(locationPathname)) {
      return <InventoryPlanning />;
    }

    if (isReorderLevelLocationMenuSlug(locationPathname)) {
      return <ReorderLevelLocation />;
    }

    if (isReorderLevelMenuSlug(locationPathname)) {
      return <ReorderLevel />;
    }

    if (isStockDispatchMenuSlug(locationPathname)) {
      return <StockDispatch />;
    }

    if (isStockUsageMenuSlug(locationPathname)) {
      return <StockUsage />;
    }

    if (isInventoryItemsMenuSlug(locationPathname)) {
      return <InventoryItems />;
    }

    if (isMarkupPricesMenuSlug(locationPathname)) {
      return <MarkupPrices />;
    }

    if (isSalesCategoriesMenuSlug(locationPathname)) {
      return <SalesCategories />;
    }

    switch (currentPage) {
      case 'accounts':
        return <ChartOfAccounts />;
      case 'general-ledger':
        return <GeneralLedger sourceSlug="general-ledger" sourceCaption="General Ledger" />;
      case 'receivables':
        return <AccountsReceivable />;
      case 'payables':
        return <AccountsPayable />;
      case 'inventory':
        return <Inventory />;
      case 'selectproduct':
      case 'stocks':
      case 'inventory-items':
      case 'inventoryitems':
      case 'stockmaster':
        return <InventoryItems />;
      case 'pricesbasedonmarkup':
      case 'prices-by-cost':
      case 'pricesbycost':
      case 'cost-based-prices':
      case 'costbasedprices':
        return <MarkupPrices />;
      case 'salescategories':
      case 'sales-categories':
        return <SalesCategories />;
      case 'sales-orders':
        return <SalesOrders mode="transactions" sourceSlug="sales-orders" />;
      case 'purchase-orders':
        return <PurchaseOrders />;
      case 'financial-reports':
        return <FinancialReports />;
      case 'users':
        return <UserManagement />;
      case 'www-access':
      case 'access':
        return <AccessPermissions />;
      case 'menu-access':
      case 'menuaccess':
      case 'menu-rights':
        return <MenuAccess />;
      case 'general-ledger-setup':
      case 'bank-accounts-setup':
      case 'currencies':
      case 'tax-authorities':
      case 'tax-groups':
      case 'tax-provinces':
      case 'tax-categories':
      case 'periods':
        return <GeneralLedgerSetup initialTab={resolveGeneralLedgerSetupTab(currentPage)} />;
      case 'sales-types':
      case 'salestypes':
      case 'customer-types':
      case 'customertypes':
      case 'credit-status':
      case 'creditstatus':
      case 'hold-reasons':
      case 'holdreasons':
      case 'payment-terms':
      case 'paymentterms':
      case 'payment-methods':
      case 'paymentmethods':
      case 'sales-people':
      case 'salespeople':
      case 'salesman':
      case 'areas':
      case 'sales-areas':
      case 'salesareas':
      case 'sales-gl-postings':
      case 'salesglpostings':
      case 'sales-gl-posting':
      case 'salesglposting':
      case 'cogs-gl-postings':
      case 'cogsglpostings':
      case 'cogs-gl-posting':
      case 'cogsglposting':
      case 'discount-matrix':
      case 'discountmatrix':
        return <SalesReceivablesSetup initialTab={resolveSalesReceivablesSetupTab(currentPage)} />;
      case 'purchases-payables-setup':
      case 'purchasespayablessetup':
      case 'supplier-types':
      case 'suppliertypes':
      case 'po-authorisation-levels':
      case 'poauthorisationlevels':
      case 'po-authorization-levels':
      case 'poauthorizationlevels':
      case 'shippers':
      case 'freight-costs':
      case 'freightcosts':
        return <PurchasesPayablesSetup initialTab={resolvePurchasesPayablesSetupTab(currentPage)} />;
      case 'inventory-setup':
      case 'inventorysetup':
      case 'stock-categories':
      case 'stockcategories':
      case 'inventory-locations':
      case 'inventorylocations':
      case 'discount-categories':
      case 'discountcategories':
      case 'units-of-measure':
      case 'unitsofmeasure':
        return <InventorySetup initialTab={resolveInventorySetupTab(currentPage)} />;
      case 'manufacturing-setup':
      case 'manufacturingsetup':
      case 'mrp-calendar':
      case 'mrpcalendar':
      case 'mrp-available-production-days':
      case 'mrpavailableproductiondays':
      case 'mrp-demand-types':
      case 'mrpdemandtypes':
        return <ManufacturingSetup initialTab={resolveManufacturingSetupTab(currentPage)} />;
      case 'companypreferences':
      case 'company-preferences':
        return <CompanyPreferences />;
      case 'systemparameters':
      case 'system-parameters':
        return <SystemParameters />;
      case 'audittrail':
      case 'audit-trail':
        return <AuditTrail />;
      case 'systemcheck':
      case 'system-check':
        return <SystemCheck />;
      case 'geocodesetup':
      case 'geocode-setup':
        return <GeocodeSetup />;
      case 'formdesigner':
      case 'form-designer':
      case 'document-template-designer':
        return <FormDesigner />;
      case 'labels':
      case 'label-templates':
      case 'price-labels':
        return <Labels />;
      case 'pdfprintlabel':
      case 'pdf-print-label':
      case 'print-labels':
      case 'print-price-labels':
        return <PrintPriceLabels />;
      case 'smtpserver':
      case 'smtp-server':
      case 'mail-server':
        return <SmtpServer />;
      // Sales & Customer Management
      case 'sales-invoices':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Sales Invoices</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Manage customer invoices and billing</p></div>;
      case 'credit-notes':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Credit Notes</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Process customer credit notes and returns</p></div>;
      case 'customer-payments':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Customer Payments</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Record and manage customer payments</p></div>;
      
      // Purchase & Supplier Management
      case 'purchase-invoices':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Purchase Invoices</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Process supplier invoices and bills</p></div>;
      case 'supplier-payments':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Supplier Payments</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Manage payments to suppliers</p></div>;
      case 'grn':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Goods Received Notes</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Record goods received from suppliers</p></div>;
      case 'reversegrn':
      case 'reverse-grn':
      case 'reverse-goods-received':
      case 'reversegoodsreceived':
        return <ReverseGoodsReceived />;
      
      // General Ledger
      case 'bank-accounts':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Bank Accounts</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Manage company bank accounts</p></div>;
      case 'bank-reconciliation':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Bank Reconciliation</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Reconcile bank statements</p></div>;
      case 'fixed-assets':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Fixed Assets</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Manage company fixed assets and depreciation</p></div>;
      
      // Inventory Management
      case 'stock-loc-movements':
      case 'stocklocmovements':
      case 'stock-location-movements':
      case 'stocklocationmovements':
      case 'all-inventory-movements-by-location-date':
      case 'allinventorymovementsbylocationdate':
        return <StockLocationMovements />;
      case 'stock-loc-status':
      case 'stocklocstatus':
      case 'stock-location-status':
      case 'stocklocationstatus':
      case 'list-inventory-status-by-location-category':
      case 'listinventorystatusbylocationcategory':
        return <StockLocationStatus />;
      case 'stock-movements':
      case 'stockmovements':
        return <StockMovements />;
      case 'stock-adjustments':
      case 'stockadjustments':
      case 'inventory-adjustments':
      case 'inventoryadjustments':
        return <StockAdjustments />;
      case 'pdfstockcheckcomparison':
      case 'stock-check-comparison':
      case 'stockcheckcomparison':
      case 'inventory-comparison-report':
      case 'inventorycomparisonreport':
        return <StockCheckComparison />;
      case 'stock-check':
      case 'stockcheck':
      case 'inventory-stock-check-sheets':
      case 'inventorystockchecksheets':
        return <StockCheck />;
      case 'stock-counts':
      case 'stockcounts':
      case 'enter-stock-counts':
      case 'enterstockcounts':
        return <StockCounts />;
      case 'stock-issue':
      case 'stockissue':
      case 'stock-issues':
      case 'stockissues':
      case 'enter-stock-issue':
      case 'enterstockissue':
        return <StockIssues />;
      case 'stockserialitemresearch':
      case 'stock-serial-item-research':
      case 'serial-item-research':
      case 'serialitemresearch':
        return <StockSerialItemResearch />;
      case 'stock-transfers':
      case 'stockloctransfer':
      case 'inventory-location-transfers':
      case 'bulk-inventory-transfer':
        return <InventoryTransfer />;
      case 'stockloctransferreceive':
      case 'bulk-inventory-transfer-receive':
        return <InventoryTransferReceive />;
      
      // Financial Reports
      case 'profit-loss':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Profit & Loss Statement</h2><p className="text-gray-600 dark:text-gray-400 mt-2">View company profit and loss reports</p></div>;
      case 'trial-balance':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Trial Balance</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Generate trial balance reports</p></div>;
      case 'cash-flow':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Cash Flow Statement</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Analyze company cash flow</p></div>;
      
      // Sales Reports
      case 'sales-analysis':
        return <SalesOrders mode="reports" sourceSlug="sales-analysis" />;
      case 'customer-statements':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Customer Statements</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Generate customer account statements</p></div>;
      case 'aged-debtors':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Aged Debtors Report</h2><p className="text-gray-600 dark:text-gray-400 mt-2">View outstanding customer balances by age</p></div>;
      
      // Purchase Reports
      case 'purchase-analysis':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Purchase Analysis</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Analyze purchase patterns and costs</p></div>;
      case 'aged-creditors':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Aged Creditors Report</h2><p className="text-gray-600 dark:text-gray-400 mt-2">View outstanding supplier balances by age</p></div>;
      case 'supplier-statements':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Supplier Statements</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Generate supplier account statements</p></div>;
      
      // Inventory Reports
      case 'stock-status':
        return <StockStatus />;
      case 'all-inventory-usage':
      case 'allinventoryusage':
      case 'all-stock-usage':
      case 'allstockusage':
        return <AllInventoryUsage />;
      case 'stockqties-csv':
      case 'stockqtiescsv':
      case 'stock-quantities-csv':
      case 'stockquantitiescsv':
        return <StockQuantitiesCsv />;
      case 'stockquantitybydate':
      case 'stock-quantity-by-date':
      case 'historical-stock-quantity':
      case 'historicalstockquantity':
      case 'historical-stock-quantity-by-location-category':
      case 'historicalstockquantitybylocationcategory':
        return <StockQuantityByDate />;
      case 'pdfstocknegatives':
      case 'stock-negatives':
      case 'stocknegatives':
      case 'negative-stock-listing':
      case 'negativestocklisting':
      case 'list-negative-stocks':
      case 'listnegativestocks':
        return <StockNegatives />;
      case 'pdfstocktranslisting':
      case 'pdfperiodstocktranslisting':
      case 'stock-transaction-listing':
      case 'stocktransactionlisting':
      case 'period-stock-transaction-listing':
      case 'periodstocktransactionlisting':
      case 'daily-stock-transaction-listing':
      case 'dailystocktransactionlisting':
        return <StockTransactionListing />;
      case 'inventory-quantities':
      case 'inventoryquantities':
        return <InventoryQuantities />;
      case 'inventory-valuation':
      case 'inventoryvaluation':
      case 'stock-valuation':
      case 'stockvaluation':
        return <InventoryValuation />;
      case 'inventory-planning':
      case 'inventoryplanning':
        return <InventoryPlanning />;
      case 'reorder-level':
      case 'reorderlevel':
        return <ReorderLevel />;
      case 'reorder-level-location':
      case 'reorderlevellocation':
        return <ReorderLevelLocation />;
      case 'stock-dispatch':
      case 'stockdispatch':
      case 'dispatch-stock-transfer':
      case 'dispatchstocktransfer':
        return <StockDispatch />;
      case 'stock-usage':
      case 'stockusage':
      case 'inventory-item-usage':
      case 'inventoryitemusage':
        return <StockUsage />;
      // System Setup
      case 'company-setup':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Company Setup</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Configure company information and settings</p></div>;
      case 'system-setup':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">System Setup</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Configure system parameters and preferences</p></div>;
      default:
        break;
    }

    return <Dashboard />;
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f2eeee] transition-colors duration-300 dark:bg-slate-950">
      {/* Desktop: Sidebar on left - Mobile: Header on top */}
      <div className="hidden lg:flex h-full">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <OfflineStatusBar />
          <main className="flex-1 overflow-auto bg-[#f2eeee] transition-colors duration-300 dark:bg-slate-950">
            {renderCurrentPage()}
          </main>
        </div>
      </div>
      
      {/* Mobile Layout: Header on top, content in middle, sidebar at bottom */}
      <div className="lg:hidden flex flex-col h-full">
        {/* Mobile Header - Simple version */}
        <MobileHeader />
        <OfflineStatusBar compact />
        
        {/* Main content area */}
        <main className="flex-1 overflow-auto bg-[#f2eeee] pb-20 transition-colors duration-300 dark:bg-slate-950 lg:pb-0">
          {renderCurrentPage()}
        </main>
        
        {/* Mobile Bottom Navigation Bar - Fixed at bottom */}
        <MobileNav />
      </div>
      
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && <MobileSidebarOverlay />}
    </div>
  );
}

function MobileHeader() {
  const { isDarkMode, toggleDarkMode, setMobileSidebarOpen } = useApp();
  
  return (
    <header className="flex-shrink-0 border-b border-white/70 bg-[#f2eeee]/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex items-center justify-between">
        {/* Left: Menu button and Logo */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setMobileSidebarOpen(true)}
            className="-ml-2 rounded-full bg-white/78 p-2 text-slate-600 shadow-sm shadow-slate-200/60 hover:bg-white dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 dark:bg-white">
              <span className="text-white dark:text-gray-900 font-bold text-sm">A</span>
            </div>
            <span className="text-sm font-semibold text-slate-950 dark:text-white">Akiva</span>
          </div>
        </div>
        
        {/* Right side actions */}
        <div className="flex items-center space-x-1">
          <button 
            onClick={toggleDarkMode}
            className="rounded-full bg-white/78 p-2 text-slate-600 shadow-sm shadow-slate-200/60 hover:bg-white dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800"
          >
            {isDarkMode ? (
              <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
          
          <button className="relative rounded-full bg-white/78 p-2 text-slate-600 shadow-sm shadow-slate-200/60 hover:bg-white dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 shadow-sm shadow-rose-600/20 dark:bg-rose-500">
            <span className="text-white text-xs font-medium">JD</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  const { currentPage, setCurrentPage, setMobileSidebarOpen } = useApp();
  
  const mobileNavItems = [
    { id: 'dashboard', icon: Home, label: 'Home' },
    { id: 'transactions', icon: ShoppingCart, label: 'Trans' },
    { id: 'inquiries', icon: BarChart3, label: 'Reports' },
    { id: 'maintenance', icon: Settings, label: 'Setup' },
    { id: 'starred', icon: Star, label: 'Starred' },
    { id: 'recent', icon: Clock, label: 'Recent' },
  ];
  
  const handleNavClick = (itemId: string) => {
    if (itemId === 'dashboard') {
      setCurrentPage('dashboard');
      setMobileSidebarOpen(false);
      return;
    }

    setMobileSidebarOpen(true);
  };
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex-shrink-0 border-t border-white/70 bg-[#f2eeee]/95 px-2 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex items-center justify-around">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`flex flex-col items-center justify-center min-w-[50px] h-12 px-1 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-white text-rose-600 shadow-sm shadow-slate-200/60 dark:bg-slate-900 dark:text-rose-300 dark:shadow-black/20'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[9px] font-medium truncate mt-0.5">{item.label}</span>
            </button>
          );
        })}
        
        {/* More menu button */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="flex h-12 min-w-[50px] flex-col items-center justify-center rounded-lg px-1 text-slate-500 transition-all duration-200 dark:text-slate-400"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[9px] font-medium mt-0.5">More</span>
        </button>
      </div>
    </nav>
  );
}

function MobileSidebarOverlay() {
  const { mobileSidebarOpen, setMobileSidebarOpen, currentPage, setCurrentPage, appMenu } = useApp();

  const visibleMenus = appMenu.filter((node) => !isHiddenMobileMenuNode(node));

  const navigateTo = (pageId: string) => {
    setCurrentPage(pageId);
    setMobileSidebarOpen(false);
  };

  const renderMenuNode = (node: MenuNode, depth = 0): JSX.Element | null => {
    if (isHiddenMobileMenuNode(node)) return null;

    const children = (node.children ?? []).filter((child) => !isHiddenMobileMenuNode(child as MenuNode)) as MenuNode[];
    const hasChildren = children.length > 0;
    const pageId = hasChildren ? `main-${node.id}` : menuNodePageId(node);
    const isActive = currentPage === pageId;
    const nodeLabel = menuDisplayCaption(node.caption, node.href);
    const NodeIcon = getMobileMenuIcon(node, hasChildren);

    if (!hasChildren) {
      return (
        <button
          key={node.id}
          type="button"
          onClick={() => navigateTo(pageId)}
          className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
            isActive
              ? 'bg-white text-rose-700 shadow-sm dark:bg-slate-900 dark:text-rose-300'
              : 'text-slate-600 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-slate-900'
          }`}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <NodeIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate text-sm font-medium leading-snug">{nodeLabel}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </button>
      );
    }

    return (
      <details key={node.id} className="group rounded-lg" open={depth === 0 && isConfigurationMenuCaption(node.caption)}>
        <summary
          className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors [&::-webkit-details-marker]:hidden ${
            isActive
              ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
              : 'text-slate-700 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-900'
          }`}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <NodeIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate text-sm font-semibold leading-snug">{nodeLabel}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-1 space-y-1">
          <button
            type="button"
            onClick={() => navigateTo(pageId)}
            className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
              isActive
                ? 'bg-white text-rose-700 shadow-sm dark:bg-slate-900 dark:text-rose-300'
                : 'text-slate-500 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-slate-900'
            }`}
            style={{ paddingLeft: `${24 + depth * 12}px` }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <FileSearch className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate text-sm leading-snug">Open {nodeLabel}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </button>
          {children.map((child) => renderMenuNode(child, depth + 1))}
        </div>
      </details>
    );
  };
  
  if (!mobileSidebarOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={() => setMobileSidebarOpen(false)}
      />
      
      {/* Sidebar Panel */}
      <div 
        className="absolute bottom-0 left-0 top-0 w-80 max-w-[85vw] overflow-y-auto bg-[#f7f4f4] shadow-xl dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/70 px-4 py-4 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 dark:bg-white">
              <span className="text-white dark:text-gray-900 font-bold text-lg">A</span>
            </div>
            <span className="font-semibold text-slate-950 dark:text-white">Akiva</span>
          </div>
          <button 
            onClick={() => setMobileSidebarOpen(false)}
            className="rounded-full bg-white/78 p-2 text-slate-600 shadow-sm hover:bg-white dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Navigation Sections */}
        <nav className="p-4 space-y-2">
          <button
            onClick={() => navigateTo('dashboard')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
              currentPage === 'dashboard'
                ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
                : 'text-slate-700 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Home className="w-5 h-5" />
              <span className="font-medium">Dashboard</span>
            </div>
          </button>

          <div className="space-y-1">
            {visibleMenus.length > 0 ? visibleMenus.map((node) => renderMenuNode(node)) : (
              <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">No modules available.</p>
            )}
          </div>

          <button
            onClick={() => navigateTo('starred')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              currentPage === 'starred'
                ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
                : 'text-slate-700 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-900'
            }`}
          >
            <Star className="w-5 h-5" />
            <span className="font-medium">Starred</span>
          </button>

          <button
            onClick={() => navigateTo('recent')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              currentPage === 'recent'
                ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
                : 'text-slate-700 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-900'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span className="font-medium">Recent</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <div className="h-screen bg-[#f2eeee] transition-colors duration-300 dark:bg-slate-950">
        <AppContent />
      </div>
    </AppProvider>
  );
}

export default App;
