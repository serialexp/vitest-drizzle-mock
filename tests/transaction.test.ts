import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers.js";
import * as schema from "./schema.js";

describe("transactions", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let mock: ReturnType<typeof createTestDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createTestDb());
  });

  it("should execute queries inside a transaction using shared mocks", async () => {
    mock
      .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
      .respond([{ id: 1, name: "Alice" }]);

    mock
      .on(
        db
          .update(schema.users)
          .set({ name: "Alice Updated" })
          .where(eq(schema.users.id, 1))
      )
      .respond({ rowCount: 1 });

    const result = await db.transaction(async (tx) => {
      const user = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));

      await tx
        .update(schema.users)
        .set({ name: "Alice Updated" })
        .where(eq(schema.users.id, 1));

      return user;
    });

    expect(result).toEqual([{ id: 1, name: "Alice" }]);
    expect(mock.calls).toHaveLength(2);
  });

  it("should support transaction rollback", async () => {
    const result = await db.transaction(async (tx) => {
      tx.rollback();
    });

    // Rollback returns undefined
    expect(result).toBeUndefined();
  });

  it("should record calls made inside transactions", async () => {
    mock.on(db.select().from(schema.users)).respond([]);
    mock.on(db.select().from(schema.posts)).respond([]);

    await db.transaction(async (tx) => {
      await tx.select().from(schema.users);
      await tx.select().from(schema.posts);
    });

    expect(mock.calls).toHaveLength(2);
  });
});
