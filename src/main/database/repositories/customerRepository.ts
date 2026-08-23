import type Database from 'better-sqlite3';

export interface CustomerRecord {
  id: number;
  name: string | null;
  customer_number: string | null;
  photo_filename: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerRecordInput {
  name: string | null;
  customerNumber: string | null;
}

export interface UpdateCustomerRecordInput {
  name: string | null;
  customerNumber: string | null;
}

const CUSTOMER_COLUMNS =
  'id, name, customer_number, photo_filename, created_at, updated_at';

const LIST_ORDER = 'ORDER BY datetime(created_at) DESC, id DESC';

export class CustomerRepository {
  constructor(private readonly db: Database.Database) {}

  createCustomer(input: CreateCustomerRecordInput): number {
    const result = this.db
      .prepare('INSERT INTO customers (name, customer_number) VALUES (?, ?)')
      .run(input.name, input.customerNumber);
    return Number(result.lastInsertRowid);
  }

  getCustomerById(id: number): CustomerRecord | undefined {
    return this.db
      .prepare(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = ?`)
      .get(id) as CustomerRecord | undefined;
  }

  getCustomersByCustomerNumber(customerNumber: string): CustomerRecord[] {
    return this.db
      .prepare(
        `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE customer_number = ? COLLATE NOCASE ${LIST_ORDER}`,
      )
      .all(customerNumber) as CustomerRecord[];
  }

  getCustomersByName(name: string): CustomerRecord[] {
    return this.db
      .prepare(
        `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE name = ? COLLATE NOCASE ${LIST_ORDER}`,
      )
      .all(name) as CustomerRecord[];
  }

  listCustomers(): CustomerRecord[] {
    return this.db
      .prepare(`SELECT ${CUSTOMER_COLUMNS} FROM customers ${LIST_ORDER}`)
      .all() as CustomerRecord[];
  }

  searchCustomers(likePattern: string): CustomerRecord[] {
    return this.db
      .prepare(
        `SELECT ${CUSTOMER_COLUMNS}
         FROM customers
         WHERE name LIKE ? ESCAPE '!' COLLATE NOCASE
            OR customer_number LIKE ? ESCAPE '!' COLLATE NOCASE
         ${LIST_ORDER}`,
      )
      .all(likePattern, likePattern) as CustomerRecord[];
  }

  updateCustomer(id: number, input: UpdateCustomerRecordInput): boolean {
    const result = this.db
      .prepare(
        `UPDATE customers
         SET name = ?, customer_number = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(input.name, input.customerNumber, id);
    return result.changes > 0;
  }

  updatePhotoFilename(id: number, photoFilename: string | null): boolean {
    const result = this.db
      .prepare(
        `UPDATE customers
         SET photo_filename = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(photoFilename, id);
    return result.changes > 0;
  }

  deleteCustomer(id: number): boolean {
    const result = this.db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
