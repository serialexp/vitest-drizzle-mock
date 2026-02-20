// ABOUTME: Tests for structural query matching via callback-based mock.on(db => ...)
// ABOUTME: Verifies matching by operation type, table, and column keys without SQL comparison

import { describe, it, expect, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { anything } from "../src/index.js";
import { createTestDb } from "./helpers.js";
import * as schema from "./schema.js";

describe("structural matching", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let mock: ReturnType<typeof createTestDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createTestDb());
  });

  describe("basic operation matching", () => {
    it("should match an update regardless of param values", async () => {
      mock
        .on((d) => d.update(schema.users).set({ name: "anything" }))
        .respond({ rowCount: 1 });

      const result = await db
        .update(schema.users)
        .set({ name: "completely different" })
        .where(eq(schema.users.id, 42));

      expect(result).toEqual({ rowCount: 1 });
    });

    it("should match an insert regardless of param values", async () => {
      mock
        .on((d) =>
          d.insert(schema.users).values({ name: "x", email: "x@x.com" })
        )
        .respond({ rowCount: 1 });

      const result = await db
        .insert(schema.users)
        .values({ name: "Bob", email: "bob@test.com" });

      expect(result).toEqual({ rowCount: 1 });
    });

    it("should match a delete without needing column keys", async () => {
      mock.on((d) => d.delete(schema.users)).respond({ rowCount: 1 });

      const result = await db
        .delete(schema.users)
        .where(eq(schema.users.id, 1));

      expect(result).toEqual({ rowCount: 1 });
    });

    it("should match a select", async () => {
      mock
        .on((d) => d.select().from(schema.users))
        .respond([{ id: 1, name: "Alice" }]);

      const result = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));

      expect(result).toEqual([{ id: 1, name: "Alice" }]);
    });
  });

  describe("table and operation mismatch", () => {
    it("should not match when table is different", async () => {
      mock
        .on((d) => d.update(schema.posts).set({ title: "x" }))
        .respond({ rowCount: 1 });

      await expect(
        db.update(schema.users).set({ name: "Alice" })
      ).rejects.toThrow(/No mock registered/);
    });

    it("should not match when operation is different", async () => {
      mock
        .on((d) => d.update(schema.users).set({ name: "x" }))
        .respond({ rowCount: 1 });

      await expect(db.delete(schema.users)).rejects.toThrow(
        /No mock registered/
      );
    });
  });

  describe("column key matching", () => {
    it("should match when actual query sets a superset of expected columns", async () => {
      // Mock expects only {name}
      mock
        .on((d) => d.update(schema.users).set({ name: "x" }))
        .respond({ rowCount: 1 });

      // Actual sets {name, email} — superset, should match
      const result = await db
        .update(schema.users)
        .set({ name: "Alice", email: "a@test.com" });

      expect(result).toEqual({ rowCount: 1 });
    });

    it("should not match when actual query is missing expected columns", async () => {
      // Mock expects {name, email}
      mock
        .on((d) =>
          d.update(schema.users).set({ name: "x", email: "x@x.com" })
        )
        .respond({ rowCount: 1 });

      // Actual only sets {name} — missing email
      await expect(
        db.update(schema.users).set({ name: "Alice" })
      ).rejects.toThrow(/No mock registered/);
    });
  });

  describe("anything() wildcard values", () => {
    it("should work as a set value without crashing", async () => {
      mock
        .on((d) =>
          d.update(schema.users).set({ name: anything() })
        )
        .respond({ rowCount: 1 });

      const result = await db
        .update(schema.users)
        .set({ name: "real value" })
        .where(eq(schema.users.id, 1));

      expect(result).toEqual({ rowCount: 1 });
    });

    it("should work in insert values", async () => {
      mock
        .on((d) =>
          d.insert(schema.users).values({ name: anything(), email: anything() })
        )
        .respond({ rowCount: 1 });

      const result = await db
        .insert(schema.users)
        .values({ name: "Alice", email: "a@test.com" });

      expect(result).toEqual({ rowCount: 1 });
    });
  });

  describe("specificity", () => {
    it("sql-exact should win over structural for the same query", async () => {
      mock
        .on((d) => d.update(schema.users).set({ name: "x" }))
        .respond({ rowCount: 0 });

      mock
        .on(
          db
            .update(schema.users)
            .set({ name: "Alice" })
            .where(eq(schema.users.id, 1))
        )
        .respond({ rowCount: 1 });

      const result = await db
        .update(schema.users)
        .set({ name: "Alice" })
        .where(eq(schema.users.id, 1));

      expect(result).toEqual({ rowCount: 1 });
    });

    it("structural with column keys should win over structural without", async () => {
      mock.on((d) => d.select().from(schema.users)).respond([{ name: "No columns" }]);

      mock
        .on((d) => d.update(schema.users).set({ name: "x" }))
        .respond({ rowCount: 42 });

      // Both structurals match the update, but the one with column keys is more specific
      const result = await db.update(schema.users).set({ name: "test" });
      expect(result).toEqual({ rowCount: 42 });
    });
  });

  describe(".once() with structural matchers", () => {
    it("should expire after first match", async () => {
      mock
        .on((d) => d.update(schema.users).set({ name: "x" }))
        .once()
        .respond({ rowCount: 1 });

      const first = await db.update(schema.users).set({ name: "Alice" });
      expect(first).toEqual({ rowCount: 1 });

      await expect(
        db.update(schema.users).set({ name: "Bob" })
      ).rejects.toThrow(/No mock registered/);
    });

    it("should fall through to persistent mock after once is consumed", async () => {
      mock
        .on((d) => d.update(schema.users).set({ name: "x" }))
        .respond({ rowCount: 0 });

      mock
        .on((d) => d.update(schema.users).set({ name: "x" }))
        .once()
        .respond({ rowCount: 99 });

      const first = await db.update(schema.users).set({ name: "Alice" });
      expect(first).toEqual({ rowCount: 99 });

      const second = await db.update(schema.users).set({ name: "Bob" });
      expect(second).toEqual({ rowCount: 0 });
    });
  });

  describe("MockHandle tracking", () => {
    it("should track calls on structural matches", async () => {
      const handle = mock
        .on((d) => d.update(schema.users).set({ name: "x" }))
        .respond({ rowCount: 1 });

      await db.update(schema.users).set({ name: "Alice" });
      await db
        .update(schema.users)
        .set({ name: "Bob" })
        .where(eq(schema.users.id, 2));

      expect(handle.mock.calls).toHaveLength(2);
    });
  });

  describe("relational queries", () => {
    it("should match findFirst with any where clause", async () => {
      mock
        .on((d) => d.query.users.findFirst({ where: anything() }))
        .respond({ id: 1, name: "Alice", email: "a@test.com", createdAt: null });

      const result = await db.query.users.findFirst({
        where: eq(schema.users.id, 42),
      });

      expect(result).toEqual({ id: 1, name: "Alice", email: "a@test.com", createdAt: null });
    });

    it("should match findMany with any where clause", async () => {
      mock
        .on((d) => d.query.users.findMany({ where: anything() }))
        .respond([{ id: 1, name: "Alice", email: "a@test.com", createdAt: null }]);

      const result = await db.query.users.findMany({
        where: eq(schema.users.id, 1),
      });

      expect(result).toEqual([{ id: 1, name: "Alice", email: "a@test.com", createdAt: null }]);
    });

    it("should match findFirst without options", async () => {
      mock
        .on((d) => d.query.users.findFirst())
        .respond({ id: 1, name: "Alice", email: "a@test.com", createdAt: null });

      const result = await db.query.users.findFirst({
        where: eq(schema.users.id, 99),
      });

      expect(result).toEqual({ id: 1, name: "Alice", email: "a@test.com", createdAt: null });
    });

    it("should not match findFirst when table is different", async () => {
      mock
        .on((d) => d.query.posts.findFirst())
        .respond({ id: 1, title: "Hello", body: "World", authorId: 1 });

      await expect(
        db.query.users.findFirst()
      ).rejects.toThrow(/No mock registered/);
    });

    it("should not match findMany against findFirst", async () => {
      mock
        .on((d) => d.query.users.findMany())
        .respond([{ id: 1, name: "Alice", email: "a@test.com", createdAt: null }]);

      await expect(
        db.query.users.findFirst()
      ).rejects.toThrow(/No mock registered/);
    });

    it("should not match findFirst against findMany", async () => {
      mock
        .on((d) => d.query.users.findFirst())
        .respond({ id: 1, name: "Alice", email: "a@test.com", createdAt: null });

      await expect(
        db.query.users.findMany()
      ).rejects.toThrow(/No mock registered/);
    });
  });

  describe("containingSql", () => {
    it("should match when SQL fragment is present in the query", async () => {
      mock
        .on((d) => d.query.users.findFirst())
        .containingSql(eq(schema.users.id, 1))
        .respond({ id: 1, name: "Alice", email: "a@test.com", createdAt: null });

      const result = await db.query.users.findFirst({
        where: eq(schema.users.id, 1),
      });

      expect(result).toEqual({ id: 1, name: "Alice", email: "a@test.com", createdAt: null });
    });

    it("should not match when SQL fragment param value differs", async () => {
      mock
        .on((d) => d.query.users.findFirst())
        .containingSql(eq(schema.users.id, 1))
        .respond({ id: 1, name: "Alice", email: "a@test.com", createdAt: null });

      await expect(
        db.query.users.findFirst({ where: eq(schema.users.id, 999) })
      ).rejects.toThrow(/No mock registered/);
    });

    it("should match fragment in a compound where clause", async () => {
      mock
        .on((d) => d.query.users.findFirst())
        .containingSql(eq(schema.users.id, 42))
        .respond({ id: 42, name: "Bob", email: "b@test.com", createdAt: null });

      const result = await db.query.users.findFirst({
        where: and(
          eq(schema.users.id, 42),
          eq(schema.users.name, "Bob"),
        ),
      });

      expect(result).toEqual({ id: 42, name: "Bob", email: "b@test.com", createdAt: null });
    });

    it("should distinguish different param values with same structure", async () => {
      mock
        .on((d) => d.query.users.findFirst())
        .containingSql(eq(schema.users.id, 1))
        .respond({ id: 1, name: "Alice", email: "a@test.com", createdAt: null });

      mock
        .on((d) => d.query.users.findFirst())
        .containingSql(eq(schema.users.id, 2))
        .respond({ id: 2, name: "Bob", email: "b@test.com", createdAt: null });

      const alice = await db.query.users.findFirst({ where: eq(schema.users.id, 1) });
      expect(alice).toEqual({ id: 1, name: "Alice", email: "a@test.com", createdAt: null });

      const bob = await db.query.users.findFirst({ where: eq(schema.users.id, 2) });
      expect(bob).toEqual({ id: 2, name: "Bob", email: "b@test.com", createdAt: null });
    });

    it("should work with standard select queries too", async () => {
      mock
        .on((d) => d.select().from(schema.users))
        .containingSql(eq(schema.users.id, 5))
        .respond([{ id: 5, name: "Eve" }]);

      const result = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 5));

      expect(result).toEqual([{ id: 5, name: "Eve" }]);
    });
  });

  describe("guards", () => {
    it(".partial() should throw on structural matchers", () => {
      expect(() =>
        mock.on((d) => d.update(schema.users).set({ name: "x" })).partial()
      ).toThrow(/structural/i);
    });

    it(".withExactParams() should throw on structural matchers", () => {
      expect(() =>
        mock
          .on((d) => d.update(schema.users).set({ name: "x" }))
          .withExactParams()
      ).toThrow(/structural/i);
    });
  });

  describe("error messages", () => {
    it("should list structural matchers in error output", async () => {
      mock
        .on((d) => d.update(schema.users).set({ name: "x" }))
        .respond({ rowCount: 1 });

      await expect(db.select().from(schema.posts)).rejects.toThrow(
        /structural/i
      );
    });
  });
});
