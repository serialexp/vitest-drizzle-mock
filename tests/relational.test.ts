import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers.js";

describe("relational queries", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let mock: ReturnType<typeof createTestDb>["mock"];

  beforeEach(() => {
    ({ db, mock } = createTestDb());
  });

  it("should mock db.query.users.findMany()", async () => {
    const mockUsers = [
      { id: 1, name: "Alice", email: "alice@test.com", createdAt: null },
      { id: 2, name: "Bob", email: "bob@test.com", createdAt: null },
    ];

    mock.on(db.query.users.findMany()).respond(mockUsers);

    const result = await db.query.users.findMany();
    expect(result).toEqual(mockUsers);
  });

  it("should mock db.query.users.findFirst()", async () => {
    const mockUser = { id: 1, name: "Alice", email: "alice@test.com", createdAt: null };

    mock.on(db.query.users.findFirst()).respond(mockUser);

    const result = await db.query.users.findFirst();
    expect(result).toEqual(mockUser);
  });

  it("should mock findMany with relations (with clause)", async () => {
    const mockUsersWithPosts = [
      {
        id: 1,
        name: "Alice",
        email: "alice@test.com",
        createdAt: null,
        posts: [
          { id: 1, title: "Hello", body: "World", authorId: 1 },
        ],
      },
    ];

    mock
      .on(db.query.users.findMany({ with: { posts: true } }))
      .respond(mockUsersWithPosts);

    const result = await db.query.users.findMany({ with: { posts: true } });
    expect(result).toEqual(mockUsersWithPosts);
  });
});
