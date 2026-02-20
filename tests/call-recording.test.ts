import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers.js";
import * as schema from "./schema.js";

describe("call recording", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let mock: ReturnType<typeof createTestDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createTestDb());
  });

  it("should record each executed query", async () => {
    mock.on(db.select().from(schema.users)).respond([]);
    mock.on(db.select().from(schema.posts)).respond([]);

    await db.select().from(schema.users);
    await db.select().from(schema.posts);

    expect(mock.calls).toHaveLength(2);
  });

  it("should record SQL and params for each call", async () => {
    mock
      .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
      .respond([]);

    await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, 42));

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].sql).toContain('"users"');
    expect(mock.calls[0].params).toEqual([42]);
  });

  it("should record calls even when the mock throws", async () => {
    mock.on(db.select().from(schema.users)).throw(new Error("DB down"));

    await expect(db.select().from(schema.users)).rejects.toThrow("DB down");
    expect(mock.calls).toHaveLength(1);
  });

  describe("mock handles", () => {
    it("should return a handle from .respond()", async () => {
      const handle = mock
        .on(db.select().from(schema.users))
        .respond([]);

      expect(handle).not.toHaveBeenCalled();

      await db.select().from(schema.users);

      expect(handle).toHaveBeenCalled();
      expect(handle).toHaveBeenCalledTimes(1);
    });

    it("should return a handle from .respondWith()", async () => {
      const handle = mock
        .on(db.select().from(schema.users))
        .respondWith(() => []);

      await db.select().from(schema.users);

      expect(handle).toHaveBeenCalled();
    });

    it("should return a handle from .throw()", async () => {
      const handle = mock
        .on(db.select().from(schema.users))
        .throw(new Error("DB down"));

      await expect(db.select().from(schema.users)).rejects.toThrow("DB down");

      expect(handle).toHaveBeenCalled();
    });

    it("should track multiple calls", async () => {
      const handle = mock
        .on(db.select().from(schema.users))
        .respond([]);

      await db.select().from(schema.users);
      await db.select().from(schema.users);
      await db.select().from(schema.users);

      expect(handle).toHaveBeenCalledTimes(3);
    });

    it("should track sql and params in mock.calls", async () => {
      const handle = mock
        .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
        .respond([]);

      await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 42));

      expect(handle.mock.calls).toHaveLength(1);
      expect(handle.mock.calls[0][0]).toContain('"users"');
      expect(handle.mock.calls[0][1]).toEqual([42]);
    });

    it("should not count calls for unmatched mocks", async () => {
      const usersHandle = mock
        .on(db.select().from(schema.users))
        .respond([]);
      const postsHandle = mock
        .on(db.select().from(schema.posts))
        .respond([]);

      await db.select().from(schema.users);

      expect(usersHandle).toHaveBeenCalledTimes(1);
      expect(postsHandle).not.toHaveBeenCalled();
    });
  });

  describe("reset variants", () => {
    it("should clear everything with reset()", async () => {
      mock.on(db.select().from(schema.users)).respond([]);
      await db.select().from(schema.users);

      mock.reset();

      expect(mock.calls).toHaveLength(0);
      // Mocks are also cleared, so this should fail
      await expect(db.select().from(schema.users)).rejects.toThrow(
        /No mock registered/
      );
    });

    it("should clear only calls with resetCalls()", async () => {
      mock.on(db.select().from(schema.users)).respond([]);
      await db.select().from(schema.users);

      mock.resetCalls();

      expect(mock.calls).toHaveLength(0);
      // Mock is still registered
      const result = await db.select().from(schema.users);
      expect(result).toEqual([]);
    });

    it("should clear only mocks with resetMocks()", async () => {
      mock.on(db.select().from(schema.users)).respond([]);
      await db.select().from(schema.users);

      mock.resetMocks();

      // Calls are still recorded
      expect(mock.calls).toHaveLength(1);
      // But mock is gone
      await expect(db.select().from(schema.users)).rejects.toThrow(
        /No mock registered/
      );
    });
  });
});
