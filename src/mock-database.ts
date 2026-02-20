// ABOUTME: Intercepts a drizzle database instance to route queries through the mock handler.
// ABOUTME: Wraps dialect build methods to capture query configs for structural matching.

import {
  fillPlaceholders,
  TransactionRollbackError,
} from "drizzle-orm";
import { MockHandler } from "./mock-handler.js";
import { MockController } from "./mock-controller.js";
import type { CapturedConfig } from "./types.js";

interface Query {
  sql: string;
  params: unknown[];
}

const TableName = Symbol.for("drizzle:Name");
const TableSchema = Symbol.for("drizzle:Schema");

const operationByBuildMethod: Record<string, string> = {
  buildUpdateQuery: "update",
  buildInsertQuery: "insert",
  buildDeleteQuery: "delete",
  buildSelectQuery: "select",
};

function extractColumnKeys(operation: string, config: any): string[] {
  if (operation === "update" && config.set) {
    return Object.keys(config.set);
  }
  if (operation === "insert" && config.values && Array.isArray(config.values) && config.values.length > 0) {
    return Object.keys(config.values[0]);
  }
  return [];
}

function createMockPreparedQuery(handler: MockHandler, query: Query, capturedConfig: CapturedConfig | undefined) {
  const pq = {
    joinsNotNullableMap: undefined as Record<string, boolean> | undefined,

    async execute(
      placeholderValues?: Record<string, unknown>
    ): Promise<unknown> {
      const params =
        placeholderValues && Object.keys(placeholderValues).length > 0
          ? fillPlaceholders(query.params, placeholderValues)
          : query.params;
      return handler.handle(query.sql, params, capturedConfig);
    },

    setToken() {
      return pq;
    },

    getQuery(): Query {
      return query;
    },

    mapResult(response: unknown): unknown {
      return response;
    },

    isResponseInArrayMode(): boolean {
      return false;
    },

    async all(placeholderValues?: Record<string, unknown>): Promise<unknown> {
      return pq.execute(placeholderValues);
    },

    // SQLite-specific methods (run/get/values)
    async run(placeholderValues?: Record<string, unknown>): Promise<unknown> {
      return pq.execute(placeholderValues);
    },

    async get(placeholderValues?: Record<string, unknown>): Promise<unknown> {
      return pq.execute(placeholderValues);
    },

    async values(placeholderValues?: Record<string, unknown>): Promise<unknown> {
      return pq.execute(placeholderValues);
    },

    mapRunResult(response: unknown): unknown {
      return response;
    },

    mapAllResult(response: unknown): unknown {
      return response;
    },

    mapGetResult(response: unknown): unknown {
      return response;
    },
  };
  return pq;
}

export function mockDatabase<TDb>(db: TDb): MockController<TDb> {
  const handler = new MockHandler();
  const dbAny = db as any;
  const session = dbAny.session;
  const dialect = dbAny.dialect;

  // Capture the config from dialect build methods (synchronous, no race condition)
  let lastCapturedConfig: CapturedConfig | undefined;

  for (const [method, operation] of Object.entries(operationByBuildMethod)) {
    if (typeof dialect[method] === "function") {
      const original = dialect[method].bind(dialect);
      dialect[method] = (config: any) => {
        const table = config.table;
        if (table) {
          lastCapturedConfig = {
            operation,
            tableName: table[TableName],
            tableSchema: table[TableSchema],
            columnKeys: extractColumnKeys(operation, config),
          };
        }
        return original(config);
      };
    }
  }

  session.prepareQuery = (query: Query) => {
    const config = lastCapturedConfig;
    lastCapturedConfig = undefined;
    return createMockPreparedQuery(handler, query, config);
  };

  session.transaction = async (
    callback: (tx: any) => Promise<unknown>,
    _config?: unknown
  ) => {
    const tx = Object.create(dbAny, {
      rollback: {
        value() {
          throw new TransactionRollbackError();
        },
        writable: true,
        configurable: true,
      },
    });

    try {
      return await callback(tx);
    } catch (error) {
      if (error instanceof TransactionRollbackError) {
        return undefined;
      }
      throw error;
    }
  };

  return new MockController(handler, db);
}
