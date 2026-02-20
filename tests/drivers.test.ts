import { describe, it, expect, beforeEach } from "vitest";
import { eq, relations } from "drizzle-orm";
import { pgTable, serial as pgSerial, text as pgText, integer as pgInteger } from "drizzle-orm/pg-core";
import { mysqlTable, serial as mySerial, varchar, int } from "drizzle-orm/mysql-core";
import { sqliteTable, integer as sqliteInteger, text as sqliteText } from "drizzle-orm/sqlite-core";
import { mockDatabase, MockController } from "../src/index.js";

// -- PG schemas --

const pgUsers = pgTable("users", {
  id: pgSerial("id").primaryKey(),
  name: pgText("name").notNull(),
  email: pgText("email").notNull(),
});

const pgPosts = pgTable("posts", {
  id: pgSerial("id").primaryKey(),
  title: pgText("title").notNull(),
  authorId: pgInteger("author_id").notNull().references(() => pgUsers.id),
});

const pgUsersRelations = relations(pgUsers, ({ many }) => ({
  posts: many(pgPosts),
}));

const pgPostsRelations = relations(pgPosts, ({ one }) => ({
  author: one(pgUsers, { fields: [pgPosts.authorId], references: [pgUsers.id] }),
}));

// -- MySQL schemas --

const myUsers = mysqlTable("users", {
  id: mySerial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
});

const myPosts = mysqlTable("posts", {
  id: mySerial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  authorId: int("author_id").notNull().references(() => myUsers.id),
});

const myUsersRelations = relations(myUsers, ({ many }) => ({
  posts: many(myPosts),
}));

const myPostsRelations = relations(myPosts, ({ one }) => ({
  author: one(myUsers, { fields: [myPosts.authorId], references: [myUsers.id] }),
}));

// -- SQLite schemas --

const sqlUsers = sqliteTable("users", {
  id: sqliteInteger("id").primaryKey(),
  name: sqliteText("name").notNull(),
  email: sqliteText("email").notNull(),
});

const sqlPosts = sqliteTable("posts", {
  id: sqliteInteger("id").primaryKey(),
  title: sqliteText("title").notNull(),
  authorId: sqliteInteger("author_id").notNull().references(() => sqlUsers.id),
});

const sqlUsersRelations = relations(sqlUsers, ({ many }) => ({
  posts: many(sqlPosts),
}));

const sqlPostsRelations = relations(sqlPosts, ({ one }) => ({
  author: one(sqlUsers, { fields: [sqlPosts.authorId], references: [sqlUsers.id] }),
}));

// -- PG drivers --

describe("node-postgres driver", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pgSchema = { pgUsers, pgPosts, pgUsersRelations, pgPostsRelations };

  let db: ReturnType<typeof drizzle.mock<typeof pgSchema>>;
  let mock: MockController<typeof db>;

  beforeEach(() => {
    db = drizzle.mock({ schema: pgSchema });
    mock = mockDatabase(db);
  });

  it("should mock select", async () => {
    mock.on(db.select().from(pgUsers)).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.select().from(pgUsers);
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock select with where", async () => {
    mock.on(db.select().from(pgUsers).where(eq(pgUsers.id, 1))).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.select().from(pgUsers).where(eq(pgUsers.id, 1));
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock insert with returning", async () => {
    mock.on(db.insert(pgUsers).values({ name: "Bob", email: "b@test.com" }).returning()).respond([{ id: 2, name: "Bob", email: "b@test.com" }]);
    const result = await db.insert(pgUsers).values({ name: "Bob", email: "b@test.com" }).returning();
    expect(result).toEqual([{ id: 2, name: "Bob", email: "b@test.com" }]);
  });

  it("should mock update", async () => {
    mock.on(db.update(pgUsers).set({ name: "Updated" }).where(eq(pgUsers.id, 1))).respond({ rowCount: 1 });
    const result = await db.update(pgUsers).set({ name: "Updated" }).where(eq(pgUsers.id, 1));
    expect(result).toEqual({ rowCount: 1 });
  });

  it("should mock delete", async () => {
    mock.on(db.delete(pgUsers).where(eq(pgUsers.id, 1))).respond({ rowCount: 1 });
    const result = await db.delete(pgUsers).where(eq(pgUsers.id, 1));
    expect(result).toEqual({ rowCount: 1 });
  });

  it("should mock relational query", async () => {
    mock.on(db.query.pgUsers.findMany()).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.query.pgUsers.findMany();
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock relational query with relations", async () => {
    const expected = [{ id: 1, name: "Alice", email: "a@test.com", posts: [{ id: 1, title: "Hello", authorId: 1 }] }];
    mock.on(db.query.pgUsers.findMany({ with: { posts: true } })).respond(expected);
    const result = await db.query.pgUsers.findMany({ with: { posts: true } });
    expect(result).toEqual(expected);
  });

  it("should record calls", async () => {
    mock.on(db.select().from(pgUsers)).respond([]);
    await db.select().from(pgUsers);
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].sql).toContain('"users"');
  });

  it("should match structurally via callback", async () => {
    mock.on(d => d.update(pgUsers).set({ name: "x" })).respond({ rowCount: 1 });
    const result = await db.update(pgUsers).set({ name: "Updated" }).where(eq(pgUsers.id, 1));
    expect(result).toEqual({ rowCount: 1 });
  });
});

describe("postgres-js driver", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const pgSchema = { pgUsers, pgPosts, pgUsersRelations, pgPostsRelations };

  let db: ReturnType<typeof drizzle.mock<typeof pgSchema>>;
  let mock: MockController<typeof db>;

  beforeEach(() => {
    db = drizzle.mock({ schema: pgSchema });
    mock = mockDatabase(db);
  });

  it("should mock select", async () => {
    mock.on(db.select().from(pgUsers)).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.select().from(pgUsers);
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock select with where", async () => {
    mock.on(db.select().from(pgUsers).where(eq(pgUsers.id, 1))).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.select().from(pgUsers).where(eq(pgUsers.id, 1));
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock insert with returning", async () => {
    mock.on(db.insert(pgUsers).values({ name: "Bob", email: "b@test.com" }).returning()).respond([{ id: 2, name: "Bob", email: "b@test.com" }]);
    const result = await db.insert(pgUsers).values({ name: "Bob", email: "b@test.com" }).returning();
    expect(result).toEqual([{ id: 2, name: "Bob", email: "b@test.com" }]);
  });

  it("should mock relational query", async () => {
    mock.on(db.query.pgUsers.findMany()).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.query.pgUsers.findMany();
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should record calls", async () => {
    mock.on(db.select().from(pgUsers)).respond([]);
    await db.select().from(pgUsers);
    expect(mock.calls).toHaveLength(1);
  });

  it("should match structurally via callback", async () => {
    mock.on(d => d.insert(pgUsers).values({ name: "x", email: "x@x.com" })).respond({ rowCount: 1 });
    const result = await db.insert(pgUsers).values({ name: "Bob", email: "b@test.com" });
    expect(result).toEqual({ rowCount: 1 });
  });
});

// -- MySQL driver --

describe("mysql2 driver", async () => {
  const { drizzle } = await import("drizzle-orm/mysql2");
  const mySchema = { myUsers, myPosts, myUsersRelations, myPostsRelations };

  let db: ReturnType<typeof drizzle.mock<typeof mySchema>>;
  let mock: MockController<typeof db>;

  beforeEach(() => {
    db = drizzle.mock({ schema: mySchema, mode: "default" });
    mock = mockDatabase(db);
  });

  it("should mock select", async () => {
    mock.on(db.select().from(myUsers)).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.select().from(myUsers);
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock select with where", async () => {
    mock.on(db.select().from(myUsers).where(eq(myUsers.id, 1))).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.select().from(myUsers).where(eq(myUsers.id, 1));
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock insert", async () => {
    mock.on(db.insert(myUsers).values({ name: "Bob", email: "b@test.com" })).respond({ rowCount: 1 });
    const result = await db.insert(myUsers).values({ name: "Bob", email: "b@test.com" });
    expect(result).toEqual({ rowCount: 1 });
  });

  it("should mock update", async () => {
    mock.on(db.update(myUsers).set({ name: "Updated" }).where(eq(myUsers.id, 1))).respond({ rowCount: 1 });
    const result = await db.update(myUsers).set({ name: "Updated" }).where(eq(myUsers.id, 1));
    expect(result).toEqual({ rowCount: 1 });
  });

  it("should mock delete", async () => {
    mock.on(db.delete(myUsers).where(eq(myUsers.id, 1))).respond({ rowCount: 1 });
    const result = await db.delete(myUsers).where(eq(myUsers.id, 1));
    expect(result).toEqual({ rowCount: 1 });
  });

  it("should mock relational query", async () => {
    mock.on(db.query.myUsers.findMany()).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.query.myUsers.findMany();
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should record calls", async () => {
    mock.on(db.select().from(myUsers)).respond([]);
    await db.select().from(myUsers);
    expect(mock.calls).toHaveLength(1);
    // MySQL uses backtick quoting
    expect(mock.calls[0].sql).toContain("`users`");
  });

  it("should match structurally via callback", async () => {
    mock.on(d => d.update(myUsers).set({ name: "x" })).respond({ rowCount: 1 });
    const result = await db.update(myUsers).set({ name: "Updated" }).where(eq(myUsers.id, 1));
    expect(result).toEqual({ rowCount: 1 });
  });
});

// -- SQLite drivers --

describe("better-sqlite3 driver", async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const sqlSchema = { sqlUsers, sqlPosts, sqlUsersRelations, sqlPostsRelations };

  let db: ReturnType<typeof drizzle.mock<typeof sqlSchema>>;
  let mock: MockController<typeof db>;

  beforeEach(() => {
    db = drizzle.mock({ schema: sqlSchema });
    mock = mockDatabase(db);
  });

  it("should mock select", async () => {
    mock.on(db.select().from(sqlUsers)).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.select().from(sqlUsers);
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock select with where", async () => {
    mock.on(db.select().from(sqlUsers).where(eq(sqlUsers.id, 1))).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.select().from(sqlUsers).where(eq(sqlUsers.id, 1));
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock insert", async () => {
    mock.on(db.insert(sqlUsers).values({ name: "Bob", email: "b@test.com" })).respond({ rowCount: 1 });
    const result = await db.insert(sqlUsers).values({ name: "Bob", email: "b@test.com" });
    expect(result).toEqual({ rowCount: 1 });
  });

  it("should mock update", async () => {
    mock.on(db.update(sqlUsers).set({ name: "Updated" }).where(eq(sqlUsers.id, 1))).respond({ rowCount: 1 });
    const result = await db.update(sqlUsers).set({ name: "Updated" }).where(eq(sqlUsers.id, 1));
    expect(result).toEqual({ rowCount: 1 });
  });

  it("should mock delete", async () => {
    mock.on(db.delete(sqlUsers).where(eq(sqlUsers.id, 1))).respond({ rowCount: 1 });
    const result = await db.delete(sqlUsers).where(eq(sqlUsers.id, 1));
    expect(result).toEqual({ rowCount: 1 });
  });

  it("should mock insert via .run() (SQLite-specific)", async () => {
    mock.on(db.insert(sqlUsers).values({ name: "Charlie", email: "c@test.com" })).respond({ changes: 1, lastInsertRowid: 3 });
    const result = db.insert(sqlUsers).values({ name: "Charlie", email: "c@test.com" }).run();
    expect(await result).toEqual({ changes: 1, lastInsertRowid: 3 });
  });

  it("should mock select via .all() (SQLite-specific)", async () => {
    mock.on(db.select().from(sqlUsers)).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = db.select().from(sqlUsers).all();
    expect(await result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock select via .get() (SQLite-specific)", async () => {
    mock.on(db.select().from(sqlUsers)).respond({ id: 1, name: "Alice", email: "a@test.com" });
    const result = db.select().from(sqlUsers).get();
    expect(await result).toEqual({ id: 1, name: "Alice", email: "a@test.com" });
  });

  it("should mock relational query", async () => {
    mock.on(db.query.sqlUsers.findMany()).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.query.sqlUsers.findMany();
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should record calls", async () => {
    mock.on(db.select().from(sqlUsers)).respond([]);
    await db.select().from(sqlUsers);
    expect(mock.calls).toHaveLength(1);
    // SQLite uses double-quote quoting like PG
    expect(mock.calls[0].sql).toContain('"users"');
  });

  it("should match structurally via callback", async () => {
    mock.on(d => d.delete(sqlUsers)).respond({ rowCount: 1 });
    const result = await db.delete(sqlUsers).where(eq(sqlUsers.id, 1));
    expect(result).toEqual({ rowCount: 1 });
  });
});

describe("libsql driver", async () => {
  const { drizzle } = await import("drizzle-orm/libsql");
  const sqlSchema = { sqlUsers, sqlPosts, sqlUsersRelations, sqlPostsRelations };

  let db: ReturnType<typeof drizzle.mock<typeof sqlSchema>>;
  let mock: MockController<typeof db>;

  beforeEach(() => {
    db = drizzle.mock({ schema: sqlSchema });
    mock = mockDatabase(db);
  });

  it("should mock select", async () => {
    mock.on(db.select().from(sqlUsers)).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.select().from(sqlUsers);
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock select with where", async () => {
    mock.on(db.select().from(sqlUsers).where(eq(sqlUsers.id, 1))).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.select().from(sqlUsers).where(eq(sqlUsers.id, 1));
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should mock insert", async () => {
    mock.on(db.insert(sqlUsers).values({ name: "Bob", email: "b@test.com" })).respond({ rowCount: 1 });
    const result = await db.insert(sqlUsers).values({ name: "Bob", email: "b@test.com" });
    expect(result).toEqual({ rowCount: 1 });
  });

  it("should mock relational query", async () => {
    mock.on(db.query.sqlUsers.findMany()).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.query.sqlUsers.findMany();
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });

  it("should record calls", async () => {
    mock.on(db.select().from(sqlUsers)).respond([]);
    await db.select().from(sqlUsers);
    expect(mock.calls).toHaveLength(1);
  });

  it("should match structurally via callback", async () => {
    mock.on(d => d.select().from(sqlUsers)).respond([{ id: 1, name: "Alice", email: "a@test.com" }]);
    const result = await db.select().from(sqlUsers).where(eq(sqlUsers.id, 1));
    expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com" }]);
  });
});
