import { getSalesDb, ensureSalesDbIndexes } from './salesDb';
import {
  NewSalesOrderDraftInput,
  OnlineSalesOrder,
  SalesOrderDoc,
  SalesOrderListItem,
} from '../../types/sales';

function nowIso(): string {
  return new Date().toISOString();
}

function makeLocalOrderNumber(): string {
  return `DRAFT-${Date.now()}`;
}

function makeLocalId(): string {
  return `sales-order:local:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function toSalesOrderListItem(doc: SalesOrderDoc): SalesOrderListItem {
  return {
    id: doc._id,
    orderNo: doc.orderNo,
    customerName: doc.customerName,
    debtorNo: doc.debtorNo,
    customerRef: doc.customerRef,
    orderDate: doc.orderDate,
    deliveryDate: doc.deliveryDate,
    grossTotal: doc.grossTotal,
    lineCount: doc.lineCount,
    status: doc.status,
    source: doc.source,
    syncState: doc.syncState,
  };
}

export async function listSalesOrders(searchTerm = ''): Promise<SalesOrderListItem[]> {
  await ensureSalesDbIndexes();
  const db = getSalesDb();
  const result = await db.find({
    selector: { docType: 'sales-order' },
    limit: 500,
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const docs = result.docs
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((doc) => {
      if (!normalizedSearch) return true;
      return [
        doc.orderNo,
        doc.customerName,
        doc.debtorNo,
        doc.customerRef,
        doc.status,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });

  return docs.map(toSalesOrderListItem);
}

export async function createSalesOrderDraft(
  input: NewSalesOrderDraftInput
): Promise<SalesOrderListItem> {
  const db = getSalesDb();
  const now = nowIso();
  const orderDate = input.orderDate ?? now.slice(0, 10);
  const deliveryDate = input.deliveryDate ?? orderDate;

  const doc: SalesOrderDoc = {
    _id: makeLocalId(),
    docType: 'sales-order',
    source: 'local-draft',
    orderNo: makeLocalOrderNumber(),
    debtorNo: input.debtorNo.trim() || 'DRAFT',
    customerName: input.customerName.trim(),
    customerRef: (input.customerRef ?? '').trim(),
    orderDate,
    deliveryDate,
    status: 'draft',
    grossTotal: Number(input.grossTotal),
    lineCount: 1,
    syncState: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.put(doc);
  return toSalesOrderListItem(doc);
}

export async function upsertOrdersFromWebErp(orders: OnlineSalesOrder[]): Promise<void> {
  if (orders.length === 0) return;
  const db = getSalesDb();

  for (const order of orders) {
    const id = `sales-order:weberp:${order.orderNo}`;
    const now = nowIso();
    const existing = await db.get(id).catch(() => null);

    const nextDoc: SalesOrderDoc = {
      _id: id,
      ...(existing?._rev ? { _rev: existing._rev } : {}),
      docType: 'sales-order',
      source: 'weberp',
      orderNo: order.orderNo,
      debtorNo: order.debtorNo,
      customerName: order.customerName,
      customerRef: order.customerRef,
      orderDate: order.orderDate,
      deliveryDate: order.deliveryDate,
      status: 'confirmed',
      grossTotal: order.grossTotal,
      lineCount: order.lineCount,
      syncState: 'synced',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await db.put(nextDoc);
  }
}
