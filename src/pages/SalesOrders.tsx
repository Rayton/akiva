import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, Search, Wifi, WifiOff } from 'lucide-react';
import {
  cancelSalesContract,
  createSalesOrderOnline,
  createSalesContract,
  fetchOnlineSalesOrders,
  fetchSalesContractDetail,
  fetchSalesContractLookups,
  fetchSalesContracts,
  fetchOutstandingSalesOrders,
  fetchPickingListCandidates,
  fetchRecurringTemplates,
  fetchSalesCustomers,
  fetchSalesDailyInquiry,
  fetchSalesItems,
  fetchSalesLowGrossReport,
  fetchSalesOrderStatus,
  fetchSalesPriceList,
  fetchSalesReportSummary,
  fetchSalesSettings,
  fetchSalesTopItems,
  fetchSalesTransactions,
  processRecurringOrders,
  quoteSalesContract,
  updateSalesContract,
} from '../data/salesApi';
import {
  createSalesOrderDraft,
  listSalesOrders,
  upsertOrdersFromWebErp,
} from '../lib/offline/salesRepository';
import { startSalesSync } from '../lib/offline/salesSync';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { SearchableSelect } from '../components/common/SearchableSelect';
import {
  SalesCustomer,
  SalesContractDetail,
  SalesContractLookups,
  SalesContractPayload,
  SalesContractSummary,
  SalesDailySalesRow,
  SalesLowGrossRow,
  SalesOrderLineInput,
  SalesOrderListItem,
  SalesOrderStatusRow,
  SalesOutstandingOrder,
  SalesPickingCandidate,
  SalesPriceListItem,
  SalesRecurringTemplate,
  SalesReportSummary,
  SalesSettings,
  SalesStockItem,
  SalesTopItem,
  SalesTransaction,
} from '../types/sales';

const COUCHDB_SALES_URL = import.meta.env.VITE_COUCHDB_SALES_URL;
const COUCHDB_USERNAME = import.meta.env.VITE_COUCHDB_USERNAME;
const COUCHDB_PASSWORD = import.meta.env.VITE_COUCHDB_PASSWORD;

type SyncVisualState = 'idle' | 'active' | 'paused' | 'error';
export type SalesModuleMode = 'transactions' | 'reports' | 'settings';

type SalesDrawerKey =
  | 'enter-order'
  | 'counter-sales'
  | 'print-picking-lists'
  | 'outstanding-sales-orders'
  | 'special-order'
  | 'recurring-order-template'
  | 'process-recurring-orders'
  | 'order-inquiry'
  | 'print-price-lists'
  | 'order-status-report'
  | 'orders-invoiced-reports'
  | 'daily-sales-inquiry'
  | 'order-delivery-differences-report'
  | 'difot-report'
  | 'sales-order-detail-summary'
  | 'top-sales-items-report'
  | 'sales-with-low-gross-profit-report'
  | 'select-contract'
  | 'create-contract';

interface SalesOrdersProps {
  mode?: SalesModuleMode;
  sourceSlug?: string;
}

interface DraftFormState {
  debtorNo: string;
  customerName: string;
  customerRef: string;
  grossTotal: string;
}

interface CreateOrderFormState {
  customerKey: string;
  customerRef: string;
  buyerName: string;
  orderType: string;
  stockId: string;
  quantity: string;
  unitPrice: string;
}

interface ContractFormState {
  contractRef: string;
  contractDescription: string;
  debtorNo: string;
  branchCode: string;
  categoryId: string;
  locationCode: string;
  requiredDate: string;
  margin: string;
  customerRef: string;
  exchangeRate: string;
  defaultWorkCentre: string;
}

interface ContractBomDraftLine {
  stockId: string;
  workCentreCode: string;
  quantity: string;
}

interface ContractRequirementDraftLine {
  requirement: string;
  quantity: string;
  costPerUnit: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function statusLabel(order: SalesOrderListItem): string {
  if (order.syncState === 'pending') return 'Pending Sync';
  if (order.source === 'local-draft') return 'Draft';
  return 'Synced';
}

function defaultRequiredDate(): string {
  const today = new Date();
  today.setDate(today.getDate() + 30);
  return today.toISOString().slice(0, 10);
}

function newContractFormState(): ContractFormState {
  return {
    contractRef: '',
    contractDescription: '',
    debtorNo: '',
    branchCode: '',
    categoryId: '',
    locationCode: '',
    requiredDate: defaultRequiredDate(),
    margin: '50',
    customerRef: '',
    exchangeRate: '1',
    defaultWorkCentre: '',
  };
}

function normalizeSalesSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveSalesDrawerKey(slug: string): SalesDrawerKey | null {
  const key = normalizeSalesSlug(slug);
  if (!key) return null;

  if (key.includes('selectorderitems')) return 'enter-order';
  if (key.includes('countersales')) return 'counter-sales';
  if (key.includes('pdfpickinglist')) return 'print-picking-lists';
  if (key.includes('selectsalesorder')) return 'outstanding-sales-orders';
  if (key.includes('specialorder')) return 'special-order';
  if (key.includes('selectrecurringsalesorder')) return 'recurring-order-template';
  if (key.includes('recurringsalesordersprocess')) return 'process-recurring-orders';

  if (key.includes('selectcompletedorder')) return 'order-inquiry';
  if (key.includes('pdfpricelist')) return 'print-price-lists';
  if (key.includes('pdforderstatus')) return 'order-status-report';
  if (key.includes('pdfordersinvoiced')) return 'orders-invoiced-reports';
  if (key.includes('dailysalesinquiry')) return 'daily-sales-inquiry';
  if (key.includes('pdfdeliverydifferences')) return 'order-delivery-differences-report';
  if (key.includes('pdfdifot')) return 'difot-report';
  if (key.includes('salesinquiry')) return 'sales-order-detail-summary';
  if (key.includes('topitems')) return 'top-sales-items-report';
  if (key.includes('pdflowgp')) return 'sales-with-low-gross-profit-report';

  if (key.includes('selectcontract')) return 'select-contract';
  if (key.includes('contracts')) return 'create-contract';

  return null;
}

function drawerMeta(drawerKey: SalesDrawerKey): { title: string; subtitle: string } {
  switch (drawerKey) {
    case 'enter-order':
      return { title: 'Enter Order or Quotation', subtitle: 'Create and submit sales orders in one compact flow.' };
    case 'counter-sales':
      return { title: 'Counter Sales', subtitle: 'Fast point-of-sale style entry for immediate customer sales.' };
    case 'print-picking-lists':
      return { title: 'Print Picking Lists', subtitle: 'Orders with open quantities ready for picking.' };
    case 'outstanding-sales-orders':
      return { title: 'Outstanding Sales Orders/Quotations', subtitle: 'Track open lines and outstanding quantity.' };
    case 'special-order':
      return { title: 'Special Order', subtitle: 'Create non-standard or exception sales orders.' };
    case 'recurring-order-template':
      return { title: 'Recurring Order Template', subtitle: 'Review recurring sales templates and schedules.' };
    case 'process-recurring-orders':
      return { title: 'Process Recurring Orders', subtitle: 'Generate due sales orders from templates.' };
    case 'order-inquiry':
      return { title: 'Order Inquiry', subtitle: 'Inquiry view for currently open sales orders.' };
    case 'print-price-lists':
      return { title: 'Print Price Lists', subtitle: 'Current active price list by stock item and sales type.' };
    case 'order-status-report':
      return { title: 'Order Status Report', subtitle: 'Order completion progress and value summary.' };
    case 'orders-invoiced-reports':
      return { title: 'Orders Invoiced Reports', subtitle: 'Customer transaction history with invoice totals.' };
    case 'daily-sales-inquiry':
      return { title: 'Daily Sales Inquiry', subtitle: 'Daily invoiced totals over the recent period.' };
    case 'order-delivery-differences-report':
      return { title: 'Order Delivery Differences Report', subtitle: 'Late or pending deliveries requiring attention.' };
    case 'difot-report':
      return { title: 'DIFOT Report', subtitle: 'Delivery-In-Full-On-Time operational snapshot.' };
    case 'sales-order-detail-summary':
      return { title: 'Sales Order Detail/Summary Inquiry', subtitle: 'Line completion and gross totals by order.' };
    case 'top-sales-items-report':
      return { title: 'Top Sales Items Report', subtitle: 'Highest performing items by sales value.' };
    case 'sales-with-low-gross-profit-report':
      return { title: 'Sales With Low Gross Profit Report', subtitle: 'Potential low-margin issues requiring follow-up.' };
    case 'select-contract':
      return { title: 'Select Contract', subtitle: 'Contract maintenance entry point.' };
    case 'create-contract':
      return { title: 'Create Contract', subtitle: 'Contract creation workflow.' };
  }
}

function drawerSupportsSearch(drawerKey: SalesDrawerKey): boolean {
  return ![
    'daily-sales-inquiry',
    'top-sales-items-report',
    'sales-with-low-gross-profit-report',
    'process-recurring-orders',
    'create-contract',
  ].includes(drawerKey);
}

function isInquiriesOrReportsKey(drawerKey: SalesDrawerKey | null): boolean {
  if (!drawerKey) return false;
  return [
    'order-inquiry',
    'print-price-lists',
    'order-status-report',
    'orders-invoiced-reports',
    'daily-sales-inquiry',
    'order-delivery-differences-report',
    'difot-report',
    'sales-order-detail-summary',
    'top-sales-items-report',
    'sales-with-low-gross-profit-report',
  ].includes(drawerKey);
}

export function SalesOrders({ mode = 'transactions', sourceSlug = '' }: SalesOrdersProps) {
  const [orders, setOrders] = useState<SalesOrderListItem[]>([]);
  const [transactions, setTransactions] = useState<SalesTransaction[]>([]);
  const [reportSummary, setReportSummary] = useState<SalesReportSummary | null>(null);
  const [settings, setSettings] = useState<SalesSettings | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [syncState, setSyncState] = useState<SyncVisualState>('idle');
  const [pendingSync, setPendingSync] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [form, setForm] = useState<DraftFormState>({
    debtorNo: '',
    customerName: '',
    customerRef: '',
    grossTotal: '',
  });

  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [drawerError, setDrawerError] = useState('');
  const [drawerMessage, setDrawerMessage] = useState('');

  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [stockItems, setStockItems] = useState<SalesStockItem[]>([]);
  const [pendingOrderLines, setPendingOrderLines] = useState<SalesOrderLineInput[]>([]);
  const [createOrderForm, setCreateOrderForm] = useState<CreateOrderFormState>({
    customerKey: '',
    customerRef: '',
    buyerName: '',
    orderType: 'RE',
    stockId: '',
    quantity: '1',
    unitPrice: '',
  });

  const [outstandingOrders, setOutstandingOrders] = useState<SalesOutstandingOrder[]>([]);
  const [pickingCandidates, setPickingCandidates] = useState<SalesPickingCandidate[]>([]);
  const [recurringTemplates, setRecurringTemplates] = useState<SalesRecurringTemplate[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);

  const [priceListItems, setPriceListItems] = useState<SalesPriceListItem[]>([]);
  const [orderStatusRows, setOrderStatusRows] = useState<SalesOrderStatusRow[]>([]);
  const [dailySalesRows, setDailySalesRows] = useState<SalesDailySalesRow[]>([]);
  const [topItems, setTopItems] = useState<SalesTopItem[]>([]);
  const [lowGrossRows, setLowGrossRows] = useState<SalesLowGrossRow[]>([]);
  const [invoicedTransactions, setInvoicedTransactions] = useState<SalesTransaction[]>([]);
  const [contractLookups, setContractLookups] = useState<SalesContractLookups | null>(null);
  const [contractRows, setContractRows] = useState<SalesContractSummary[]>([]);
  const [contractStatusFilter, setContractStatusFilter] = useState('4');
  const [selectedContractRef, setSelectedContractRef] = useState('');
  const [contractForm, setContractForm] = useState<ContractFormState>(() => newContractFormState());
  const [contractBomLines, setContractBomLines] = useState<ContractBomDraftLine[]>([]);
  const [contractRequirementLines, setContractRequirementLines] = useState<ContractRequirementDraftLine[]>([]);

  const drawerKey = useMemo(() => resolveSalesDrawerKey(sourceSlug), [sourceSlug]);
  const drawerDetails = drawerKey ? drawerMeta(drawerKey) : null;
  const reportTemplateRoute = isInquiriesOrReportsKey(drawerKey);
  const routeTemplateRoute = Boolean(drawerKey && drawerDetails && (mode !== 'reports' || reportTemplateRoute));

  const selectedCustomer = useMemo(() => {
    if (!createOrderForm.customerKey) return null;
    return (
      customers.find(
        (customer) => `${customer.debtorNo}::${customer.branchCode}` === createOrderForm.customerKey
      ) ?? null
    );
  }, [createOrderForm.customerKey, customers]);

  const selectedItem = useMemo(() => {
    if (!createOrderForm.stockId) return null;
    return stockItems.find((item) => item.stockId === createOrderForm.stockId) ?? null;
  }, [createOrderForm.stockId, stockItems]);

  const selectedContractCustomer = useMemo(() => {
    if (!contractLookups) return null;
    return (
      contractLookups.customers.find(
        (row) => row.debtorNo === contractForm.debtorNo && row.branchCode === contractForm.branchCode
      ) ?? null
    );
  }, [contractForm.branchCode, contractForm.debtorNo, contractLookups]);

  const workCentresForLocation = useMemo(() => {
    if (!contractLookups || !contractForm.locationCode) return [];
    return contractLookups.workCentres.filter((row) => row.locationCode === contractForm.locationCode);
  }, [contractForm.locationCode, contractLookups]);

  const reloadOrders = useCallback(async (term = '') => {
    const rows = await listSalesOrders(term);
    setOrders(rows);
  }, []);

  const reloadTransactions = useCallback(async (term = '') => {
    const rows = await fetchSalesTransactions(250, term);
    setTransactions(rows);
  }, []);

  const bootstrapFromWebErp = useCallback(async () => {
    if (!navigator.onLine) return;
    const onlineRows = await fetchOnlineSalesOrders();
    if (onlineRows.length === 0) return;
    await upsertOrdersFromWebErp(onlineRows);
    await reloadOrders('');
  }, [reloadOrders]);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        if (mode === 'transactions') {
          await Promise.all([reloadOrders(''), reloadTransactions('')]);
          await bootstrapFromWebErp();
        } else if (mode === 'reports') {
          const summary = await fetchSalesReportSummary();
          if (mounted) setReportSummary(summary);
        } else {
          const settingsData = await fetchSalesSettings();
          if (mounted) setSettings(settingsData);
        }
      } catch (error) {
        if (mounted) setErrorMessage(String(error));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    const goOnline = () => {
      setIsOnline(true);
      if (mode === 'transactions') {
        bootstrapFromWebErp().catch((error) => setErrorMessage(String(error)));
      }
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      mounted = false;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [bootstrapFromWebErp, mode, reloadOrders, reloadTransactions]);

  useEffect(() => {
    if (mode !== 'transactions') return;
    reloadOrders(searchTerm).catch((error) => setErrorMessage(String(error)));
    reloadTransactions(searchTerm).catch((error) => setErrorMessage(String(error)));
  }, [mode, reloadOrders, reloadTransactions, searchTerm]);

  useEffect(() => {
    if (mode !== 'transactions' || !COUCHDB_SALES_URL) return;

    const controller = startSalesSync(
      {
        remoteUrl: COUCHDB_SALES_URL,
        username: COUCHDB_USERNAME,
        password: COUCHDB_PASSWORD,
      },
      {
        onActive: () => setSyncState('active'),
        onPaused: () => setSyncState('paused'),
        onChange: (pending) => {
          setPendingSync(pending);
          reloadOrders(searchTerm).catch((error) => setErrorMessage(String(error)));
        },
        onError: (message) => {
          setSyncState('error');
          setErrorMessage(message);
        },
      }
    );

    return () => controller.stop();
  }, [mode, reloadOrders, searchTerm]);

  useEffect(() => {
    setDrawerSearch('');
    setDrawerError('');
    setDrawerMessage('');
  }, [drawerKey]);

  const resetContractEditor = useCallback(() => {
    setSelectedContractRef('');
    setContractForm(newContractFormState());
    setContractBomLines([]);
    setContractRequirementLines([]);
  }, []);

  const applyContractLookupsDefaults = useCallback((lookups: SalesContractLookups) => {
    setContractForm((previous) => {
      if (selectedContractRef) return previous;
      const firstCustomer = lookups.customers[0];
      const firstCategory = lookups.categories[0];
      const firstLocation = lookups.locations[0];
      return {
        ...previous,
        debtorNo: previous.debtorNo || firstCustomer?.debtorNo || '',
        branchCode: previous.branchCode || firstCustomer?.branchCode || '',
        categoryId: previous.categoryId || firstCategory?.categoryId || '',
        locationCode:
          previous.locationCode || firstCustomer?.defaultLocation || firstLocation?.locationCode || '',
        exchangeRate: previous.exchangeRate || '1',
      };
    });
  }, [selectedContractRef]);

  const hydrateContractEditor = useCallback((detail: SalesContractDetail) => {
    setSelectedContractRef(detail.contractRef);
    setContractForm({
      contractRef: detail.contractRef,
      contractDescription: detail.contractDescription,
      debtorNo: detail.debtorNo,
      branchCode: detail.branchCode,
      categoryId: detail.categoryId,
      locationCode: detail.locationCode,
      requiredDate: detail.requiredDate,
      margin: String(detail.margin),
      customerRef: detail.customerRef,
      exchangeRate: String(detail.exchangeRate || 1),
      defaultWorkCentre: detail.bomLines[0]?.workCentreCode ?? '',
    });
    setContractBomLines(
      detail.bomLines.map((line) => ({
        stockId: line.stockId,
        workCentreCode: line.workCentreCode || '',
        quantity: String(line.quantity),
      }))
    );
    setContractRequirementLines(
      detail.requirementLines.map((line) => ({
        requirement: line.requirement,
        quantity: String(line.quantity),
        costPerUnit: String(line.costPerUnit),
      }))
    );
  }, []);

  const openContractForEdit = useCallback(async (contractRef: string) => {
    setDrawerLoading(true);
    setDrawerError('');
    setDrawerMessage('');

    try {
      const detail = await fetchSalesContractDetail(contractRef);
      if (!detail) {
        setDrawerError('Failed to load contract details.');
        return;
      }
      hydrateContractEditor(detail);
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [hydrateContractEditor]);

  const reloadDrawerData = useCallback(async () => {
    if (!drawerKey) return;

    setDrawerLoading(true);
    setDrawerError('');

    try {
      switch (drawerKey) {
        case 'enter-order':
        case 'counter-sales':
        case 'special-order': {
          const [customerRows, itemRows] = await Promise.all([
            fetchSalesCustomers(drawerSearch),
            fetchSalesItems(drawerSearch),
          ]);
          setCustomers(customerRows);
          setStockItems(itemRows);
          break;
        }

        case 'outstanding-sales-orders':
        case 'order-inquiry':
        case 'order-delivery-differences-report': {
          const rows = await fetchOutstandingSalesOrders(drawerSearch);
          setOutstandingOrders(rows);
          break;
        }

        case 'print-picking-lists': {
          const rows = await fetchPickingListCandidates(drawerSearch);
          setPickingCandidates(rows);
          break;
        }

        case 'recurring-order-template':
        case 'process-recurring-orders': {
          const rows = await fetchRecurringTemplates(drawerSearch);
          setRecurringTemplates(rows);
          break;
        }

        case 'print-price-lists': {
          const rows = await fetchSalesPriceList(300);
          setPriceListItems(rows);
          break;
        }

        case 'order-status-report':
        case 'sales-order-detail-summary':
        case 'difot-report': {
          const rows = await fetchSalesOrderStatus(drawerSearch);
          setOrderStatusRows(rows);
          break;
        }

        case 'orders-invoiced-reports': {
          const rows = await fetchSalesTransactions(180, drawerSearch);
          setInvoicedTransactions(rows.filter((row) => row.transType === 10));
          break;
        }

        case 'daily-sales-inquiry': {
          const rows = await fetchSalesDailyInquiry(45);
          setDailySalesRows(rows);
          break;
        }

        case 'top-sales-items-report': {
          const rows = await fetchSalesTopItems(30);
          setTopItems(rows);
          break;
        }

        case 'sales-with-low-gross-profit-report': {
          const rows = await fetchSalesLowGrossReport(30);
          setLowGrossRows(rows);
          break;
        }

        case 'select-contract':
        case 'create-contract': {
          const lookups = await fetchSalesContractLookups();
          if (!lookups) {
            setDrawerError('Failed to load contract lookups.');
            break;
          }
          setContractLookups(lookups);
          applyContractLookupsDefaults(lookups);

          if (drawerKey === 'select-contract') {
            const rows = await fetchSalesContracts({
              q: drawerSearch,
              status: Number(contractStatusFilter),
              limit: 220,
            });
            setContractRows(rows);
          }
          break;
        }
      }
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [applyContractLookupsDefaults, contractStatusFilter, drawerKey, drawerSearch]);

  useEffect(() => {
    if (!drawerKey) return;
    reloadDrawerData().catch((error) => setDrawerError(String(error)));
  }, [drawerKey, reloadDrawerData]);

  useEffect(() => {
    if (drawerKey !== 'create-contract') return;
    resetContractEditor();
  }, [drawerKey, resetContractEditor]);

  useEffect(() => {
    if (!selectedContractCustomer || selectedContractRef) return;
    setContractForm((previous) => ({
      ...previous,
      locationCode: previous.locationCode || selectedContractCustomer.defaultLocation || '',
      exchangeRate: previous.exchangeRate || '1',
    }));
  }, [selectedContractCustomer, selectedContractRef]);

  useEffect(() => {
    if (workCentresForLocation.length === 0) return;
    setContractForm((previous) => {
      if (previous.defaultWorkCentre) return previous;
      return {
        ...previous,
        defaultWorkCentre: workCentresForLocation[0].workCentreCode,
      };
    });
  }, [workCentresForLocation]);

  useEffect(() => {
    if (!selectedItem) return;
    if (createOrderForm.unitPrice.trim() !== '') return;
    setCreateOrderForm((previous) => ({
      ...previous,
      unitPrice: selectedItem.price > 0 ? String(selectedItem.price) : '',
    }));
  }, [createOrderForm.unitPrice, selectedItem]);

  const metrics = useMemo(() => {
    const totalAmount = orders.reduce((sum, row) => sum + row.grossTotal, 0);
    const pendingDrafts = orders.filter((row) => row.syncState === 'pending').length;
    return {
      orderCount: orders.length,
      totalAmount,
      pendingDrafts,
    };
  }, [orders]);

  const submitDraft = async () => {
    const gross = Number(form.grossTotal);
    if (!form.customerName.trim() || Number.isNaN(gross) || gross <= 0) {
      setErrorMessage('Customer name and amount are required.');
      return;
    }

    await createSalesOrderDraft({
      debtorNo: form.debtorNo,
      customerName: form.customerName,
      customerRef: form.customerRef,
      grossTotal: gross,
    });

    setForm({ debtorNo: '', customerName: '', customerRef: '', grossTotal: '' });
    await reloadOrders(searchTerm);
  };

  const addOrderLine = useCallback(() => {
    if (!selectedItem) {
      setDrawerError('Select a stock item first.');
      return;
    }

    const quantity = Number(createOrderForm.quantity);
    const unitPrice = Number(createOrderForm.unitPrice || selectedItem.price);

    if (Number.isNaN(quantity) || quantity <= 0) {
      setDrawerError('Quantity must be greater than zero.');
      return;
    }

    if (Number.isNaN(unitPrice) || unitPrice < 0) {
      setDrawerError('Unit price is invalid.');
      return;
    }

    const line: SalesOrderLineInput = {
      stockId: selectedItem.stockId,
      quantity,
      unitPrice,
      discountPercent: 0,
      narrative: '',
    };

    setPendingOrderLines((previous) => [...previous, line]);
    setDrawerError('');
    setCreateOrderForm((previous) => ({
      ...previous,
      stockId: '',
      quantity: '1',
      unitPrice: '',
    }));
  }, [createOrderForm.quantity, createOrderForm.unitPrice, selectedItem]);

  const submitOnlineOrder = useCallback(async () => {
    if (!selectedCustomer) {
      setDrawerError('Select a customer branch first.');
      return;
    }

    if (pendingOrderLines.length === 0) {
      setDrawerError('Add at least one order line.');
      return;
    }

    setDrawerLoading(true);
    setDrawerError('');

    try {
      const result = await createSalesOrderOnline({
        debtorNo: selectedCustomer.debtorNo,
        branchCode: selectedCustomer.branchCode,
        customerRef: createOrderForm.customerRef,
        buyerName: createOrderForm.buyerName,
        orderType: createOrderForm.orderType || selectedCustomer.salesType || 'RE',
        shipVia: selectedCustomer.defaultShipperId || undefined,
        fromStockLoc: selectedCustomer.defaultLocation || undefined,
        lines: pendingOrderLines,
      });

      if (!result) {
        setDrawerError('Failed to create sales order.');
        return;
      }

      setDrawerMessage(`Sales order ${result.orderNo} created successfully.`);
      setPendingOrderLines([]);
      await Promise.all([reloadOrders(searchTerm), reloadTransactions(searchTerm), reloadDrawerData()]);
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [
    createOrderForm.buyerName,
    createOrderForm.customerRef,
    createOrderForm.orderType,
    pendingOrderLines,
    reloadDrawerData,
    reloadOrders,
    reloadTransactions,
    searchTerm,
    selectedCustomer,
  ]);

  const toggleTemplate = useCallback((templateId: number) => {
    setSelectedTemplateIds((previous) =>
      previous.includes(templateId)
        ? previous.filter((id) => id !== templateId)
        : [...previous, templateId]
    );
  }, []);

  const runRecurring = useCallback(async () => {
    setDrawerLoading(true);
    setDrawerError('');

    try {
      const result = await processRecurringOrders(selectedTemplateIds);
      if (!result) {
        setDrawerError('Recurring order processing failed.');
        return;
      }

      const createdCount = result.createdOrders.length;
      const skippedCount = result.skippedTemplates.length;
      setDrawerMessage(`Processed templates. Created: ${createdCount}, skipped: ${skippedCount}.`);
      setSelectedTemplateIds([]);
      await Promise.all([reloadOrders(searchTerm), reloadTransactions(searchTerm), reloadDrawerData()]);
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [reloadDrawerData, reloadOrders, reloadTransactions, searchTerm, selectedTemplateIds]);

  const addContractBomLine = useCallback(() => {
    setContractBomLines((previous) => [...previous, { stockId: '', workCentreCode: '', quantity: '1' }]);
  }, []);

  const removeContractBomLine = useCallback((index: number) => {
    setContractBomLines((previous) => previous.filter((_, i) => i !== index));
  }, []);

  const addContractRequirementLine = useCallback(() => {
    setContractRequirementLines((previous) => [
      ...previous,
      { requirement: '', quantity: '1', costPerUnit: '0' },
    ]);
  }, []);

  const removeContractRequirementLine = useCallback((index: number) => {
    setContractRequirementLines((previous) => previous.filter((_, i) => i !== index));
  }, []);

  const saveContract = useCallback(async () => {
    if (!contractForm.contractRef.trim() && !selectedContractRef) {
      setDrawerError('Contract reference is required.');
      return;
    }

    if (!contractForm.contractDescription.trim()) {
      setDrawerError('Contract description is required.');
      return;
    }

    if (!contractForm.debtorNo || !contractForm.branchCode) {
      setDrawerError('Customer and branch are required.');
      return;
    }

    setDrawerLoading(true);
    setDrawerError('');

    const payload: SalesContractPayload = {
      contractRef: selectedContractRef || contractForm.contractRef.trim(),
      contractDescription: contractForm.contractDescription.trim(),
      debtorNo: contractForm.debtorNo,
      branchCode: contractForm.branchCode,
      categoryId: contractForm.categoryId,
      locationCode: contractForm.locationCode,
      requiredDate: contractForm.requiredDate,
      margin: Number(contractForm.margin || '0'),
      customerRef: contractForm.customerRef,
      exchangeRate: Number(contractForm.exchangeRate || '1'),
      defaultWorkCentre: contractForm.defaultWorkCentre,
      bomLines: contractBomLines
        .filter((line) => line.stockId.trim() !== '')
        .map((line) => ({
          stockId: line.stockId.trim(),
          workCentreCode: line.workCentreCode.trim(),
          quantity: Number(line.quantity || '0'),
        })),
      requirementLines: contractRequirementLines
        .filter((line) => line.requirement.trim() !== '')
        .map((line) => ({
          requirement: line.requirement.trim(),
          quantity: Number(line.quantity || '0'),
          costPerUnit: Number(line.costPerUnit || '0'),
        })),
    };

    try {
      let result: SalesContractDetail | null = null;
      if (selectedContractRef) {
        const { contractRef: _unusedRef, ...updatePayload } = payload;
        result = await updateSalesContract(selectedContractRef, updatePayload);
      } else {
        result = await createSalesContract(payload);
      }

      if (!result) {
        setDrawerError('Failed to save contract.');
        return;
      }

      hydrateContractEditor(result);
      setDrawerMessage(
        selectedContractRef
          ? `Contract ${result.contractRef} updated successfully.`
          : `Contract ${result.contractRef} created successfully.`
      );
      await reloadDrawerData();
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [
    contractBomLines,
    contractForm,
    contractRequirementLines,
    hydrateContractEditor,
    reloadDrawerData,
    selectedContractRef,
  ]);

  const quoteContractByRef = useCallback(async (contractRef: string) => {
    setDrawerLoading(true);
    setDrawerError('');
    try {
      const result = await quoteSalesContract(contractRef);
      if (!result) {
        setDrawerError('Failed to create contract quotation.');
        return;
      }

      setDrawerMessage(
        result.alreadyQuoted
          ? `Contract already quoted as order ${result.orderNo}.`
          : `Quotation created successfully. Order No: ${result.orderNo}.`
      );
      await Promise.all([reloadDrawerData(), openContractForEdit(contractRef)]);
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [openContractForEdit, reloadDrawerData]);

  const createContractQuotationNow = useCallback(async () => {
    if (!selectedContractRef) {
      setDrawerError('Save a contract first, then create quotation.');
      return;
    }
    await quoteContractByRef(selectedContractRef);
  }, [quoteContractByRef, selectedContractRef]);

  const cancelCurrentContract = useCallback(async () => {
    if (!selectedContractRef) {
      setDrawerError('Select a contract first.');
      return;
    }

    const confirmed = window.confirm(`Cancel contract ${selectedContractRef}?`);
    if (!confirmed) return;

    setDrawerLoading(true);
    setDrawerError('');
    try {
      const ok = await cancelSalesContract(selectedContractRef);
      if (!ok) {
        setDrawerError('Failed to cancel contract.');
        return;
      }
      setDrawerMessage(`Contract ${selectedContractRef} cancelled.`);
      resetContractEditor();
      await reloadDrawerData();
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [reloadDrawerData, resetContractEditor, selectedContractRef]);

  const modeTitle =
    mode === 'transactions' ? 'Sales Transactions' : mode === 'reports' ? 'Sales Reports' : 'Sales Settings';

  const difotSnapshot = useMemo(() => {
    const total = orderStatusRows.length;
    if (total === 0) {
      return { total: 0, fullOnTime: 0, fullOnTimePct: 0 };
    }

    const fullOnTime = orderStatusRows.filter((row) => row.completedLines >= row.lineCount).length;
    return {
      total,
      fullOnTime,
      fullOnTimePct: Number(((fullOnTime / total) * 100).toFixed(2)),
    };
  }, [orderStatusRows]);

  const renderAdvancedTable = <T,>(
    tableId: string,
    columns: AdvancedTableColumn<T>[],
    rows: T[],
    emptyMessage: string,
    loadingState = false,
    loadingText = 'Loading...'
  ) => (
    <AdvancedTable<T>
      tableId={tableId}
      columns={columns}
      rows={rows}
      emptyMessage={emptyMessage}
      loading={loadingState}
      loadingMessage={loadingText}
      initialPageSize={25}
    />
  );

  const renderDrawerContent = () => {
    if (!drawerKey) return null;

    if (drawerLoading) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-sm text-brand-700 dark:border-brand-900/60 dark:bg-brand-900/20 dark:text-brand-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading module data...
        </div>
      );
    }

    switch (drawerKey) {
      case 'enter-order':
      case 'counter-sales':
      case 'special-order': {
        return (
          <div className="space-y-4">
            <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Create Sales Order</h3>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <SearchableSelect
                  value={createOrderForm.customerKey}
                  onChange={(value) =>
                    setCreateOrderForm((previous) => ({ ...previous, customerKey: value }))
                  }
                  placeholder="Select customer/branch"
                  options={customers.map((customer) => {
                    const key = `${customer.debtorNo}::${customer.branchCode}`;
                    return {
                      value: key,
                      label: `${customer.customerName} (${customer.debtorNo}/${customer.branchCode})`,
                      searchText: `${customer.customerName} ${customer.debtorNo} ${customer.branchCode}`,
                    };
                  })}
                />
                <input
                  value={createOrderForm.customerRef}
                  onChange={(event) =>
                    setCreateOrderForm((previous) => ({ ...previous, customerRef: event.target.value }))
                  }
                  placeholder="Customer reference"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={createOrderForm.buyerName}
                  onChange={(event) =>
                    setCreateOrderForm((previous) => ({ ...previous, buyerName: event.target.value }))
                  }
                  placeholder="Buyer name"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={createOrderForm.orderType}
                  onChange={(event) =>
                    setCreateOrderForm((previous) => ({ ...previous, orderType: event.target.value.toUpperCase() }))
                  }
                  placeholder="Order type"
                  maxLength={2}
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm uppercase text-gray-900 dark:text-white"
                />
              </div>
            </section>

            <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Add Line</h3>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                <SearchableSelect
                  value={createOrderForm.stockId}
                  onChange={(value) =>
                    setCreateOrderForm((previous) => ({ ...previous, stockId: value }))
                  }
                  placeholder="Select stock item"
                  options={stockItems.map((item) => ({
                    value: item.stockId,
                    label: `${item.stockId} - ${item.description}`,
                    searchText: `${item.stockId} ${item.description}`,
                  }))}
                  className="md:col-span-2"
                />
                <input
                  value={createOrderForm.quantity}
                  onChange={(event) =>
                    setCreateOrderForm((previous) => ({ ...previous, quantity: event.target.value }))
                  }
                  placeholder="Qty"
                  inputMode="decimal"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={createOrderForm.unitPrice}
                  onChange={(event) =>
                    setCreateOrderForm((previous) => ({ ...previous, unitPrice: event.target.value }))
                  }
                  placeholder={selectedItem ? `Unit (${selectedItem.price})` : 'Unit price'}
                  inputMode="decimal"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={addOrderLine}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Line
                </button>
                <button
                  type="button"
                  onClick={() => submitOnlineOrder().catch((error) => setDrawerError(String(error)))}
                  className="inline-flex items-center rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  Submit Order
                </button>
              </div>

              <div className="mt-3">
                {renderAdvancedTable<SalesOrderLineInput>(
                  'sales-pending-order-lines',
                  [
                    { id: 'stockId', header: 'Stock', accessor: (row) => row.stockId },
                    { id: 'quantity', header: 'Qty', accessor: (row) => row.quantity },
                    {
                      id: 'unitPrice',
                      header: 'Unit',
                      accessor: (row) => row.unitPrice,
                      exportValue: (row) => row.unitPrice,
                      cell: (row) => formatCurrency(row.unitPrice),
                    },
                    {
                      id: 'lineTotal',
                      header: 'Line Total',
                      accessor: (row) => row.unitPrice * row.quantity,
                      exportValue: (row) => row.unitPrice * row.quantity,
                      cell: (row) => (
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatCurrency(row.unitPrice * row.quantity)}
                        </span>
                      ),
                    },
                  ],
                  pendingOrderLines,
                  'No lines added yet.'
                )}
              </div>
            </section>
          </div>
        );
      }

      case 'outstanding-sales-orders':
      case 'order-inquiry': {
        const columns: AdvancedTableColumn<SalesOutstandingOrder>[] = [
          { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
          { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
          { id: 'orderDate', header: 'Order Date', accessor: (row) => formatDate(row.orderDate) },
          { id: 'deliveryDate', header: 'Delivery', accessor: (row) => formatDate(row.deliveryDate) },
          {
            id: 'outstanding',
            header: 'Outstanding',
            accessor: (row) => `${row.outstandingLines} lines / ${row.outstandingQty}`,
          },
          {
            id: 'grossTotal',
            header: 'Amount',
            accessor: (row) => row.grossTotal,
            exportValue: (row) => row.grossTotal,
            cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
          },
        ];

        return (
          renderAdvancedTable('sales-outstanding-orders', columns, outstandingOrders, 'No outstanding orders found.')
        );
      }

      case 'print-picking-lists': {
        const columns: AdvancedTableColumn<SalesPickingCandidate>[] = [
          { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
          { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
          { id: 'locationCode', header: 'Location', accessor: (row) => row.locationCode },
          { id: 'dueDate', header: 'Due Date', accessor: (row) => formatDate(row.dueDate) },
          { id: 'openQty', header: 'Open Qty', accessor: (row) => row.openQty },
        ];

        return (
          renderAdvancedTable('sales-picking-lists', columns, pickingCandidates, 'No picking list candidates found.')
        );
      }

      case 'recurring-order-template': {
        const columns: AdvancedTableColumn<SalesRecurringTemplate>[] = [
          { id: 'recurringOrderNo', header: 'Template', accessor: (row) => row.recurringOrderNo },
          { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
          { id: 'frequencyDays', header: 'Frequency', accessor: (row) => `${row.frequencyDays} days` },
          { id: 'lastRecurrence', header: 'Last Recurrence', accessor: (row) => formatDate(row.lastRecurrence) },
          { id: 'stopDate', header: 'Stop Date', accessor: (row) => formatDate(row.stopDate) },
          { id: 'lineCount', header: 'Lines', accessor: (row) => row.lineCount },
        ];

        return (
          renderAdvancedTable('sales-recurring-templates', columns, recurringTemplates, 'No recurring templates found.')
        );
      }

      case 'process-recurring-orders': {
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Select templates to process. Leave all unselected to process all due templates.
              </p>
              <button
                type="button"
                onClick={() => runRecurring().catch((error) => setDrawerError(String(error)))}
                className="inline-flex items-center rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Process
              </button>
            </div>

            {renderAdvancedTable<SalesRecurringTemplate>(
              'sales-recurring-process',
              [
                {
                  id: 'pick',
                  header: 'Pick',
                  accessor: (row) => selectedTemplateIds.includes(row.recurringOrderNo),
                  filterable: false,
                  cell: (row) => (
                    <input
                      type="checkbox"
                      checked={selectedTemplateIds.includes(row.recurringOrderNo)}
                      onChange={() => toggleTemplate(row.recurringOrderNo)}
                      className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500"
                    />
                  ),
                },
                { id: 'recurringOrderNo', header: 'Template', accessor: (row) => row.recurringOrderNo },
                { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
                { id: 'frequencyDays', header: 'Frequency', accessor: (row) => `${row.frequencyDays} days` },
                { id: 'lastRecurrence', header: 'Last Recurrence', accessor: (row) => formatDate(row.lastRecurrence) },
              ],
              recurringTemplates,
              'No due recurring templates found.'
            )}
          </div>
        );
      }

      case 'print-price-lists': {
        const columns: AdvancedTableColumn<SalesPriceListItem>[] = [
          { id: 'stockId', header: 'Stock', accessor: (row) => row.stockId },
          { id: 'description', header: 'Description', accessor: (row) => row.description },
          { id: 'salesType', header: 'Type', accessor: (row) => row.salesType },
          {
            id: 'unitPrice',
            header: 'Price',
            accessor: (row) => `${row.currency} ${row.unitPrice.toFixed(2)}`,
            exportValue: (row) => row.unitPrice,
          },
          { id: 'units', header: 'Units', accessor: (row) => row.units },
        ];

        return (
          renderAdvancedTable('sales-price-lists', columns, priceListItems, 'No price list rows found.')
        );
      }

      case 'order-status-report':
      case 'sales-order-detail-summary': {
        const columns: AdvancedTableColumn<SalesOrderStatusRow>[] = [
          { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
          { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
          { id: 'orderDate', header: 'Ordered', accessor: (row) => formatDate(row.orderDate) },
          { id: 'deliveryDate', header: 'Delivery', accessor: (row) => formatDate(row.deliveryDate) },
          { id: 'completed', header: 'Completed', accessor: (row) => `${row.completedLines}/${row.lineCount}` },
          {
            id: 'grossTotal',
            header: 'Amount',
            accessor: (row) => row.grossTotal,
            exportValue: (row) => row.grossTotal,
            cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
          },
        ];

        return (
          renderAdvancedTable('sales-order-status', columns, orderStatusRows, 'No order status rows found.')
        );
      }

      case 'orders-invoiced-reports': {
        const columns: AdvancedTableColumn<SalesTransaction>[] = [
          { id: 'transNo', header: 'Trans No', accessor: (row) => row.transNo },
          { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
          { id: 'reference', header: 'Reference', accessor: (row) => row.reference || '-' },
          { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo || '-' },
          { id: 'transactionDate', header: 'Date', accessor: (row) => formatDate(row.transactionDate) },
          {
            id: 'grossTotal',
            header: 'Amount',
            accessor: (row) => row.grossTotal,
            exportValue: (row) => row.grossTotal,
            cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
          },
        ];

        return (
          renderAdvancedTable('sales-orders-invoiced', columns, invoicedTransactions, 'No invoiced transactions found.')
        );
      }

      case 'daily-sales-inquiry': {
        const columns: AdvancedTableColumn<SalesDailySalesRow>[] = [
          { id: 'day', header: 'Day', accessor: (row) => formatDate(row.day) },
          { id: 'invoiceCount', header: 'Invoices', accessor: (row) => row.invoiceCount },
          {
            id: 'grossTotal',
            header: 'Gross Total',
            accessor: (row) => row.grossTotal,
            exportValue: (row) => row.grossTotal,
            cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
          },
        ];

        return (
          renderAdvancedTable('sales-daily-inquiry', columns, dailySalesRows, 'No daily sales rows found.')
        );
      }

      case 'top-sales-items-report': {
        const columns: AdvancedTableColumn<SalesTopItem>[] = [
          { id: 'stockId', header: 'Stock', accessor: (row) => row.stockId },
          { id: 'description', header: 'Description', accessor: (row) => row.description },
          { id: 'quantity', header: 'Quantity', accessor: (row) => row.quantity },
          {
            id: 'grossTotal',
            header: 'Gross Total',
            accessor: (row) => row.grossTotal,
            exportValue: (row) => row.grossTotal,
            cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
          },
        ];

        return (
          renderAdvancedTable('sales-top-items', columns, topItems, 'No top items rows found.')
        );
      }

      case 'sales-with-low-gross-profit-report': {
        const columns: AdvancedTableColumn<SalesLowGrossRow>[] = [
          { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
          { id: 'stockId', header: 'Stock', accessor: (row) => row.stockId },
          { id: 'description', header: 'Description', accessor: (row) => row.description },
          { id: 'unitPrice', header: 'Unit', accessor: (row) => row.unitPrice, cell: (row) => formatCurrency(row.unitPrice) },
          { id: 'materialCost', header: 'Cost', accessor: (row) => row.materialCost, cell: (row) => formatCurrency(row.materialCost) },
          { id: 'grossMarginPct', header: 'Margin %', accessor: (row) => `${row.grossMarginPct}%` },
        ];

        return (
          renderAdvancedTable('sales-low-gross', columns, lowGrossRows, 'No low gross rows found.')
        );
      }

      case 'order-delivery-differences-report': {
        const today = new Date();
        const lateOrders = outstandingOrders.filter((row) => {
          const delivery = new Date(row.deliveryDate);
          return !Number.isNaN(delivery.getTime()) && delivery < today;
        });

        return (
          <div className="space-y-3">
            <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Orders past delivery date</p>
              <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{lateOrders.length}</p>
            </div>
            {renderAdvancedTable<SalesOutstandingOrder>(
              'sales-delivery-differences',
              [
                { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
                { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
                { id: 'deliveryDate', header: 'Delivery Date', accessor: (row) => formatDate(row.deliveryDate) },
                { id: 'outstandingQty', header: 'Outstanding Qty', accessor: (row) => row.outstandingQty },
                {
                  id: 'grossTotal',
                  header: 'Amount',
                  accessor: (row) => row.grossTotal,
                  exportValue: (row) => row.grossTotal,
                  cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
                },
              ],
              lateOrders,
              'No delivery differences detected.'
            )}
          </div>
        );
      }

      case 'difot-report': {
        return (
          <div className="space-y-4">
            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Orders Evaluated</p>
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{difotSnapshot.total}</p>
              </div>
              <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">In Full & On Time</p>
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{difotSnapshot.fullOnTime}</p>
              </div>
              <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">DIFOT %</p>
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{difotSnapshot.fullOnTimePct}%</p>
              </div>
            </section>

            {renderAdvancedTable<SalesOrderStatusRow>(
              'sales-difot-orders',
              [
                { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
                { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
                { id: 'completedLines', header: 'Completed Lines', accessor: (row) => row.completedLines },
                { id: 'lineCount', header: 'Total Lines', accessor: (row) => row.lineCount },
                { id: 'deliveryDate', header: 'Delivery', accessor: (row) => formatDate(row.deliveryDate) },
              ],
              orderStatusRows,
              'No DIFOT orders found.'
            )}
          </div>
        );
      }

      case 'select-contract':
      case 'create-contract': {
        const customerKey = `${contractForm.debtorNo}::${contractForm.branchCode}`;

        return (
          <div className="space-y-4">
            {drawerKey === 'select-contract' ? (
              <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Contracts</h3>
                  <div className="flex items-center gap-2">
                    <SearchableSelect
                      value={contractStatusFilter}
                      onChange={(value) => setContractStatusFilter(value)}
                      options={[
                        { value: '4', label: 'All' },
                        { value: '0', label: 'Not Yet Quoted' },
                        { value: '1', label: 'Quoted - No Order' },
                        { value: '2', label: 'Order Placed' },
                        { value: '3', label: 'Completed' },
                      ]}
                      className="w-52"
                      inputClassName="py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        resetContractEditor();
                        setDrawerMessage('');
                      }}
                      className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
                    >
                      New Contract
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  {renderAdvancedTable<SalesContractSummary>(
                    'sales-contracts',
                    [
                      {
                        id: 'contractRef',
                        header: 'Contract',
                        accessor: (row) => row.contractRef,
                        cell: (row) => (
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{row.contractRef}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{row.contractDescription}</p>
                          </div>
                        ),
                      },
                      { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
                      { id: 'statusLabel', header: 'Status', accessor: (row) => row.statusLabel },
                      { id: 'requiredDate', header: 'Required', accessor: (row) => formatDate(row.requiredDate) },
                      { id: 'orderNo', header: 'Order', accessor: (row) => (row.orderNo > 0 ? row.orderNo : '-') },
                      {
                        id: 'totalCost',
                        header: 'Cost',
                        accessor: (row) => row.totalCost,
                        exportValue: (row) => row.totalCost,
                        cell: (row) => (
                          <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.totalCost)}</span>
                        ),
                      },
                      {
                        id: 'actions',
                        header: 'Actions',
                        accessor: () => '',
                        filterable: false,
                        cell: (row) => (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openContractForEdit(row.contractRef).catch((error) => setDrawerError(String(error)))}
                              className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/20"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                quoteContractByRef(row.contractRef).catch((error) => setDrawerError(String(error)));
                              }}
                              className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/20"
                            >
                              Quote
                            </button>
                          </div>
                        ),
                      },
                    ],
                    contractRows,
                    'No contracts found.'
                  )}
                </div>
              </section>
            ) : null}

            <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {selectedContractRef ? `Edit Contract: ${selectedContractRef}` : 'Create Contract'}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveContract().catch((error) => setDrawerError(String(error)))}
                    className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
                  >
                    {selectedContractRef ? 'Update Contract' : 'Save Contract'}
                  </button>
                  <button
                    type="button"
                    onClick={() => createContractQuotationNow().catch((error) => setDrawerError(String(error)))}
                    disabled={!selectedContractRef}
                    className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white enabled:hover:bg-brand-600 disabled:opacity-50"
                  >
                    Create Quotation
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelCurrentContract().catch((error) => setDrawerError(String(error)))}
                    disabled={!selectedContractRef}
                    className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 enabled:hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/40 dark:text-rose-300 dark:enabled:hover:bg-rose-950/30"
                  >
                    Cancel Contract
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={contractForm.contractRef}
                  onChange={(event) => setContractForm((previous) => ({ ...previous, contractRef: event.target.value }))}
                  placeholder="Contract Ref"
                  disabled={Boolean(selectedContractRef)}
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white disabled:bg-gray-100 dark:bg-slate-950 dark:disabled:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={contractForm.customerRef}
                  onChange={(event) => setContractForm((previous) => ({ ...previous, customerRef: event.target.value }))}
                  placeholder="Customer reference"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <textarea
                  value={contractForm.contractDescription}
                  onChange={(event) =>
                    setContractForm((previous) => ({ ...previous, contractDescription: event.target.value }))
                  }
                  placeholder="Contract description"
                  rows={3}
                  className="md:col-span-2 rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <SearchableSelect
                  value={customerKey}
                  onChange={(value) => {
                    const [debtorNo, branchCode] = value.split('::');
                    const selected = contractLookups?.customers.find(
                      (row) => row.debtorNo === debtorNo && row.branchCode === branchCode
                    );
                    setContractForm((previous) => ({
                      ...previous,
                      debtorNo: debtorNo ?? '',
                      branchCode: branchCode ?? '',
                      locationCode: selected?.defaultLocation || previous.locationCode,
                    }));
                  }}
                  placeholder="Select customer/branch"
                  options={(contractLookups?.customers ?? []).map((row) => ({
                    value: `${row.debtorNo}::${row.branchCode}`,
                    label: `${row.customerName} (${row.debtorNo}/${row.branchCode})`,
                    searchText: `${row.customerName} ${row.debtorNo} ${row.branchCode}`,
                  }))}
                />
                <SearchableSelect
                  value={contractForm.categoryId}
                  onChange={(value) => setContractForm((previous) => ({ ...previous, categoryId: value }))}
                  placeholder="Select category"
                  options={(contractLookups?.categories ?? []).map((row) => ({
                    value: row.categoryId,
                    label: `${row.categoryId} - ${row.categoryDescription}`,
                    searchText: `${row.categoryId} ${row.categoryDescription}`,
                  }))}
                />
                <SearchableSelect
                  value={contractForm.locationCode}
                  onChange={(value) => setContractForm((previous) => ({ ...previous, locationCode: value }))}
                  placeholder="Select location"
                  options={(contractLookups?.locations ?? []).map((row) => ({
                    value: row.locationCode,
                    label: `${row.locationCode} - ${row.locationName}`,
                    searchText: `${row.locationCode} ${row.locationName}`,
                  }))}
                />
                <SearchableSelect
                  value={contractForm.defaultWorkCentre}
                  onChange={(value) =>
                    setContractForm((previous) => ({ ...previous, defaultWorkCentre: value }))
                  }
                  placeholder="Default work centre"
                  options={workCentresForLocation.map((row) => ({
                    value: row.workCentreCode,
                    label: `${row.workCentreCode} - ${row.description}`,
                    searchText: `${row.workCentreCode} ${row.description}`,
                  }))}
                />
                <input
                  type="date"
                  value={contractForm.requiredDate}
                  onChange={(event) => setContractForm((previous) => ({ ...previous, requiredDate: event.target.value }))}
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={contractForm.margin}
                  onChange={(event) => setContractForm((previous) => ({ ...previous, margin: event.target.value }))}
                  placeholder="Margin %"
                  inputMode="decimal"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={contractForm.exchangeRate}
                  onChange={(event) => setContractForm((previous) => ({ ...previous, exchangeRate: event.target.value }))}
                  placeholder="Exchange rate"
                  inputMode="decimal"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
            </section>

            <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Contract BOM</h4>
                <button
                  type="button"
                  onClick={addContractBomLine}
                  className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/20"
                >
                  Add BOM Line
                </button>
              </div>

              <div className="mt-3">
                {renderAdvancedTable<ContractBomDraftLine>(
                  'sales-contract-bom-lines',
                  [
                    {
                      id: 'stockId',
                      header: 'Stock ID',
                      accessor: (row) => row.stockId,
                      cell: (row) => {
                        const index = contractBomLines.indexOf(row);
                        return (
                          <input
                            value={row.stockId}
                            onChange={(event) =>
                              setContractBomLines((previous) =>
                                previous.map((line, i) => (i === index ? { ...line, stockId: event.target.value } : line))
                              )
                            }
                            placeholder="Stock ID"
                            className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                          />
                        );
                      },
                    },
                    {
                      id: 'workCentreCode',
                      header: 'Work Centre',
                      accessor: (row) => row.workCentreCode,
                      cell: (row) => {
                        const index = contractBomLines.indexOf(row);
                        return (
                          <SearchableSelect
                            value={row.workCentreCode}
                            onChange={(value) =>
                              setContractBomLines((previous) =>
                                previous.map((line, i) =>
                                  i === index ? { ...line, workCentreCode: value } : line
                                )
                              )
                            }
                            placeholder="Default"
                            options={[
                              { value: '', label: 'Default' },
                              ...workCentresForLocation.map((workCentre) => ({
                                value: workCentre.workCentreCode,
                                label: `${workCentre.workCentreCode} - ${workCentre.description}`,
                                searchText: `${workCentre.workCentreCode} ${workCentre.description}`,
                              })),
                            ]}
                            inputClassName="px-2 py-1.5 text-sm"
                          />
                        );
                      },
                    },
                    {
                      id: 'quantity',
                      header: 'Quantity',
                      accessor: (row) => row.quantity,
                      cell: (row) => {
                        const index = contractBomLines.indexOf(row);
                        return (
                          <input
                            value={row.quantity}
                            onChange={(event) =>
                              setContractBomLines((previous) =>
                                previous.map((line, i) => (i === index ? { ...line, quantity: event.target.value } : line))
                              )
                            }
                            inputMode="decimal"
                            className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                          />
                        );
                      },
                    },
                    {
                      id: 'actions',
                      header: 'Action',
                      accessor: () => '',
                      filterable: false,
                      cell: (row) => {
                        const index = contractBomLines.indexOf(row);
                        return (
                          <button
                            type="button"
                            onClick={() => removeContractBomLine(index)}
                            className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-950/30"
                          >
                            Remove
                          </button>
                        );
                      },
                    },
                  ],
                  contractBomLines,
                  'No BOM lines yet.'
                )}
              </div>
            </section>

            <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Other Requirements</h4>
                <button
                  type="button"
                  onClick={addContractRequirementLine}
                  className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/20"
                >
                  Add Requirement
                </button>
              </div>

              <div className="mt-3">
                {renderAdvancedTable<ContractRequirementDraftLine>(
                  'sales-contract-requirement-lines',
                  [
                    {
                      id: 'requirement',
                      header: 'Requirement',
                      accessor: (row) => row.requirement,
                      cell: (row) => {
                        const index = contractRequirementLines.indexOf(row);
                        return (
                          <input
                            value={row.requirement}
                            onChange={(event) =>
                              setContractRequirementLines((previous) =>
                                previous.map((line, i) =>
                                  i === index ? { ...line, requirement: event.target.value } : line
                                )
                              )
                            }
                            placeholder="Requirement details"
                            className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                          />
                        );
                      },
                    },
                    {
                      id: 'quantity',
                      header: 'Quantity',
                      accessor: (row) => row.quantity,
                      cell: (row) => {
                        const index = contractRequirementLines.indexOf(row);
                        return (
                          <input
                            value={row.quantity}
                            onChange={(event) =>
                              setContractRequirementLines((previous) =>
                                previous.map((line, i) => (i === index ? { ...line, quantity: event.target.value } : line))
                              )
                            }
                            inputMode="decimal"
                            className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                          />
                        );
                      },
                    },
                    {
                      id: 'costPerUnit',
                      header: 'Cost/Unit',
                      accessor: (row) => row.costPerUnit,
                      cell: (row) => {
                        const index = contractRequirementLines.indexOf(row);
                        return (
                          <input
                            value={row.costPerUnit}
                            onChange={(event) =>
                              setContractRequirementLines((previous) =>
                                previous.map((line, i) =>
                                  i === index ? { ...line, costPerUnit: event.target.value } : line
                                )
                              )
                            }
                            inputMode="decimal"
                            className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                          />
                        );
                      },
                    },
                    {
                      id: 'actions',
                      header: 'Action',
                      accessor: () => '',
                      filterable: false,
                      cell: (row) => {
                        const index = contractRequirementLines.indexOf(row);
                        return (
                          <button
                            type="button"
                            onClick={() => removeContractRequirementLine(index)}
                            className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-950/30"
                          >
                            Remove
                          </button>
                        );
                      },
                    },
                  ],
                  contractRequirementLines,
                  'No requirement lines yet.'
                )}
              </div>
            </section>
          </div>
        );
      }
    }
  };

  return (
    <>
      <div className="space-y-4 md:space-y-5">
        <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900 px-4 py-4 md:px-5 md:py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">{modeTitle}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                webERP routing slug: {sourceSlug || 'sales'}.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                  isOnline
                    ? 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {isOnline ? 'Online' : 'Offline'}
              </span>
              {mode === 'transactions' ? (
                <span className="inline-flex items-center rounded-full px-2.5 py-1 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                  Sync: {syncState}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 bg-brand-600 text-white hover:bg-brand-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
          </div>
        </section>

        {mode === 'transactions' && !routeTemplateRoute ? (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="rounded-xl border border-brand-100 dark:border-brand-900/60 bg-white dark:bg-slate-900 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">Orders</p>
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{metrics.orderCount}</p>
              </div>
              <div className="rounded-xl border border-brand-100 dark:border-brand-900/60 bg-white dark:bg-slate-900 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">Sales Amount</p>
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(metrics.totalAmount)}
                </p>
              </div>
              <div className="rounded-xl border border-brand-100 dark:border-brand-900/60 bg-white dark:bg-slate-900 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">Pending Sync</p>
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{metrics.pendingDrafts}</p>
              </div>
            </section>

            <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Quick Draft</h2>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                <input
                  value={form.customerName}
                  onChange={(event) => setForm((prev) => ({ ...prev, customerName: event.target.value }))}
                  placeholder="Customer name"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={form.debtorNo}
                  onChange={(event) => setForm((prev) => ({ ...prev, debtorNo: event.target.value }))}
                  placeholder="Debtor code"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={form.customerRef}
                  onChange={(event) => setForm((prev) => ({ ...prev, customerRef: event.target.value }))}
                  placeholder="Customer ref"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <div className="flex gap-2">
                  <input
                    value={form.grossTotal}
                    onChange={(event) => setForm((prev) => ({ ...prev, grossTotal: event.target.value }))}
                    placeholder="Amount"
                    inputMode="decimal"
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => submitDraft().catch((error) => setErrorMessage(String(error)))}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900">
              <div className="border-b border-brand-100 dark:border-brand-900/50 p-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Transactions</h2>
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search order/customer"
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 pl-8 pr-3 py-2 text-sm text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="p-4 pt-3">
                {renderAdvancedTable<SalesTransaction>(
                  'sales-transactions',
                  [
                    { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo || '-' },
                    {
                      id: 'customerName',
                      header: 'Customer',
                      accessor: (row) => row.customerName,
                      cell: (row) => (
                        <div>
                          <p>{row.customerName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{row.debtorNo}</p>
                        </div>
                      ),
                    },
                    { id: 'transactionDate', header: 'Date', accessor: (row) => formatDate(row.transactionDate) },
                    {
                      id: 'grossTotal',
                      header: 'Amount',
                      accessor: (row) => row.grossTotal,
                      exportValue: (row) => row.grossTotal,
                      cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
                    },
                    { id: 'state', header: 'State', accessor: (row) => (row.settled ? 'Settled' : 'Open') },
                  ],
                  transactions,
                  'No transactions found.',
                  loading,
                  'Loading transactions...'
                )}
              </div>
              <div className="border-t border-brand-100 dark:border-brand-900/50 px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                Pending CouchDB changes: {pendingSync}
              </div>
            </section>

            <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900">
              <div className="p-4 border-b border-brand-100 dark:border-brand-900/50">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Offline Draft Orders</h2>
              </div>
              <div className="p-4 pt-3">
                {renderAdvancedTable<SalesOrderListItem>(
                  'sales-offline-orders',
                  [
                    { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
                    { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
                    { id: 'orderDate', header: 'Date', accessor: (row) => formatDate(row.orderDate) },
                    {
                      id: 'grossTotal',
                      header: 'Amount',
                      accessor: (row) => row.grossTotal,
                      exportValue: (row) => row.grossTotal,
                      cell: (row) => formatCurrency(row.grossTotal),
                    },
                    { id: 'sync', header: 'Sync', accessor: (row) => statusLabel(row) },
                  ],
                  orders,
                  'No offline draft orders found.',
                  loading,
                  'Loading offline drafts...'
                )}
              </div>
            </section>
          </>
        ) : null}

        {mode === 'reports' && !routeTemplateRoute ? (
          <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Sales Summary Report</h2>
            {loading || !reportSummary ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading reports...</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Monthly Sales</h3>
                  <div className="space-y-2">
                    {reportSummary.monthly.map((row) => (
                      <div key={row.month} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{row.month}</span>
                        <span className="text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Top Customers</h3>
                  <div className="space-y-2">
                    {reportSummary.topCustomers.map((row) => (
                      <div key={row.debtorNo} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{row.customerName}</span>
                        <span className="text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {mode === 'settings' && !routeTemplateRoute ? (
          <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Sales Settings</h2>
            {loading || !settings ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading settings...</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Sales Types</h3>
                  {settings.salesTypes.map((item) => (
                    <p key={item.code} className="text-sm text-gray-700 dark:text-gray-300">{item.code} - {item.name}</p>
                  ))}
                </div>
                <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Payment Terms</h3>
                  {settings.paymentTerms.map((item) => (
                    <p key={item.code} className="text-sm text-gray-700 dark:text-gray-300">{item.code} - {item.name}</p>
                  ))}
                </div>
                <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Hold Reasons</h3>
                  {settings.holdReasons.map((item) => (
                    <p key={item.code} className="text-sm text-gray-700 dark:text-gray-300">
                      {item.code} - {item.name} ({item.blocksInvoicing ? 'Blocks invoices' : 'Allowed'})
                    </p>
                  ))}
                </div>
                <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Sales People</h3>
                  {settings.salesPeople.map((item) => (
                    <p key={item.code} className="text-sm text-gray-700 dark:text-gray-300">
                      {item.code} - {item.name} ({item.current ? 'Current' : 'Inactive'})
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : null}

        {routeTemplateRoute && drawerKey && drawerDetails ? (
          <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900 p-4 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{drawerDetails.title}</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{drawerDetails.subtitle}</p>
            </div>

            {drawerSupportsSearch(drawerKey) ? (
              <div className="relative w-full max-w-md">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  value={drawerSearch}
                  onChange={(event) => setDrawerSearch(event.target.value)}
                  placeholder="Search in this module"
                  className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 pl-8 pr-3 py-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
            ) : null}

            {drawerMessage ? (
              <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:border-brand-800 dark:bg-brand-900/20 dark:text-brand-300">
                {drawerMessage}
              </div>
            ) : null}

            {drawerError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                {drawerError}
              </div>
            ) : null}

            {renderDrawerContent()}
          </section>
        ) : null}

        {errorMessage ? (
          <p className="text-xs text-brand-700 dark:text-brand-300">{errorMessage}</p>
        ) : null}
      </div>
    </>
  );
}
