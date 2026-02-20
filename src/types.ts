export interface RecordedCall {
  sql: string;
  params: unknown[];
  timestamp: number;
}

export type MockMatcher =
  | { type: "sql-exact"; sql: string; params?: unknown[] }
  | { type: "sql-starts-with"; sql: string; params?: unknown[] }
  | { type: "sql-pattern"; pattern: RegExp; params?: unknown[] }
  | { type: "sql-contains"; substring: string; params?: unknown[] };

export type MockResponse =
  | { type: "data"; data: unknown }
  | { type: "function"; fn: (sql: string, params: unknown[]) => unknown };

export interface MockEntry {
  matcher: MockMatcher;
  response: MockResponse;
  error?: Error;
  once: boolean;
  consumed: boolean;
}
