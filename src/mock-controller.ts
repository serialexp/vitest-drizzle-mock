// ABOUTME: Provides the public API for registering mock responses on drizzle queries.
// ABOUTME: Supports both SQL-based matching (via query builders) and structural matching (via callbacks).

import type { Table } from "drizzle-orm";
import { MockHandler, normalizeSql } from "./mock-handler.js";
import type { MockEntry, MockHandle, MockMatcher, RecordedCall, SqlFragment } from "./types.js";

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

const relationalEntityKinds = new Set([
  "PgRelationalQuery",
  "MySqlRelationalQuery",
  "SQLiteAsyncRelationalQuery",
  "SQLiteSyncRelationalQuery",
]);

function extractStructuralMatcher(queryBuilder: any): MockMatcher {
  const entityKind = queryBuilder.constructor[EntityKind] ?? queryBuilder[EntityKind];

  if (relationalEntityKinds.has(entityKind)) {
    return extractRelationalMatcher(queryBuilder);
  }

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

function extractRelationalMatcher(queryBuilder: any): MockMatcher {
  const table = queryBuilder.table;

  if (!table) {
    throw new Error(
      `Cannot extract structural matcher: no table found on relational query builder.`
    );
  }

  const operation = queryBuilder.mode === "first" ? "findFirst" : "findMany";

  return {
    type: "structural",
    operation,
    tableName: table[TableName],
    tableSchema: table[TableSchema],
  };
}

export class MockController<TDb = any> {
  private dialect: any;

  constructor(private handler: MockHandler, private db: TDb) {
    this.dialect = (db as any).dialect;
  }

  get calls(): RecordedCall[] {
    return this.handler.calls;
  }

  on(callback: (db: TDb) => any): MockBuilder;
  on(queryBuilder: QueryLike): MockBuilder;
  on(queryBuilderOrCallback: QueryLike | ((db: TDb) => any)): MockBuilder {
    if (typeof queryBuilderOrCallback === "function") {
      const queryBuilder = queryBuilderOrCallback(this.db);
      const matcher = extractStructuralMatcher(queryBuilder);
      return new MockBuilder(this.handler, matcher, this.dialect);
    }

    const { sql, params } = queryBuilderOrCallback.toSQL();
    return new MockBuilder(this.handler, {
      type: "sql-exact",
      sql: normalizeSql(sql),
      params,
    }, this.dialect);
  }

  onInsert<TTable extends Table>(table: TTable): MockInsertBuilder<TTable> {
    return new MockInsertBuilder<TTable>(this.handler, this.structuralMatcherForTable(table, "insert"), this.dialect);
  }

  onUpdate<TTable extends Table>(table: TTable): MockUpdateBuilder<TTable> {
    return new MockUpdateBuilder<TTable>(this.handler, this.structuralMatcherForTable(table, "update"), this.dialect);
  }

  onDelete(table: Table): MockBuilder {
    return new MockBuilder(this.handler, this.structuralMatcherForTable(table, "delete"), this.dialect);
  }

  onSelect(table: Table): MockBuilder {
    return new MockBuilder(this.handler, this.structuralMatcherForTable(table, "select"), this.dialect);
  }

  onFindFirst(table: Table): MockBuilder {
    return new MockBuilder(this.handler, this.structuralMatcherForTable(table, "findFirst"), this.dialect);
  }

  onFindMany(table: Table): MockBuilder {
    return new MockBuilder(this.handler, this.structuralMatcherForTable(table, "findMany"), this.dialect);
  }

  private structuralMatcherForTable(table: Table, operation: string): MockMatcher {
    const tableName: string = (table as any)[TableName];
    const tableSchema: string | undefined = (table as any)[TableSchema];
    return { type: "structural", operation, tableName, tableSchema };
  }

  onSql(pattern: RegExp): MockBuilder {
    return new MockBuilder(this.handler, {
      type: "sql-pattern",
      pattern,
    }, this.dialect);
  }

  onSqlContaining(substring: string): MockBuilder {
    return new MockBuilder(this.handler, {
      type: "sql-contains",
      substring,
    }, this.dialect);
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

// Strip table/alias prefixes: "table"."col" → "col"
function stripTablePrefixes(sql: string): string {
  return sql.replace(/"[^"]+"\."([^"]+)"/g, '"$1"');
}

// Replace positional params ($1, $2, etc.) with ?
function normalizeParamPlaceholders(sql: string): string {
  return sql.replace(/\$\d+/g, "?");
}

function serializeSqlFragment(dialect: any, expr: any): SqlFragment {
  const sqlObj = typeof expr.getSQL === "function" ? expr.getSQL() : expr;
  const { sql, params } = dialect.sqlToQuery(sqlObj);
  const normalizedSql = normalizeParamPlaceholders(stripTablePrefixes(sql));
  return { normalizedSql, params };
}

export class MockBuilder {
  private matchParams = false;
  private isOnce = false;
  private isPartial = false;
  private fragments: SqlFragment[] = [];
  private registeredEntry?: MockEntry;

  constructor(
    private handler: MockHandler,
    protected matcher: MockMatcher,
    private dialect: any,
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

  containingSql(expr: any): this {
    if (this.matcher.type !== "structural") {
      throw new Error(".containingSql() can only be used with structural matchers (callback-based .on())");
    }
    this.fragments.push(serializeSqlFragment(this.dialect, expr));
    return this;
  }

  once(): this {
    this.isOnce = true;
    return this;
  }

  handle(): MockHandle {
    if (!this.registeredEntry) {
      throw new Error(".handle() can only be called after .respondOnce()");
    }
    return this.registeredEntry.handle;
  }

  respondOnce(data: unknown): this {
    if (!this.registeredEntry) {
      const handle = createMockHandle();
      const matcher = this.buildMatcher();
      this.registeredEntry = {
        matcher,
        response: { type: "data", data: undefined },
        responseQueue: [{ type: "data", data }],
        once: true,
        consumed: false,
        handle,
      };
      this.handler.register(this.registeredEntry);
    } else {
      this.registeredEntry.responseQueue!.push({ type: "data", data });
    }
    return this;
  }

  respond(data: unknown): MockHandle {
    if (this.registeredEntry) {
      this.registeredEntry.response = { type: "data", data };
      this.registeredEntry.once = false;
      return this.registeredEntry.handle;
    }
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
    if (this.registeredEntry) {
      this.registeredEntry.response = { type: "function", fn };
      this.registeredEntry.once = false;
      return this.registeredEntry.handle;
    }
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
      if (this.fragments.length > 0) {
        return { ...this.matcher, sqlFragments: this.fragments };
      }
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

export class MockInsertBuilder<TTable extends Table> extends MockBuilder {
  values(value: { [K in keyof TTable['$inferInsert']]?: any }): this {
    if (this.matcher.type === "structural") {
      this.matcher.columnKeys = Object.keys(value);
    }
    return this;
  }
}

export class MockUpdateBuilder<TTable extends Table> extends MockBuilder {
  set(values: { [K in keyof TTable['$inferInsert']]?: any }): this {
    if (this.matcher.type === "structural") {
      this.matcher.columnKeys = Object.keys(values);
    }
    return this;
  }
}
