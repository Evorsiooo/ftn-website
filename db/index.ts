import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb(d1?: D1Database) {
  const dbInstance = d1 || ((process.env as any).DB as D1Database);
  return drizzle(dbInstance, { schema });
}

export type DbClient = ReturnType<typeof getDb>;
