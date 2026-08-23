import { randomUUID } from 'node:crypto';

export interface Session {
  id: string;
  userId: number;
  username: string;
  createdAt: Date;
  lastActivityAt: Date;
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly idleTimeoutMs: number;

  constructor(idleTimeoutMs: number) {
    this.idleTimeoutMs = idleTimeoutMs;
  }

  create(userId: number, username: string): Session {
    const session: Session = {
      id: randomUUID(),
      userId,
      username,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    if (this.isExpired(session)) {
      this.sessions.delete(sessionId);
      return undefined;
    }

    session.lastActivityAt = new Date();
    return session;
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  clear(): void {
    this.sessions.clear();
  }

  private isExpired(session: Session): boolean {
    return Date.now() - session.lastActivityAt.getTime() > this.idleTimeoutMs;
  }
}
