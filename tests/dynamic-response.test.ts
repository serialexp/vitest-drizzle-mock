import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers.js";
import * as schema from "./schema.js";

describe("dynamic responses and error simulation", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let mock: ReturnType<typeof createTestDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createTestDb());
  });

  it("should support dynamic responses based on params", async () => {
    mock
      .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
      .respondWith((_sql, params) => {
        const id = params[0] as number;
        return [{ id, name: `User ${id}` }];
      });

    const result1 = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, 42));

    expect(result1).toEqual([{ id: 42, name: "User 42" }]);

    const result2 = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, 7));

    expect(result2).toEqual([{ id: 7, name: "User 7" }]);
  });

  it("should simulate database errors", async () => {
    mock
      .on(db.select().from(schema.users))
      .throw(new Error("connection refused"));

    await expect(db.select().from(schema.users)).rejects.toThrow(
      "connection refused"
    );
  });

  it("should support async dynamic responses", async () => {
    mock
      .on(db.select().from(schema.users))
      .respondWith(async () => {
        return [{ id: 1, name: "Async Alice" }];
      });

    const result = await db.select().from(schema.users);
    expect(result).toEqual([{ id: 1, name: "Async Alice" }]);
  });
});
