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
  private isPartial = false;

  constructor(
    private handler: MockHandler,
    private matcher: MockMatcher
  ) {}

  partial(): this {
    if (this.matcher.type !== "sql-exact") {
      throw new Error(".partial() can only be used with .on() (exact SQL matchers)");
    }
    this.isPartial = true;
    return this;
  }

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
