import type Database from 'better-sqlite3';

export interface CompanyProfileRecord {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  logo_filename: string | null;
  configured: number;
  created_at: string;
  updated_at: string;
}

export class CompanyRepository {
  constructor(private readonly db: Database.Database) {}

  get(): CompanyProfileRecord {
    const row = this.db
      .prepare(
        `SELECT id, name, phone, email, address, website, notes, logo_filename, configured, created_at, updated_at
         FROM company_profile WHERE id = 1`,
      )
      .get() as CompanyProfileRecord | undefined;

    if (row) {
      return row;
    }

    this.db.prepare('INSERT OR IGNORE INTO company_profile (id, configured) VALUES (1, 0)').run();
    return this.get();
  }

  update(input: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    website: string | null;
    notes: string | null;
  }): void {
    this.db
      .prepare(
        `UPDATE company_profile
         SET name = ?,
             phone = ?,
             email = ?,
             address = ?,
             website = ?,
             notes = ?,
             configured = 1,
             updated_at = datetime('now')
         WHERE id = 1`,
      )
      .run(input.name, input.phone, input.email, input.address, input.website, input.notes);
  }

  updateLogoFilename(filename: string | null): void {
    this.db
      .prepare(
        `UPDATE company_profile
         SET logo_filename = ?, updated_at = datetime('now')
         WHERE id = 1`,
      )
      .run(filename);
  }
}
