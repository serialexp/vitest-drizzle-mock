import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers.js";
import * as schema from "./schema.js";

describe("delete queries", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let mock: ReturnType<typeof createTestDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createTestDb());
  });

  it("should mock a delete without returning", async () => {
    mock
      .on(db.delete(schema.users).where(eq(schema.users.id, 1)))
      .respond({ rowCount: 1 });

    const result = await db.delete(schema.users).where(eq(schema.users.id, 1));
    expect(result).toEqual({ rowCount: 1 });
  });

  it("should mock a delete with returning", async () => {
    const mockReturned = [
      { id: 1, name: "Alice", email: "alice@test.com", createdAt: null },
    ];

    mock
      .on(
        db.delete(schema.users).where(eq(schema.users.id, 1)).returning()
      )
      .respond(mockReturned);

    const result = await db
      .delete(schema.users)
      .where(eq(schema.users.id, 1))
      .returning();

    expect(result).toEqual(mockReturned);
  });

  it("should mock a delete all (no where clause)", async () => {
    mock.on(db.delete(schema.users)).respond({ rowCount: 5 });

    const result = await db.delete(schema.users);
    expect(result).toEqual({ rowCount: 5 });
  });
});
