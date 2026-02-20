# vitest-drizzle-mock

Mock [drizzle-orm](https://orm.drizzle.team/) database instances for fast, in-memory unit testing. No database required.

Works with all drizzle drivers: PostgreSQL (node-postgres, postgres.js), MySQL (mysql2), and SQLite (better-sqlite3, libsql).

## Install

```bash
pnpm add -D vitest-drizzle-mock
```

## Quick Start

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { mockDatabase } from "vitest-drizzle-mock";
import * as schema from "./schema";

// Create a mock drizzle instance — no connection needed
const db = drizzle.mock({ schema });
const mock = mockDatabase(db);

// Register mocks by table and operation
mock.onSelect(schema.users).respond([
  { id: 1, name: "Alice", email: "alice@test.com" },
]);

// Execute the query — returns the mocked data
const users = await db.select().from(schema.users);
```

## Usage with Vitest

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { mockDatabase, MockController } from "vitest-drizzle-mock";
import * as schema from "./schema";

describe("user service", () => {
  let db: ReturnType<typeof drizzle.mock<typeof schema>>;
  let mock: MockController<typeof db>;

  beforeEach(() => {
    db = drizzle.mock({ schema });
    mock = mockDatabase(db);
  });

  it("should find a user by id", async () => {
    mock.onSelect(schema.users).respond([
      { id: 1, name: "Alice", email: "alice@test.com" },
    ]);

    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, 1));

    expect(result).toEqual([
      { id: 1, name: "Alice", email: "alice@test.com" },
    ]);
  });

  it("should create a user", async () => {
    mock
      .onInsert(schema.users)
      .values({ name: "x", email: "x" })
      .respond([{ id: 2, name: "Bob", email: "bob@test.com" }]);

    const result = await db
      .insert(schema.users)
      .values({ name: "Bob", email: "bob@test.com" })
      .returning();

    expect(result).toEqual([
      { id: 2, name: "Bob", email: "bob@test.com" },
    ]);
  });

  it("should update a user", async () => {
    mock
      .onUpdate(schema.users)
      .set({ name: "x" })
      .respond({ rowCount: 1 });

    const result = await db
      .update(schema.users)
      .set({ name: "Alice Updated" })
      .where(eq(schema.users.id, 1));

    expect(result).toEqual({ rowCount: 1 });
  });
});
```

## API

### `mockDatabase(db)`

Takes a drizzle mock instance and returns a `MockController`.

```ts
const db = drizzle.mock({ schema });
const mock = mockDatabase(db);
```

### Matching by Table

The simplest way to register mocks. Pass a table to match by operation type, with full column-name autocomplete and all columns optional.

#### `mock.onSelect(table)`

Match any select from the table, regardless of WHERE, ORDER BY, LIMIT, etc.

```ts
mock.onSelect(schema.users).respond([{ id: 1, name: "Alice" }]);
```

#### `mock.onInsert(table)`

Match any insert on the table. Optionally constrain which columns must be present with `.values()`.

```ts
// Match any insert on the users table
mock.onInsert(schema.users).respond({ rowCount: 1 });

// Match inserts that include at least name and email
mock
  .onInsert(schema.users)
  .values({ name: "x", email: "x" })
  .respond({ rowCount: 1 });
```

Column matching uses subset logic: if the mock specifies `{name}`, it matches queries that insert `{name}` or `{name, email}`. But `{name, email}` won't match a query that only inserts `{name}`.

#### `mock.onUpdate(table)`

Match any update on the table. Optionally constrain which columns must be set with `.set()`.

```ts
// Match any update on the users table
mock.onUpdate(schema.users).respond({ rowCount: 1 });

// Match updates that set at least the name column
mock
  .onUpdate(schema.users)
  .set({ name: "x" })
  .respond({ rowCount: 1 });
```

#### `mock.onDelete(table)`

```ts
mock.onDelete(schema.users).respond({ rowCount: 1 });
```

#### `mock.onFindFirst(table)` / `mock.onFindMany(table)`

Match relational queries.

```ts
mock
  .onFindFirst(schema.users)
  .respond({ id: 1, name: "Alice" });

mock
  .onFindMany(schema.users)
  .respond([{ id: 1, name: "Alice" }]);
```

`findFirst` and `findMany` are distinct — a `findFirst` mock won't match a `findMany` query.

#### `.containingSql(expr)`

Combine table matching with a SQL fragment check. Useful for distinguishing queries by specific WHERE conditions.

```ts
mock
  .onFindFirst(schema.users)
  .containingSql(eq(schema.users.id, 1))
  .respond({ id: 1, name: "Alice" });

mock
  .onFindFirst(schema.users)
  .containingSql(eq(schema.users.id, 2))
  .respond({ id: 2, name: "Bob" });
```

The fragment is checked with positional param matching, so different param values are distinguished. Only the specified fragment needs to be present — other conditions in the query are ignored.

### Response Methods

#### `.respond(data)`

Return static data when the query matches.

```ts
mock.onSelect(schema.users).respond([]);
```

#### `.respondOnce(data)`

Queue one-time responses. Returns the builder for chaining.

```ts
mock
  .onSelect(schema.users)
  .respondOnce([{ id: 1, name: "First call" }])
  .respondOnce([{ id: 2, name: "Second call" }])
  .respond([]); // all subsequent calls
```

Responses are consumed in FIFO order. After the queue is exhausted, the persistent `.respond()` fallback kicks in (or throws "no mock registered" if none).

#### `.respondWith(fn)`

Return dynamic data based on the SQL and params.

```ts
mock
  .onSelect(schema.users)
  .respondWith((_sql, params) => {
    const id = params[0] as number;
    return [{ id, name: `User ${id}` }];
  });
```

#### `.throw(error)`

Simulate a database error.

```ts
mock
  .onSelect(schema.users)
  .throw(new Error("connection refused"));
```

#### `.once()`

Make the mock expire after a single match. Subsequent calls fall through to the next matching mock (or throw if none).

```ts
mock.onSelect(schema.users).respond([{ name: "Persistent" }]);
mock.onSelect(schema.users).once().respond([{ name: "Once" }]);

await db.select().from(schema.users); // → [{ name: "Once" }]
await db.select().from(schema.users); // → [{ name: "Persistent" }]
```

### Mock Handles

`.respond()`, `.respondWith()`, and `.throw()` return a handle compatible with Vitest's spy matchers.

```ts
const findUsers = mock
  .onSelect(schema.users)
  .respond([{ id: 1, name: "Alice" }]);

const updateUser = mock
  .onUpdate(schema.users)
  .set({ name: "x" })
  .respond({ rowCount: 1 });

await db.select().from(schema.users);

expect(findUsers).toHaveBeenCalled();
expect(findUsers).toHaveBeenCalledTimes(1);
expect(updateUser).not.toHaveBeenCalled();
```

For `.respondOnce()` chains, use `.handle()` to get the spy handle:

```ts
const handle = mock
  .onInsert(schema.users)
  .respondOnce({ rowCount: 1 })
  .respondOnce({ rowCount: 2 })
  .handle();

expect(handle).toHaveBeenCalledTimes(2);
```

The handle exposes `.mock.calls` with `[sql, params]` tuples for deeper inspection:

```ts
const handle = mock.onSelect(schema.users).respond([]);

await db.select().from(schema.users).where(eq(schema.users.id, 42));

expect(handle.mock.calls[0][1]).toEqual([42]); // params
```

### Call Recording

Every executed query is recorded in `mock.calls`, regardless of which mock matched.

```ts
mock.onSelect(schema.users).respond([]);
await db.select().from(schema.users);

expect(mock.calls).toHaveLength(1);
expect(mock.calls[0].sql).toContain('"users"');
expect(mock.calls[0].params).toEqual([]);
```

### Reset Methods

```ts
mock.reset();      // Clear all mocks AND recorded calls
mock.resetMocks();  // Clear mocks only (calls are preserved)
mock.resetCalls();  // Clear recorded calls only (mocks are preserved)
```

### Transactions

Transactions work out of the box. Mocks registered on the parent `db` are shared with the transaction context.

```ts
mock.onSelect(schema.users).respond([{ id: 1, name: "Alice" }]);
mock.onUpdate(schema.users).set({ name: "x" }).respond({ rowCount: 1 });

const result = await db.transaction(async (tx) => {
  const user = await tx.select().from(schema.users);
  await tx.update(schema.users).set({ name: "Updated" });
  return user;
});
```

Rollbacks are also supported:

```ts
await db.transaction(async (tx) => {
  tx.rollback();
});
```

## Advanced Matching

For cases where table-based matching isn't specific enough, there are additional matching strategies.

### `mock.on(queryBuilder)` — Exact SQL Matching

Match by exact SQL string generated from a drizzle query builder. Parameters are ignored by default.

```ts
mock
  .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
  .respond([{ id: 1, name: "Alice" }]);
```

#### `.withExactParams()`

Require parameters to match exactly.

```ts
mock
  .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
  .withExactParams()
  .respond([{ id: 1, name: "Alice" }]);

// Will NOT match — param is 2, not 1
await db.select().from(schema.users).where(eq(schema.users.id, 2));
```

#### `.partial()`

Match any query whose SQL starts with the registered SQL. Catches queries with additional WHERE, LIMIT, ORDER BY, etc.

```ts
mock
  .on(db.select().from(schema.users))
  .partial()
  .respond([]);
```

### `mock.on(callback)` — Structural Matching with Callback

Match queries structurally using the drizzle query builder inside a callback. Useful when you need the full `db` API or when drizzle generates complex SQL that differs from what a simple builder produces.

```ts
import { anything } from "vitest-drizzle-mock";

mock
  .on(db => db.update(schema.users).set({ name: anything() }))
  .respond({ rowCount: 1 });
```

The `anything()` helper is a typed wildcard — it satisfies any column type without needing `as any`. The `partial()` helper makes all columns optional for insert values:

```ts
import { partial } from "vitest-drizzle-mock";

mock
  .on(db => db.insert(schema.users).values(partial({ name: "x" })))
  .respond({ rowCount: 1 });
```

### `mock.onSql(pattern)` / `mock.onSqlContaining(substring)`

Match by regex or substring against the generated SQL.

```ts
mock.onSql(/from "users"/).respond([{ id: 1, name: "Alice" }]);
mock.onSqlContaining('"users"').respond([{ id: 1, name: "Alice" }]);
```

### Match Resolution

When multiple mocks match a query, the most specific one wins:

| Priority | Matcher | Description |
|----------|---------|-------------|
| 1 (highest) | `.on(query).withExactParams()` | Exact SQL + exact params |
| 2 | `.on(query)` | Exact SQL, any params |
| 3 | `.on(query).partial().withExactParams()` | SQL prefix + exact params |
| 4 | `.on(query).partial()` | SQL prefix, any params |
| 5 | `.containingSql()` | Structural + SQL fragment |
| 6 | `.onInsert().values()` / `.onUpdate().set()` | Table + operation + columns |
| 7 | `.onInsert()` / `.onSelect()` / etc. | Table + operation only |
| 8 (lowest) | `.onSql()` / `.onSqlContaining()` | Regex or substring |

Within the same priority level, the last registered mock wins.

## Supported Drivers

| Driver | Import | Tested |
|--------|--------|--------|
| node-postgres | `drizzle-orm/node-postgres` | Yes |
| postgres.js | `drizzle-orm/postgres-js` | Yes |
| mysql2 | `drizzle-orm/mysql2` | Yes |
| better-sqlite3 | `drizzle-orm/better-sqlite3` | Yes |
| libsql | `drizzle-orm/libsql` | Yes |

All drivers use drizzle's built-in `.mock()` constructor — no real database connection is ever created.

## How It Works

`mockDatabase()` intercepts the `prepareQuery` method on the drizzle session and wraps dialect build methods to capture query configs. When a query is executed, it is matched against registered mocks using either SQL string comparison or structural config comparison. If no mock matches, an error is thrown with the SQL and a list of registered mocks to help you debug.

## License

MIT
