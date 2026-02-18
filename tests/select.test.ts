import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers.js";
import * as schema from "./schema.js";

describe("select queries", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let mock: ReturnType<typeof createTestDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createTestDb());
  });

  it("should mock a basic select all", async () => {
    const mockUsers = [
      { id: 1, name: "Alice", email: "alice@test.com", createdAt: null },
      { id: 2, name: "Bob", email: "bob@test.com", createdAt: null },
    ];

    mock.on(db.select().from(schema.users)).respond(mockUsers);

    const result = await db.select().from(schema.users);
    expect(result).toEqual(mockUsers);
  });

  it("should mock a select with where clause", async () => {
    const mockUser = [{ id: 1, name: "Alice", email: "alice@test.com", createdAt: null }];

    mock
      .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
      .respond(mockUser);

    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, 1));

    expect(result).toEqual(mockUser);
  });

  it("should mock a partial select (specific columns)", async () => {
    const mockData = [
      { name: "Alice" },
      { name: "Bob" },
    ];

    mock
      .on(db.select({ name: schema.users.name }).from(schema.users))
      .respond(mockData);

    const result = await db
      .select({ name: schema.users.name })
      .from(schema.users);

    expect(result).toEqual(mockData);
  });

  it("should mock a select with limit and offset", async () => {
    const mockData = [{ id: 2, name: "Bob", email: "bob@test.com", createdAt: null }];

    mock
      .on(db.select().from(schema.users).limit(1).offset(1))
      .respond(mockData);

    const result = await db.select().from(schema.users).limit(1).offset(1);
    expect(result).toEqual(mockData);
  });

  it("should mock a select with a join", async () => {
    const mockData = [
      {
        users: { id: 1, name: "Alice", email: "alice@test.com", createdAt: null },
        posts: { id: 1, title: "Hello", body: "World", authorId: 1 },
      },
    ];

    mock
      .on(
        db
          .select()
          .from(schema.users)
          .innerJoin(schema.posts, eq(schema.users.id, schema.posts.authorId))
      )
      .respond(mockData);

    const result = await db
      .select()
      .from(schema.users)
      .innerJoin(schema.posts, eq(schema.users.id, schema.posts.authorId));

    expect(result).toEqual(mockData);
  });

  it("should use the most recently registered mock when multiple match", async () => {
    mock.on(db.select().from(schema.users)).respond([{ id: 1, name: "First" }]);
    mock.on(db.select().from(schema.users)).respond([{ id: 2, name: "Second" }]);

    const result = await db.select().from(schema.users);
    expect(result).toEqual([{ id: 2, name: "Second" }]);
  });

  it("should throw when no mock is registered for a query", async () => {
    await expect(db.select().from(schema.users)).rejects.toThrow(
      /No mock registered/
    );
  });
});
