import {
  fillPlaceholders,
  TransactionRollbackError,
} from "drizzle-orm";
import { MockHandler } from "./mock-handler.js";
import { MockController } from "./mock-controller.js";

interface Query {
  sql: string;
  params: unknown[];
}

function createMockPreparedQuery(handler: MockHandler, query: Query) {
  const pq = {
    joinsNotNullableMap: undefined as Record<string, boolean> | undefined,

    async execute(
      placeholderValues?: Record<string, unknown>
    ): Promise<unknown> {
      const params =
        placeholderValues && Object.keys(placeholderValues).length > 0
          ? fillPlaceholders(query.params, placeholderValues)
          : query.params;
      return handler.handle(query.sql, params);
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

export function mockDatabase(db: any): MockController {
  const handler = new MockHandler();
  const session = db.session;

  session.prepareQuery = (query: Query) => {
    return createMockPreparedQuery(handler, query);
  };

  session.transaction = async (
    callback: (tx: any) => Promise<unknown>,
    _config?: unknown
  ) => {
    const tx = Object.create(db, {
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

  return new MockController(handler);
}
