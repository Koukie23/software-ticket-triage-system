import fs from "fs";
import { Pool, PoolClient } from "pg";
import { databaseUrl, sqlPath } from "./env";

export const pool = new Pool({ connectionString: databaseUrl });

export async function migrate(): Promise<void> {
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
