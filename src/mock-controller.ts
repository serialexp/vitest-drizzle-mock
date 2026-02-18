import { MockHandler, normalizeSql } from "./mock-handler.js";
import type { MockMatcher, RecordedCall } from "./types.js";

export interface QueryLike {
  toSQL(): { sql: string; params: unknown[] };
}

export class MockController {
  constructor(private handler: MockHandler) {}

  get calls(): RecordedCall[] {
    return this.handler.calls;
  }

  on(queryBuilder: QueryLike): MockBuilder {
    const { sql, params } = queryBuilder.toSQL();
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

  constructor(
    private handler: MockHandler,
    private matcher: MockMatcher
  ) {}

  withExactParams(): this {
    this.matchParams = true;
    return this;
  }

  once(): this {
    this.isOnce = true;
    return this;
  }

  respond(data: unknown): void {
    const matcher = this.buildMatcher();
    this.handler.register({
      matcher,
      response: { type: "data", data },
      once: this.isOnce,
      consumed: false,
    });
  }

  respondWith(fn: (sql: string, params: unknown[]) => unknown): void {
    const matcher = this.buildMatcher();
    this.handler.register({
      matcher,
      response: { type: "function", fn },
      once: this.isOnce,
      consumed: false,
    });
  }

  throw(error: Error): void {
    const matcher = this.buildMatcher();
    this.handler.register({
      matcher,
      response: { type: "data", data: undefined },
      error,
      once: this.isOnce,
      consumed: false,
    });
  }

  private buildMatcher(): MockMatcher {
    if (!this.matchParams && this.matcher.type === "sql-exact") {
      return { type: "sql-exact", sql: this.matcher.sql };
    }
    return this.matcher;
  }
}
