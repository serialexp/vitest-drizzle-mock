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

// Register a mock using the query builder
mock.on(db.select().from(schema.users)).respond([
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
import { mockDatabase } from "vitest-drizzle-mock";
import * as schema from "./schema";

describe("user service", () => {
  let db: ReturnType<typeof drizzle.mock<typeof schema>>;
  let mock: ReturnType<typeof mockDatabase>;

  beforeEach(() => {
    db = drizzle.mock({ schema });
    mock = mockDatabase(db);
  });

  it("should find a user by id", async () => {
    mock
      .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
      .respond([{ id: 1, name: "Alice", email: "alice@test.com" }]);

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
      .on(
        db.insert(schema.users)
          .values({ name: "Bob", email: "bob@test.com" })
          .returning()
      )
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
      .on(
        db.update(schema.users)
          .set({ name: "Alice Updated" })
          .where(eq(schema.users.id, 1))
      )
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

### `MockController`

#### `mock.on(queryBuilder)`

Match queries by their exact SQL (generated from a drizzle query builder). By default, parameters are ignored — only the SQL structure is matched.

```ts
// Matches any `select * from users where id = $1`, regardless of the param value
mock
  .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
  .respond([{ id: 1, name: "Alice" }]);
```

Works with all query types:

```ts
// Insert
mock
  .on(db.insert(schema.users).values({ name: "Alice", email: "alice@test.com" }))
  .respond({ rowCount: 1 });

// Insert with returning
mock
  .on(db.insert(schema.users).values({ name: "Alice", email: "alice@test.com" }).returning())
  .respond([{ id: 1, name: "Alice", email: "alice@test.com" }]);

// Update
mock
  .on(db.update(schema.users).set({ name: "Updated" }).where(eq(schema.users.id, 1)))
  .respond({ rowCount: 1 });

// Delete
mock
  .on(db.delete(schema.users).where(eq(schema.users.id, 1)))
  .respond({ rowCount: 1 });

// Relational queries
mock
  .on(db.query.users.findMany({ with: { posts: true } }))
  .respond([{ id: 1, name: "Alice", posts: [{ id: 1, title: "Hello" }] }]);
```

#### `mock.onSql(pattern)`

Match queries by a regex pattern against the generated SQL.

```ts
mock.onSql(/from "users"/).respond([{ id: 1, name: "Alice" }]);
```

#### `mock.onSqlContaining(substring)`

Match queries that contain a given substring in the SQL.

```ts
mock.onSqlContaining('"users"').respond([{ id: 1, name: "Alice" }]);
```

### `MockBuilder`

Returned by `mock.on()`, `mock.onSql()`, and `mock.onSqlContaining()`.

#### `.respond(data)`

Return static data when the query matches.

```ts
mock.on(db.select().from(schema.users)).respond([]);
```

#### `.respondWith(fn)`

Return dynamic data based on the SQL and params. The function receives the normalized SQL string and the parameter array.

```ts
mock
  .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
  .respondWith((_sql, params) => {
    const id = params[0] as number;
    return [{ id, name: `User ${id}` }];
  });
```

Async functions are supported:

```ts
mock
  .on(db.select().from(schema.users))
  .respondWith(async () => {
    return [{ id: 1, name: "Async Alice" }];
  });
```

#### `.throw(error)`

Simulate a database error.

```ts
mock
  .on(db.select().from(schema.users))
  .throw(new Error("connection refused"));
```

#### `.partial()`

Match any query whose SQL starts with the registered query's SQL. This lets you write a single mock that catches queries with additional clauses like `WHERE`, `LIMIT`, `ORDER BY`, etc.

```ts
// Matches any select from users — with or without where, limit, etc.
mock
  .on(db.select().from(schema.users))
  .partial()
  .respond([]);
```

Can be combined with `.withExactParams()`:

```ts
mock
  .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
  .partial()
  .withExactParams()
  .respond([{ id: 1, name: "Alice" }]);
```

Only works with `.on()` (query builder matchers), not with `.onSql()` or `.onSqlContaining()`.

#### `.withExactParams()`

Require parameters to match exactly (not just the SQL structure).

```ts
mock
  .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
  .withExactParams()
  .respond([{ id: 1, name: "Alice" }]);

// This will NOT match — param is 2, not 1
await db.select().from(schema.users).where(eq(schema.users.id, 2));
// → throws "No mock registered"
```

#### `.once()`

Make the mock expire after a single match. Subsequent calls fall through to the next matching mock (or throw if none).

```ts
mock.on(db.select().from(schema.users)).respond([{ name: "Persistent" }]);
mock.on(db.select().from(schema.users)).once().respond([{ name: "Once" }]);

await db.select().from(schema.users); // → [{ name: "Once" }]
await db.select().from(schema.users); // → [{ name: "Persistent" }]
```

### Call Recording

Every executed query is recorded in `mock.calls`.

```ts
mock.on(db.select().from(schema.users)).respond([]);
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
mock
  .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
  .respond([{ id: 1, name: "Alice" }]);

mock
  .on(db.update(schema.users).set({ name: "Updated" }).where(eq(schema.users.id, 1)))
  .respond({ rowCount: 1 });

const result = await db.transaction(async (tx) => {
  const user = await tx.select().from(schema.users).where(eq(schema.users.id, 1));
  await tx.update(schema.users).set({ name: "Updated" }).where(eq(schema.users.id, 1));
  return user;
});
```

Rollbacks are also supported:

```ts
await db.transaction(async (tx) => {
  tx.rollback();
});
```

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

`mockDatabase()` intercepts the `prepareQuery` method on the drizzle session. When a query is executed, the generated SQL is matched against registered mocks. If no mock matches, an error is thrown with the SQL and a list of registered mocks to help you debug.

### Match Resolution

When multiple mocks match a query, the most specific one wins:

| Priority | Matcher | Description |
|----------|---------|-------------|
| 1 (highest) | `.on(query).withExactParams()` | Exact SQL + exact params |
| 2 | `.on(query)` | Exact SQL, any params |
| 3 | `.on(query).partial().withExactParams()` | SQL prefix + exact params |
| 4 | `.on(query).partial()` | SQL prefix, any params |
| 5 (lowest) | `.onSql()` / `.onSqlContaining()` | Regex or substring |

Within the same priority level, the last registered mock wins. This means you can set up broad catch-alls and specific overrides in any order:

```ts
// These can be registered in any order — the exact mock always wins for id=1
mock.on(db.select().from(schema.users)).partial().respond([]);
mock
  .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
  .withExactParams()
  .respond([{ id: 1, name: "Alice" }]);

await db.select().from(schema.users).where(eq(schema.users.id, 1));
// → [{ id: 1, name: "Alice" }]  (exact match wins)

await db.select().from(schema.users).where(eq(schema.users.id, 999));
// → []  (partial catch-all)
```

## License

MIT
