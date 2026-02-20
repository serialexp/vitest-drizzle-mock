export interface RecordedCall {
  sql: string;
  params: unknown[];
  timestamp: number;
}

export type MockMatcher =
  | { type: "sql-exact"; sql: string; params?: unknown[] }
  | { type: "sql-starts-with"; sql: string; params?: unknown[] }
  | { type: "sql-pattern"; pattern: RegExp; params?: unknown[] }
  | { type: "sql-contains"; substring: string; params?: unknown[] }
  | { type: "structural"; operation: string; tableName: string; tableSchema: string | undefined; columnKeys?: string[]; sqlFragments?: SqlFragment[] };

export interface SqlFragment {
  normalizedSql: string;
  params: unknown[];
}

export interface CapturedConfig {
  operation: string;
  tableName: string;
  tableSchema: string | undefined;
  columnKeys: string[];
}

export type MockResponse =
  | { type: "data"; data: unknown }
  | { type: "function"; fn: (sql: string, params: unknown[]) => unknown };

export interface MockHandle {
  mock: {
    calls: [sql: string, params: unknown[]][];
  };
}

export interface MockEntry {
  matcher: MockMatcher;
  response: MockResponse;
  responseQueue?: MockResponse[];
  error?: Error;
  once: boolean;
  consumed: boolean;
  handle: MockHandle;
}
