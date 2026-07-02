import { createClient, type Client } from '@libsql/client';

const globalForDb = globalThis as unknown as {
  db: ShifruDB | undefined
}

class ShifruDB {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  // ============ RAW ============
  async execute(sql: string, args?: Record<string, unknown> | unknown[]) {
    return this.client.execute({ sql, args: args as any });
  }

  // ============ USER ============
  get user() {
    return {
      findUnique: async ({ where }: { where: { id?: string; login?: string } }) => {
        if (where.id) {
          const r = await this.client.execute({ sql: 'SELECT * FROM "User" WHERE id = ?', args: [where.id] });
          return r.rows[0] ? this.mapUser(r.rows[0]) : null;
        }
        if (where.login) {
          const r = await this.client.execute({ sql: 'SELECT * FROM "User" WHERE login = ?', args: [where.login] });
          return r.rows[0] ? this.mapUser(r.rows[0]) : null;
        }
        return null;
      },
      findMany: async ({ where, select, include, orderBy }: any) => {
        let sql = 'SELECT ';
        const cols = this.buildSelect('User', select, include);
        sql += cols;
        sql += ' FROM "User" u';
        const { sql: whereSql, args } = this.buildWhere('u', where, 'User');
        if (whereSql) sql += ' WHERE ' + whereSql;
        if (orderBy) sql += ' ORDER BY ' + this.buildOrderBy('u', orderBy);
        const r = await this.client.execute({ sql, args });
        return r.rows.map((row: any) => this.mapUser(row, select));
      },
      count: async () => {
        const r = await this.client.execute({ sql: 'SELECT COUNT(*) as c FROM "User"' });
        return Number(r.rows[0].c);
      },
      create: async ({ data }: { data: any }) => {
        const cols = Object.keys(data).map(k => `"${k}"`).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        const vals = Object.values(data);
        await this.client.execute({ sql: `INSERT INTO "User" (${cols}) VALUES (${placeholders})`, args: vals });
        if (data.login) return this.user.findUnique({ where: { login: data.login } });
        return null;
      },
      update: async ({ where, data }: { where: any; data: any }) => {
        const sets = Object.keys(data).map(k => `"${k}" = ?`).join(', ');
        const vals = [...Object.values(data)];
        if (where.id) { vals.push(where.id); await this.client.execute({ sql: `UPDATE "User" SET ${sets} WHERE id = ?`, args: vals }); }
        else if (where.login) { vals.push(where.login); await this.client.execute({ sql: `UPDATE "User" SET ${sets} WHERE login = ?`, args: vals }); }
        return this.user.findUnique({ where });
      },
    };
  }

  // ============ CHAT ============
  get chat() {
    return {
      findMany: async ({ where, select, include, orderBy }: any) => {
        let sql = 'SELECT ';
        sql += this.buildSelect('Chat', select, include);
        sql += ' FROM "Chat" c';
        const joins: string[] = [];
        const args: any[] = [];
        if (where?.members?.some) {
          joins.push(`INNER JOIN "_ChatToUser" ctu ON ctu."A" = c.id INNER JOIN "User" mu ON mu.id = ctu."B" AND mu.id = ?`);
          args.push(where.members.some.id);
        }
        sql += ' ' + joins.join(' ');
        const { sql: whereSql, args: wArgs } = this.buildWhere('c', where, 'Chat');
        if (whereSql) sql += ' WHERE ' + whereSql;
        args.push(...wArgs);
        if (orderBy) sql += ' ORDER BY ' + this.buildOrderBy('c', orderBy);
        const r = await this.client.execute({ sql, args });
        return r.rows.map((row: any) => this.mapRow(row, 'Chat', select));
      },
      findFirst: async ({ where }: { where: any }) => {
        const { sql, args } = this.buildWhere('c', where, 'Chat');
        const r = await this.client.execute({ sql: `SELECT * FROM "Chat" c WHERE ${sql} LIMIT 1`, args });
        return r.rows[0] ? this.mapRow(r.rows[0], 'Chat', null) : null;
      },
      create: async ({ data, include }: { data: any; include?: any }) => {
        const cols = Object.keys(data).map(k => `"${k}"`).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        const vals = Object.values(data);
        await this.client.execute({ sql: `INSERT INTO "Chat" (${cols}) VALUES (${placeholders})`, args: vals });
        // Handle members relation
        if (data.members?.connect) {
          for (const m of data.members.connect) {
            await this.client.execute({ sql: 'INSERT OR IGNORE INTO "_ChatToUser" ("A", "B") VALUES (?, ?)', args: [data.id || vals[0], m.id] });
          }
        }
        return this.chat.findFirst({ where: { id: data.id || vals[0] } });
      },
      delete: async ({ where }: { where: { id: string } }) => {
        await this.client.execute({ sql: 'DELETE FROM "Chat" WHERE id = ?', args: [where.id] });
      },
    };
  }

  // ============ API KEY ============
  get apiKey() {
    return {
      findMany: async ({ where, select }: { where: any; select?: any }) => {
        let sql = 'SELECT * FROM "ApiKey" WHERE "userId" = ?';
        const r = await this.client.execute({ sql, args: [where.userId] });
        return r.rows.map((row: any) => this.mapRow(row, 'ApiKey', select));
      },
      create: async ({ data }: { data: any }) => {
        const cols = Object.keys(data).map(k => `"${k}"`).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        await this.client.execute({ sql: `INSERT INTO "ApiKey" (${cols}) VALUES (${placeholders})`, args: Object.values(data) });
        return { id: 'created', ...data };
      },
      findFirst: async ({ where }: { where: any }) => {
        const r = await this.client.execute({ sql: 'SELECT * FROM "ApiKey" WHERE id = ? AND "userId" = ?', args: [where.id, where.userId] });
        return r.rows[0] ? this.mapRow(r.rows[0], 'ApiKey', null) : null;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        await this.client.execute({ sql: 'DELETE FROM "ApiKey" WHERE id = ?', args: [where.id] });
      },
    };
  }

  // ============ ENCRYPTION LOG ============
  get encryptionLog() {
    return {
      create: async ({ data }: { data: any }) => {
        const cols = Object.keys(data).map(k => `"${k}"`).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        await this.client.execute({ sql: `INSERT INTO "EncryptionLog" (${cols}) VALUES (${placeholders})`, args: Object.values(data) });
        return { id: 'logged', ...data };
      },
    };
  }

  // ============ RATE LIMIT ============
  get rateLimit() {
    return {
      upsert: async ({ where, create, update }: any) => {
        const key = where.userId + '_' + where.period + '_' + where.periodKey;
        await this.client.execute({
          sql: `INSERT INTO "RateLimit" (id, "userId", period, "periodKey", count, "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
                ON CONFLICT("userId", period, "periodKey") DO UPDATE SET count = count + 1, "updatedAt" = datetime('now')`,
          args: [key, where.userId, where.period, where.periodKey]
        });
        const r = await this.client.execute({
          sql: 'SELECT count FROM "RateLimit" WHERE "userId" = ? AND period = ? AND "periodKey" = ?',
          args: [where.userId, where.period, where.periodKey]
        });
        return { count: r.rows[0]?.count ?? 0 };
      },
      findFirst: async ({ where }: { where: any }) => {
        const r = await this.client.execute({
          sql: 'SELECT count FROM "RateLimit" WHERE "userId" = ? AND period = ? AND "periodKey" = ?',
          args: [where.userId, where.period, where.periodKey]
        });
        return r.rows[0] ? { count: Number(r.rows[0].count) } : null;
      },
    };
  }

  // ============ HELPERS ============
  private buildSelect(table: string, select: any, include: any): string {
    if (select) {
      return Object.keys(select).map(k => `"${k}"`).join(', ');
    }
    return '*';
  }

  private buildWhere(alias: string, where: any, table: string): { sql: string; args: any[] } {
    if (!where) return { sql: '', args: [] };
    const conditions: string[] = [];
    const args: any[] = [];
    for (const [key, val] of Object.entries(where)) {
      if (key === 'members') continue; // handled via JOIN
      if (val && typeof val === 'object') {
        if ('not' in (val as any)) {
          conditions.push(`${alias}."${key}" != ?`);
          args.push((val as any).not);
        } else if ('in' in (val as any)) {
          const placeholders = (val as any).in.map(() => '?').join(',');
          conditions.push(`${alias}."${key}" IN (${placeholders})`);
          args.push(...(val as any).in);
        }
      } else {
        conditions.push(`${alias}."${key}" = ?`);
        args.push(val);
      }
    }
    return { sql: conditions.join(' AND '), args };
  }

  private buildOrderBy(alias: string, orderBy: any): string {
    if (!orderBy) return '';
    const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
    return entries.map((o: any) => {
      const col = Object.keys(o)[0];
      return `${alias}."${col}" ${o[col] === 'desc' ? 'DESC' : 'ASC'}`;
    }).join(', ');
  }

  private mapUser(row: any, select?: any): any {
    const u: any = {
      id: row.id,
      login: row.login,
      passwordHash: row.passwordHash,
      masterKeySalt: row.masterKeySalt,
      isVerified: Boolean(row.isVerified),
      isAdmin: Boolean(row.isAdmin),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    if (select) {
      const filtered: any = {};
      for (const k of Object.keys(select)) {
        if (u[k] !== undefined) filtered[k] = u[k];
      }
      return filtered;
    }
    return u;
  }

  private mapRow(row: any, table: string, select: any): any {
    if (select) {
      const filtered: any = {};
      for (const k of Object.keys(select)) {
        if (row[k] !== undefined) filtered[k] = row[k];
      }
      return filtered;
    }
    const mapped: any = { ...row };
    // Convert boolean strings
    for (const k of Object.keys(mapped)) {
      if (mapped[k] === 1 || mapped[k] === 0) {
        mapped[k] = Boolean(mapped[k]);
      }
    }
    return mapped;
  }
}

function createDB(): ShifruDB {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl) {
    throw new Error('TURSO_DATABASE_URL not set');
  }

  const client = createClient({
    url: tursoUrl,
    authToken: tursoToken || '',
  });
  return new ShifruDB(client);
}

// Lazy init — connect only on first actual API call, not at build time
let _db: ShifruDB | undefined;
function getDB(): ShifruDB {
  if (!_db) {
    _db = createDB();
    if (process.env.NODE_ENV !== 'production') {
      (globalThis as any).db = _db;
    }
  }
  return _db;
}

export const db = new Proxy({} as ShifruDB, {
  get(_target, prop) {
    const instance = getDB();
    const val = (instance as any)[prop];
    if (typeof val === 'function') return val.bind(instance);
    return val;
  },
});