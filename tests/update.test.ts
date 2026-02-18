import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers.js";
import * as schema from "./schema.js";

describe("update queries", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let mock: ReturnType<typeof createTestDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createTestDb());
  });

  it("should mock an update without returning", async () => {
    mock
      .on(
        db
          .update(schema.users)
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

  it("should mock an update with returning", async () => {
    const mockReturned = [
      { id: 1, name: "Alice Updated", email: "alice@test.com", createdAt: null },
    ];

    mock
      .on(
        db
          .update(schema.users)
          .set({ name: "Alice Updated" })
          .where(eq(schema.users.id, 1))
          .returning()
      )
      .respond(mockReturned);

    const result = await db
      .update(schema.users)
      .set({ name: "Alice Updated" })
      .where(eq(schema.users.id, 1))
      .returning();

    expect(result).toEqual(mockReturned);
  });
});
