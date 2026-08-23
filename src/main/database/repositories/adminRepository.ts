import type Database from 'better-sqlite3';

export interface AdminUserRecord {
  id: number;
  username: string;
  password_hash: string;
  recovery_question: string | null;
  recovery_answer_hash: string | null;
  created_at: string;
  updated_at: string;
}

export class AdminRepository {
  constructor(private readonly db: Database.Database) {}

  countAdmins(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM admin_users').get() as {
      count: number;
    };
    return row.count;
  }

  findByUsername(username: string): AdminUserRecord | undefined {
    return this.db
      .prepare(
        `SELECT id, username, password_hash, recovery_question, recovery_answer_hash, created_at, updated_at
         FROM admin_users WHERE username = ?`,
      )
      .get(username) as AdminUserRecord | undefined;
  }

  updatePasswordHash(id: number, passwordHash: string): void {
    this.db
      .prepare(
        `UPDATE admin_users
         SET password_hash = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(passwordHash, id);
  }

  updateRecovery(id: number, question: string, answerHash: string): void {
    this.db
      .prepare(
        `UPDATE admin_users
         SET recovery_question = ?, recovery_answer_hash = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(question, answerHash, id);
  }

  createAdmin(username: string, passwordHash: string): number {
    const result = this.db
      .prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)')
      .run(username, passwordHash);
    return Number(result.lastInsertRowid);
  }
}
