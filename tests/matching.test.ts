import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers.js";
import * as schema from "./schema.js";

describe("mock matching", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let mock: ReturnType<typeof createTestDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createTestDb());
  });

  describe("SQL exact matching", () => {
    it("should match by exact SQL (ignoring params by default)", async () => {
      mock
        .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
        .respond([{ id: 1, name: "Alice" }]);

      // Same SQL structure but different param value
      const result = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 999));

      expect(result).toEqual([{ id: 1, name: "Alice" }]);
    });
  });

  describe("SQL regex matching", () => {
    it("should match by regex pattern", async () => {
      mock.onSql(/from "users"/).respond([{ id: 1, name: "Alice" }]);

      const result = await db.select().from(schema.users);
      expect(result).toEqual([{ id: 1, name: "Alice" }]);
    });

    it("should not match when regex doesn't match", async () => {
      mock.onSql(/from "posts"/).respond([{ id: 1, title: "Hello" }]);

      await expect(db.select().from(schema.users)).rejects.toThrow(
        /No mock registered/
      );
    });
  });

  describe("SQL substring matching", () => {
    it("should match by substring", async () => {
      mock.onSqlContaining('"users"').respond([{ id: 1, name: "Alice" }]);

      const result = await db.select().from(schema.users);
      expect(result).toEqual([{ id: 1, name: "Alice" }]);
    });
  });

  describe("exact param matching", () => {
    it("should match only when params match with .withExactParams()", async () => {
      mock
        .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
        .withExactParams()
        .respond([{ id: 1, name: "Alice" }]);

      // Different param value should NOT match
      await expect(
        db.select().from(schema.users).where(eq(schema.users.id, 999))
      ).rejects.toThrow(/No mock registered/);

      // Same param value should match
      const result = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));

      expect(result).toEqual([{ id: 1, name: "Alice" }]);
    });
  });

  describe("partial matching", () => {
    it("should match queries with extra clauses when using .partial()", async () => {
      mock
        .on(db.select().from(schema.users))
        .partial()
        .respond([{ id: 1, name: "Alice" }]);

      // Query with where clause should match the partial mock
      const result = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));

      expect(result).toEqual([{ id: 1, name: "Alice" }]);
    });

    it("should match the base query too", async () => {
      mock
        .on(db.select().from(schema.users))
        .partial()
        .respond([{ id: 1, name: "Alice" }]);

      const result = await db.select().from(schema.users);
      expect(result).toEqual([{ id: 1, name: "Alice" }]);
    });

    it("should not match unrelated queries", async () => {
      mock
        .on(db.select().from(schema.users))
        .partial()
        .respond([{ id: 1, name: "Alice" }]);

      await expect(db.select().from(schema.posts)).rejects.toThrow(
        /No mock registered/
      );
    });

    it("should support .withExactParams() on partial matches", async () => {
      mock
        .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
        .partial()
        .withExactParams()
        .respond([{ id: 1, name: "Alice" }]);

      // Same SQL prefix + same params → match
      const result = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));
      expect(result).toEqual([{ id: 1, name: "Alice" }]);

      // Same SQL prefix + different params → no match
      await expect(
        db.select().from(schema.users).where(eq(schema.users.id, 999))
      ).rejects.toThrow(/No mock registered/);
    });
  });

  describe("specificity-based priority", () => {
    it("exact+params wins over exact without params", async () => {
      mock
        .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
        .respond([{ name: "Any params" }]);

      mock
        .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
        .withExactParams()
        .respond([{ name: "Exact params" }]);

      const result = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));

      expect(result).toEqual([{ name: "Exact params" }]);
    });

    it("exact wins over partial", async () => {
      mock
        .on(db.select().from(schema.users))
        .partial()
        .respond([{ name: "Partial" }]);

      mock
        .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
        .respond([{ name: "Exact" }]);

      const result = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));

      expect(result).toEqual([{ name: "Exact" }]);
    });

    it("exact wins over partial regardless of registration order", async () => {
      // Register exact FIRST, partial SECOND
      mock
        .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
        .respond([{ name: "Exact" }]);

      mock
        .on(db.select().from(schema.users))
        .partial()
        .respond([{ name: "Partial" }]);

      const result = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));

      expect(result).toEqual([{ name: "Exact" }]);
    });

    it("partial wins over regex/contains", async () => {
      mock.onSql(/from "users"/).respond([{ name: "Regex" }]);

      mock
        .on(db.select().from(schema.users))
        .partial()
        .respond([{ name: "Partial" }]);

      const result = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));

      expect(result).toEqual([{ name: "Partial" }]);
    });

    it("partial wins over regex regardless of registration order", async () => {
      mock
        .on(db.select().from(schema.users))
        .partial()
        .respond([{ name: "Partial" }]);

      mock.onSql(/from "users"/).respond([{ name: "Regex" }]);

      const result = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));

      expect(result).toEqual([{ name: "Partial" }]);
    });

    it("within same specificity, last-registered wins", async () => {
      mock.onSql(/from "users"/).respond([{ name: "First regex" }]);
      mock.onSql(/from "users"/).respond([{ name: "Second regex" }]);

      const result = await db.select().from(schema.users);
      expect(result).toEqual([{ name: "Second regex" }]);
    });

    it("partial match falls through when exact match doesn't apply", async () => {
      mock
        .on(db.select().from(schema.users))
        .partial()
        .respond([{ name: "Catch-all" }]);

      mock
        .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
        .withExactParams()
        .respond([{ name: "Specific" }]);

      // Exact mock matches id=1
      const specific = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));
      expect(specific).toEqual([{ name: "Specific" }]);

      // Partial mock catches other where clauses
      const other = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 999));
      expect(other).toEqual([{ name: "Catch-all" }]);

      // Partial mock catches the base query too
      const base = await db.select().from(schema.users);
      expect(base).toEqual([{ name: "Catch-all" }]);
    });
  });

  describe("mock priority (legacy)", () => {
    it("should use the last registered mock (most specific wins)", async () => {
      mock.on(db.select().from(schema.users)).respond([{ name: "General" }]);
      mock
        .on(db.select().from(schema.users).where(eq(schema.users.id, 1)))
        .respond([{ name: "Specific" }]);

      // The specific mock has different SQL, so the general one still matches
      const generalResult = await db.select().from(schema.users);
      expect(generalResult).toEqual([{ name: "General" }]);

      // The specific mock matches its own SQL
      const specificResult = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 1));
      expect(specificResult).toEqual([{ name: "Specific" }]);
    });
  });

  describe(".once() mocks", () => {
    it("should expire after first match", async () => {
      mock.on(db.select().from(schema.users)).once().respond([{ name: "Once" }]);

      const first = await db.select().from(schema.users);
      expect(first).toEqual([{ name: "Once" }]);

      // Second call should fail — the once mock is consumed
      await expect(db.select().from(schema.users)).rejects.toThrow(
        /No mock registered/
      );
    });

    it("should fall through to a persistent mock after once is consumed", async () => {
      mock.on(db.select().from(schema.users)).respond([{ name: "Persistent" }]);
      mock
        .on(db.select().from(schema.users))
        .once()
        .respond([{ name: "Once" }]);

      const first = await db.select().from(schema.users);
      expect(first).toEqual([{ name: "Once" }]);

      const second = await db.select().from(schema.users);
      expect(second).toEqual([{ name: "Persistent" }]);
    });
  });

  describe("error messages", () => {
    it("should include SQL in the error when no mock matches", async () => {
      await expect(db.select().from(schema.users)).rejects.toThrow(/"users"/);
    });

    it("should list registered mocks in the error", async () => {
      mock.on(db.select().from(schema.posts)).respond([]);

      await expect(db.select().from(schema.users)).rejects.toThrow(
        /Registered mocks/
      );
    });
  });
});
