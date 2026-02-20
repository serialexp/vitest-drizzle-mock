// ABOUTME: Provides the public API for registering mock responses on drizzle queries.
// ABOUTME: Supports both SQL-based matching (via query builders) and structural matching (via callbacks).

import { MockHandler, normalizeSql } from "./mock-handler.js";
import type { MockHandle, MockMatcher, RecordedCall } from "./types.js";

export function createMockHandle(): MockHandle {
  const handle = Object.assign(function () {}, {
    _isMockFunction: true as const,
    getMockName: () => "mock",
    mock: {
      calls: [] as [sql: string, params: unknown[]][],
    },
  });
  return handle;
}

export interface QueryLike {
  toSQL(): { sql: string; params: unknown[] };
}

const EntityKind = Symbol.for("drizzle:entityKind");
const TableName = Symbol.for("drizzle:Name");
const TableSchema = Symbol.for("drizzle:Schema");

const operationByEntityKind: Record<string, string> = {
  PgUpdate: "update",
  MySqlUpdate: "update",
  SQLiteUpdate: "update",
  PgInsert: "insert",
  MySqlInsert: "insert",
  SQLiteInsert: "insert",
  PgDelete: "delete",
  MySqlDelete: "delete",
  SQLiteDelete: "delete",
  PgSelect: "select",
  PgSelectQueryBuilder: "select",
  MySqlSelect: "select",
  MySqlSelectQueryBuilder: "select",
  SQLiteSelect: "select",
  SQLiteSelectQueryBuilder: "select",
};

function extractStructuralMatcher(queryBuilder: any): MockMatcher {
  const entityKind = queryBuilder.constructor[EntityKind] ?? queryBuilder[EntityKind];
  const operation = entityKind ? operationByEntityKind[entityKind] : undefined;

  if (!operation) {
    throw new Error(
      `Cannot extract structural matcher: unknown entityKind "${entityKind}". ` +
      `The callback must return a drizzle query builder (e.g., db.update(...).set(...)).`
    );
  }

  const config = queryBuilder.config;
  const table = config?.table;

  if (!table) {
    throw new Error(
      `Cannot extract structural matcher: no table found on query builder config. ` +
      `Make sure the callback returns a complete query builder (e.g., db.select().from(table), not db.select()).`
    );
  }

  const tableName: string = table[TableName];
  const tableSchema: string | undefined = table[TableSchema];

  let columnKeys: string[] | undefined;
  if (operation === "update" && config.set) {
    columnKeys = Object.keys(config.set);
  } else if (operation === "insert" && config.values && Array.isArray(config.values) && config.values.length > 0) {
    columnKeys = Object.keys(config.values[0]);
  }

  return {
    type: "structural",
    operation,
    tableName,
    tableSchema,
    columnKeys,
  };
}

export class MockController<TDb = any> {
  constructor(private handler: MockHandler, private db: TDb) {}

  get calls(): RecordedCall[] {
    return this.handler.calls;
  }

  on(callback: (db: TDb) => any): MockBuilder;
  on(queryBuilder: QueryLike): MockBuilder;
  on(queryBuilderOrCallback: QueryLike | ((db: TDb) => any)): MockBuilder {
    if (typeof queryBuilderOrCallback === "function") {
      const queryBuilder = queryBuilderOrCallback(this.db);
      const matcher = extractStructuralMatcher(queryBuilder);
      return new MockBuilder(this.handler, matcher);
    }

    const { sql, params } = queryBuilderOrCallback.toSQL();
    return new MockBuilder(this.handler, {
      type: "sql-exact",
      sql: normalizeSql(sql),
      params,
    });
  }

  onSql(pattern: RegExp): MockBuilder {
    return new MockBuilder(this.handler, {
      type: "sql-pattern",
      pattern,
    });
  }

  onSqlContaining(substring: string): MockBuilder {
    return new MockBuilder(this.handler, {
      type: "sql-contains",
      substring,
    });
  }

  reset(): void {
    this.handler.reset();
  }

  resetCalls(): void {
    this.handler.resetCalls();
  }

  resetMocks(): void {
    this.handler.resetMocks();
  }
}

export class MockBuilder {
  private matchParams = false;
  private isOnce = false;
  private isPartial = false;

  constructor(
    private handler: MockHandler,
    private matcher: MockMatcher
  ) {}

  partial(): this {
    if (this.matcher.type === "structural") {
      throw new Error(".partial() cannot be used with structural matchers (callback-based .on())");
    }
    if (this.matcher.type !== "sql-exact") {
      throw new Error(".partial() can only be used with .on() (exact SQL matchers)");
    }
    this.isPartial = true;
    return this;
  }

  withExactParams(): this {
    if (this.matcher.type === "structural") {
      throw new Error(".withExactParams() cannot be used with structural matchers (callback-based .on())");
    }
    this.matchParams = true;
    return this;
  }

  once(): this {
    this.isOnce = true;
    return this;
  }

  respond(data: unknown): MockHandle {
    const handle = createMockHandle();
    const matcher = this.buildMatcher();
    this.handler.register({
      matcher,
      response: { type: "data", data },
      once: this.isOnce,
      consumed: false,
      handle,
    });
    return handle;
  }

  respondWith(fn: (sql: string, params: unknown[]) => unknown): MockHandle {
    const handle = createMockHandle();
    const matcher = this.buildMatcher();
    this.handler.register({
      matcher,
      response: { type: "function", fn },
      once: this.isOnce,
      consumed: false,
      handle,
    });
    return handle;
  }

  throw(error: Error): MockHandle {
    const handle = createMockHandle();
    const matcher = this.buildMatcher();
    this.handler.register({
      matcher,
      response: { type: "data", data: undefined },
      error,
      once: this.isOnce,
      consumed: false,
      handle,
    });
    return handle;
  }

  private buildMatcher(): MockMatcher {
    if (this.matcher.type === "structural") {
      return this.matcher;
    }
    if (this.matcher.type === "sql-exact") {
      const type = this.isPartial ? "sql-starts-with" as const : "sql-exact" as const;
      if (this.matchParams) {
        return { type, sql: this.matcher.sql, params: this.matcher.params };
      }
      return { type, sql: this.matcher.sql };
    }
    return this.matcher;
  }
}
