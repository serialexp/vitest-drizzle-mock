import { drizzle } from "drizzle-orm/node-postgres";
import { mockDatabase } from "../src/index.js";
import * as schema from "./schema.js";

export function createTestDb() {
  const db = drizzle.mock({ schema });
  const mock = mockDatabase(db);
  return { db, mock };
}
