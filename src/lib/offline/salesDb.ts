import PouchDB from 'pouchdb-browser';
import PouchDBFind from 'pouchdb-find';
import { SalesOrderDoc } from '../../types/sales';

PouchDB.plugin(PouchDBFind);

export const SALES_DB_NAME = 'akiva_sales_orders_v1';

let salesDb: PouchDB.Database<SalesOrderDoc> | null = null;
let indexReady = false;

export function getSalesDb(): PouchDB.Database<SalesOrderDoc> {
  if (!salesDb) {
    salesDb = new PouchDB<SalesOrderDoc>(SALES_DB_NAME, {
      auto_compaction: true,
    });
  }
  return salesDb;
}

export async function ensureSalesDbIndexes(): Promise<void> {
  if (indexReady) return;
  const db = getSalesDb();
  await db.createIndex({
    index: {
      fields: ['docType', 'updatedAt'],
      name: 'sales_orders_by_type_updated_at',
    },
  });
  indexReady = true;
}
