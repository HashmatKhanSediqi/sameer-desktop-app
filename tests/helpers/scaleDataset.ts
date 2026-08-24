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
  heavyCustomerIds: number[];
  zeroActivityCustomerIds: number[];
  mediumCustomerIds: number[];
  rareSearchCustomerId: number;
  commonSearchCustomerId: number;
  exactSearchNumber: string;
  seedMs: number;
  transactionCount: number;
  customerCount: number;
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

/**
 * Fast bulk seeder for stress tests.
 * - Multi-row INSERTs
 * - Does not retain a 1M customer ID array in memory
 * - Uses quick_check (not full integrity_check) after seed
 */
export function seedScaleDataset(db: Database.Database, options: ScaleSeedOptions): ScaleSeedResult {
  const { profile, batchSize = 20_000, logProgress = false } = options;
  const started = performance.now();

  db.pragma('synchronous = OFF');
  db.pragma('journal_mode = WAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -65536');

  const insertCustomer = db.prepare('INSERT INTO customers (name, customer_number) VALUES (?, ?)');

  for (let batchStart = 0; batchStart < profile.customerCount; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, profile.customerCount);
    db.transaction(() => {
      for (let index = batchStart; index < batchEnd; index += 1) {
        const id = index + 1;
        const name =
          id === 500_000 ? 'RareName Zeta' : id === 100 ? 'CommonName Smith' : `Customer ${index}`;
        const number = id === 500_000 ? 'RARE-500000' : `C-${index}`;
        insertCustomer.run(name, number);
      }
    })();
    if (logProgress && batchEnd % 100_000 === 0) {
      // eslint-disable-next-line no-console
      console.info('[scale-seed] customers', batchEnd);
    }
  }

  const heavyCustomerIds = pickHeavyIds(profile.customerCount);
  const mediumCustomerIds = pickMediumIds(profile.customerCount);
  const heavySet = new Set(heavyCustomerIds);
  const mediumSet = new Set(mediumCustomerIds);
  const zeroActivityCustomerIds = [10, 20, 30, 40, 50].filter((id) => id <= profile.customerCount);

  let lightCustomerCount = 0;
  for (let id = 1; id <= profile.customerCount; id += 1) {
    if (isZeroActivityCustomer(id) || heavySet.has(id) || mediumSet.has(id)) {
      continue;
    }
    lightCustomerCount += 1;
  }

  const heavyBudget = Math.min(1_000_000, Math.floor(profile.transactionCount * 0.2));
  const mediumBudget = Math.min(1_000_000, Math.floor(profile.transactionCount * 0.2));
  const perHeavy =
    heavyCustomerIds.length > 0 ? Math.floor(heavyBudget / heavyCustomerIds.length) : 0;
  const perMedium =
    mediumCustomerIds.length > 0 ? Math.floor(mediumBudget / mediumCustomerIds.length) : 0;
  const assignedHeavy = perHeavy * heavyCustomerIds.length;
  const assignedMedium = perMedium * mediumCustomerIds.length;
  const remaining = Math.max(0, profile.transactionCount - assignedHeavy - assignedMedium);
  const perLight = lightCustomerCount > 0 ? Math.floor(remaining / lightCustomerCount) : 0;
  let remainder = remaining - perLight * lightCustomerCount;

  const currencies = ['AFN', 'USD', 'EUR'] as const;
  const types = ['CASH_IN', 'CASH_OUT'] as const;
  let insertedTransactions = 0;
  const rowBatchSize = 800;

  const placeholdersSql = (count: number): string =>
    Array.from({ length: count }, () => '(?, ?, ?, ?, ?, ?)').join(', ');

  const flushRows = (rows: Array<Array<string | number | null>>): void => {
    if (rows.length === 0) {
      return;
    }
    const sql = `INSERT INTO transactions (customer_id, type, currency_code, amount, note, transaction_date) VALUES ${placeholdersSql(rows.length)}`;
    const params: Array<string | number | null> = [];
    for (const row of rows) {
      params.push(...row);
    }
    db.prepare(sql).run(...params);
    insertedTransactions += rows.length;
    if (logProgress && insertedTransactions % 500_000 < rowBatchSize) {
      // eslint-disable-next-line no-console
      console.info('[scale-seed] transactions', insertedTransactions);
    }
  };

  const insertVolume = (customerIds: number[], perCustomer: number, amountBase: number): void => {
    if (perCustomer <= 0 || customerIds.length === 0) {
      return;
    }
    let rows: Array<Array<string | number | null>> = [];
    let pending = 0;
    const commitChunk = db.transaction(() => {
      flushRows(rows);
      rows = [];
      pending = 0;
    });

    for (const customerId of customerIds) {
      for (let i = 0; i < perCustomer; i += 1) {
        const seq = insertedTransactions + pending;
        const type = types[seq % types.length]!;
        const currency = currencies[seq % currencies.length]!;
        const day = (seq % 28) + 1;
        rows.push([
          customerId,
          type,
          currency,
          `${((seq % 500) + amountBase).toFixed(4)}`,
          seq % 17 === 0 ? `note-${seq}` : null,
          `2025-${String((seq % 12) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} 12:00:00`,
        ]);
        pending += 1;
        if (rows.length >= rowBatchSize) {
          commitChunk();
        }
      }
    }
    if (rows.length > 0) {
      commitChunk();
    }
  };

  insertVolume(heavyCustomerIds, perHeavy, 100);
  insertVolume(mediumCustomerIds, perMedium, 50);

  let lightRows: Array<Array<string | number | null>> = [];
  let lightPending = 0;
  const flushLight = db.transaction(() => {
    flushRows(lightRows);
    lightRows = [];
    lightPending = 0;
  });

  for (let id = 1; id <= profile.customerCount; id += 1) {
    if (isZeroActivityCustomer(id) || heavySet.has(id) || mediumSet.has(id)) {
      continue;
    }
    let count = perLight;
    if (remainder > 0) {
      count += 1;
      remainder -= 1;
    }
    for (let i = 0; i < count; i += 1) {
      const seq = insertedTransactions + lightPending;
      const type = types[seq % types.length]!;
      const currency = currencies[seq % currencies.length]!;
      const day = (seq % 28) + 1;
      lightRows.push([
        id,
        type,
        currency,
        `${((seq % 500) + 10).toFixed(4)}`,
        seq % 17 === 0 ? `note-${seq}` : null,
        `2025-${String((seq % 12) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} 12:00:00`,
      ]);
      lightPending += 1;
      if (lightRows.length >= rowBatchSize) {
        flushLight();
      }
    }
  }
  if (lightRows.length > 0) {
    flushLight();
  }

  const transferPairs = Math.min(500, Math.floor(profile.transactionCount / 2000));
  const insertOne = db.prepare(
    `INSERT INTO transactions (customer_id, type, currency_code, amount, note, transaction_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (let pair = 0; pair < transferPairs; pair += 1) {
      const fromId = heavyCustomerIds[pair % heavyCustomerIds.length] ?? 1;
      const toId = mediumCustomerIds[pair % mediumCustomerIds.length] ?? 2;
      if (fromId === toId) {
        continue;
      }
      const amount = `${(pair % 100) + 1}.0000`;
      const date = `2026-01-${String((pair % 28) + 1).padStart(2, '0')} 09:00:00`;
      insertOne.run(fromId, 'CASH_OUT', 'AFN', amount, 'transfer-out', date);
      insertOne.run(toId, 'CASH_IN', 'AFN', amount, 'transfer-in', date);
      insertedTransactions += 2;
    }
  })();

  db.pragma('synchronous = NORMAL');
  db.pragma('wal_checkpoint(TRUNCATE)');

  const quick = db.pragma('quick_check', { simple: true });
  if (quick !== 'ok') {
    throw new Error(`Database quick_check failed after seed: ${quick}`);
  }

  if (logProgress) {
    // eslint-disable-next-line no-console
    console.info('[scale-seed] done', {
      customers: profile.customerCount,
      transactions: insertedTransactions,
      seedMs: Math.round(performance.now() - started),
    });
  }

  return {
    heavyCustomerIds,
    zeroActivityCustomerIds,
    mediumCustomerIds,
    rareSearchCustomerId: Math.min(500_000, profile.customerCount),
    commonSearchCustomerId: Math.min(100, profile.customerCount),
    exactSearchNumber: 'C-100',
    seedMs: performance.now() - started,
    transactionCount: insertedTransactions,
    customerCount: profile.customerCount,
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
