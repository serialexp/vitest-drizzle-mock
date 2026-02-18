import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers.js";
import * as schema from "./schema.js";

describe("insert queries", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let mock: ReturnType<typeof createTestDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createTestDb());
  });

  it("should mock an insert without returning", async () => {
    mock
      .on(db.insert(schema.users).values({ name: "Alice", email: "alice@test.com" }))
      .respond({ rowCount: 1 });

    const result = await db
      .insert(schema.users)
      .values({ name: "Alice", email: "alice@test.com" });

    expect(result).toEqual({ rowCount: 1 });
  });

  it("should mock an insert with returning", async () => {
    const mockReturned = [{ id: 1, name: "Alice", email: "alice@test.com", createdAt: null }];

    mock
      .on(
        db
          .insert(schema.users)
          .values({ name: "Alice", email: "alice@test.com" })
          .returning()
      )
      .respond(mockReturned);

    const result = await db
      .insert(schema.users)
      .values({ name: "Alice", email: "alice@test.com" })
      .returning();

    expect(result).toEqual(mockReturned);
  });

  it("should mock an insert with onConflictDoNothing", async () => {
    mock
      .on(
        db
          .insert(schema.users)
          .values({ name: "Alice", email: "alice@test.com" })
          .onConflictDoNothing()
      )
      .respond({ rowCount: 0 });

    const result = await db
      .insert(schema.users)
      .values({ name: "Alice", email: "alice@test.com" })
      .onConflictDoNothing();

    expect(result).toEqual({ rowCount: 0 });
  });
});
