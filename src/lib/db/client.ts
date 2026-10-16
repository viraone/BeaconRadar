import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * One connection pool per process (Next dev reloads modules, so cache on globalThis).
 * Server/worker only. Never import from client components.
 */
const globalForDb = globalThis as unknown as { __beaconradarSql?: ReturnType<typeof postgres> };

const sqlClient =
  globalForDb.__beaconradarSql ??
  postgres(env().DATABASE_URL, { max: 10, prepare: false, onnotice: () => {} });

if (process.env.NODE_ENV !== "production") globalForDb.__beaconradarSql = sqlClient;

export const db = drizzle(sqlClient, { schema });
export type Db = typeof db;
export { schema };
