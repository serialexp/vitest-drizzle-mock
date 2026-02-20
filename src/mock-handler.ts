import type { MockEntry, MockMatcher, RecordedCall } from "./types.js";

export class MockHandler {
  private mocks: MockEntry[] = [];
  private recordedCalls: RecordedCall[] = [];

  get calls(): RecordedCall[] {
    return this.recordedCalls;
  }

  register(entry: MockEntry): void {
    this.mocks.push(entry);
  }

  async handle(sql: string, params: unknown[]): Promise<unknown> {
    const normalizedSql = normalizeSql(sql);

    this.recordedCalls.push({
      sql: normalizedSql,
      params,
      timestamp: Date.now(),
    });

    let bestMatch: { mock: MockEntry; specificity: number; index: number } | undefined;

    for (let i = this.mocks.length - 1; i >= 0; i--) {
      const mock = this.mocks[i];
      if (mock.consumed) continue;
      if (this.matches(mock.matcher, normalizedSql, params)) {
        const specificity = matcherSpecificity(mock.matcher);
        if (!bestMatch || specificity > bestMatch.specificity) {
          bestMatch = { mock, specificity, index: i };
        }
      }
    }

    if (bestMatch) {
      const { mock } = bestMatch;
      if (mock.once) mock.consumed = true;
      if (mock.error) throw mock.error;
      return this.resolveResponse(mock, normalizedSql, params);
    }

    const registered =
      this.mocks.length > 0
        ? `\n\nRegistered mocks:\n${this.mocks.map((m) => `  - ${formatMatcher(m.matcher)}`).join("\n")}`
        : "";

    throw new Error(
      `No mock registered for query:\n  SQL: ${normalizedSql}\n  Params: ${JSON.stringify(params)}${registered}`
    );
  }

  private matches(
    matcher: MockMatcher,
    sql: string,
    params: unknown[]
  ): boolean {
    switch (matcher.type) {
      case "sql-exact": {
        const sqlMatch = normalizeSql(matcher.sql) === sql;
        if (!sqlMatch) return false;
        if (matcher.params !== undefined) {
          return paramsEqual(matcher.params, params);
        }
        return true;
      }
      case "sql-starts-with": {
        const prefixMatch = sql.startsWith(normalizeSql(matcher.sql));
        if (!prefixMatch) return false;
        if (matcher.params !== undefined) {
          return paramsEqual(matcher.params, params);
        }
        return true;
      }
      case "sql-pattern": {
        const patternMatch = matcher.pattern.test(sql);
        if (!patternMatch) return false;
        if (matcher.params !== undefined) {
          return paramsEqual(matcher.params, params);
        }
        return true;
      }
      case "sql-contains": {
        const containsMatch = sql.includes(matcher.substring);
        if (!containsMatch) return false;
        if (matcher.params !== undefined) {
          return paramsEqual(matcher.params, params);
        }
        return true;
      }
    }
  }

  private async resolveResponse(
    mock: MockEntry,
    sql: string,
    params: unknown[]
  ): Promise<unknown> {
    if (mock.response.type === "function") {
      return mock.response.fn(sql, params);
    }
    return mock.response.data;
  }

  reset(): void {
    this.mocks = [];
    this.recordedCalls = [];
  }

  resetCalls(): void {
    this.recordedCalls = [];
  }

  resetMocks(): void {
    this.mocks = [];
  }
}

export function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function paramsEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function matcherSpecificity(matcher: MockMatcher): number {
  switch (matcher.type) {
    case "sql-exact":
      return matcher.params !== undefined ? 5 : 4;
    case "sql-starts-with":
      return matcher.params !== undefined ? 3 : 2;
    case "sql-pattern":
    case "sql-contains":
      return 1;
  }
}

function formatMatcher(matcher: MockMatcher): string {
  switch (matcher.type) {
    case "sql-exact":
      return `exact: "${matcher.sql}"${matcher.params ? ` params: ${JSON.stringify(matcher.params)}` : ""}`;
    case "sql-starts-with":
      return `partial: "${matcher.sql}"${matcher.params ? ` params: ${JSON.stringify(matcher.params)}` : ""}`;
    case "sql-pattern":
      return `pattern: ${matcher.pattern}`;
    case "sql-contains":
      return `contains: "${matcher.substring}"`;
  }
}
