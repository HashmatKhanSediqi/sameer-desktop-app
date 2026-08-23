import type Database from 'better-sqlite3';
import { performance } from 'node:perf_hooks';

export const EXTREME_CUSTOMER_COUNT = 1_000_000;
export const EXTREME_TRANSACTION_COUNT = 5_000_000;
export const SCALE_CUSTOMER_COUNT = 100_000;
export const SCALE_TRANSACTION_COUNT = 300_000;

export interface ScaleSeedProfile {
  customerCount: number;
  transactionCount: number;
}

export interface ScaleSeedResult {
  customerIds: number[];
  heavyCustomerIds: number[];
  zeroActivityCustomerIds: number[];
  mediumCustomerIds: number[];
  rareSearchCustomerId: number;
  commonSearchCustomerId: number;
  exactSearchNumber: string;
  seedMs: number;
  transactionCount: number;
}

export interface ScaleSeedOptions {
  profile: ScaleSeedProfile;
  batchSize?: number;
  logProgress?: boolean;
}

function isZeroActivityCustomer(id: number): boolean {
  return id % 10 === 0;
}

function pickHeavyIds(maxId: number): number[] {
  const ids: number[] = [];
  for (let id = 1; id <= Math.min(10, maxId); id += 1) {
    if (!isZeroActivityCustomer(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function pickMediumIds(maxId: number): number[] {
  const ids: number[] = [];
  for (let id = 11; id <= Math.min(1000, maxId); id += 1) {
    if (!isZeroActivityCustomer(id)) {
      ids.push(id);
    }
  }
  return ids;
}

export function seedScaleDataset(db: Database.Database, options: ScaleSeedOptions): ScaleSeedResult {
  const { profile, batchSize = 10_000, logProgress = false } = options;
  const started = performance.now();

  db.pragma('synchronous = OFF');
  db.pragma('journal_mode = WAL');

  const insertCustomer = db.prepare('INSERT INTO customers (name, customer_number) VALUES (?, ?)');
  const insertTransaction = db.prepare(
    `INSERT INTO transactions (customer_id, type, currency_code, amount, note, transaction_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const customerIds: number[] = new Array(profile.customerCount);
  for (let batchStart = 0; batchStart < profile.customerCount; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, profile.customerCount);
    db.transaction(() => {
      for (let index = batchStart; index < batchEnd; index += 1) {
        const id = index + 1;
        const name =
          id === 500_000
            ? 'RareName Zeta'
            : id === 100
              ? 'CommonName Smith'
              : `Customer ${index}`;
        const number = id === 500_000 ? 'RARE-500000' : `C-${index}`;
        const result = insertCustomer.run(name, number);
        customerIds[index] = Number(result.lastInsertRowid);
      }
    })();
    if (logProgress && batchEnd % 100_000 === 0) {
      // eslint-disable-next-line no-console
      console.info('[scale-seed] customers', batchEnd);
    }
  }

  const heavyCustomerIds = pickHeavyIds(profile.customerCount);
  const mediumCustomerIds = pickMediumIds(profile.customerCount);
  const zeroActivityCustomerIds = customerIds.filter((id) => isZeroActivityCustomer(id));

  const heavyTotal = Math.min(1_000_000, profile.transactionCount);
  const perHeavy =
    heavyCustomerIds.length > 0 ? Math.floor(heavyTotal / heavyCustomerIds.length) : 0;
  const mediumTotal = Math.min(1_000_000, profile.transactionCount - perHeavy * heavyCustomerIds.length);
  const perMedium =
    mediumCustomerIds.length > 0 ? Math.floor(mediumTotal / mediumCustomerIds.length) : 0;

  const assignedHeavy = perHeavy * heavyCustomerIds.length;
  const assignedMedium = perMedium * mediumCustomerIds.length;
  const lightPool = customerIds.filter(
    (id) =>
      !isZeroActivityCustomer(id) &&
      !heavyCustomerIds.includes(id) &&
      !mediumCustomerIds.includes(id),
  );
  const remaining = Math.max(0, profile.transactionCount - assignedHeavy - assignedMedium);
  const perLight = lightPool.length > 0 ? Math.floor(remaining / lightPool.length) : 0;
  let remainder = remaining - perLight * lightPool.length;

  const currencies = ['AFN', 'USD', 'EUR'] as const;
  const types = ['CASH_IN', 'CASH_OUT'] as const;
  let insertedTransactions = 0;

  const insertBatch = (customerId: number, count: number, amountBase: number): void => {
    if (count <= 0) {
      return;
    }
    for (let offset = 0; offset < count; offset += batchSize) {
      const limit = Math.min(batchSize, count - offset);
      db.transaction(() => {
        for (let row = 0; row < limit; row += 1) {
          const seq = insertedTransactions + row;
          const type = types[seq % types.length]!;
          const currency = currencies[seq % currencies.length]!;
          const day = (seq % 28) + 1;
          insertTransaction.run(
            customerId,
            type,
            currency,
            `${((seq % 500) + amountBase).toFixed(4)}`,
            seq % 17 === 0 ? `note-${seq}` : null,
            `2025-${String((seq % 12) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} 12:00:00`,
          );
        }
      })();
      insertedTransactions += limit;
    }
  };

  for (const customerId of heavyCustomerIds) {
    insertBatch(customerId, perHeavy, 100);
  }
  for (const customerId of mediumCustomerIds) {
    insertBatch(customerId, perMedium, 50);
  }
  for (const customerId of lightPool) {
    let count = perLight;
    if (remainder > 0) {
      count += 1;
      remainder -= 1;
    }
    insertBatch(customerId, count, 10);
  }

  // Transfer pairs (~0.05% of target, capped)
  const transferPairs = Math.min(500, Math.floor(profile.transactionCount / 2000));
  for (let pair = 0; pair < transferPairs; pair += 1) {
    const fromId = heavyCustomerIds[pair % heavyCustomerIds.length] ?? 1;
    const toId = mediumCustomerIds[pair % mediumCustomerIds.length] ?? 2;
    if (fromId === toId || isZeroActivityCustomer(fromId) || isZeroActivityCustomer(toId)) {
      continue;
    }
    const transferId = `scale-transfer-${pair}`;
    const amount = `${(pair % 100) + 1}.0000`;
    const date = `2026-01-${String((pair % 28) + 1).padStart(2, '0')} 09:00:00`;
    db.transaction(() => {
      insertTransaction.run(fromId, 'CASH_OUT', 'AFN', amount, 'transfer-out', date);
      insertTransaction.run(toId, 'CASH_IN', 'AFN', amount, 'transfer-in', date);
    })();
    insertedTransactions += 2;
  }

  db.pragma('synchronous = NORMAL');
  db.pragma('wal_checkpoint(FULL)');

  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') {
    throw new Error(`Database integrity failed after seed: ${integrity}`);
  }

  return {
    customerIds,
    heavyCustomerIds,
    zeroActivityCustomerIds,
    mediumCustomerIds,
    rareSearchCustomerId: 500_000,
    commonSearchCustomerId: 100,
    exactSearchNumber: 'C-100',
    seedMs: performance.now() - started,
    transactionCount: insertedTransactions,
  };
}

export function explainQueryPlan(db: Database.Database, sql: string, ...params: unknown[]): string[] {
  return db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...params)
    .map((row) => JSON.stringify(row));
}

export function memorySnapshot(): Record<string, number> {
  const usage = process.memoryUsage();
  return {
    rssMb: Number((usage.rss / (1024 * 1024)).toFixed(2)),
    heapUsedMb: Number((usage.heapUsed / (1024 * 1024)).toFixed(2)),
    heapTotalMb: Number((usage.heapTotal / (1024 * 1024)).toFixed(2)),
    externalMb: Number((usage.external / (1024 * 1024)).toFixed(2)),
  };
}
