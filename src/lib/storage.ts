import * as SQLite from 'expo-sqlite';
import { PlannedRoute } from './routes';
let database: Promise<SQLite.SQLiteDatabase> | undefined;
function getDatabase() {
  if (!database) database = (async () => {
    const db = await SQLite.openDatabaseAsync('trail-runner.db');
    await db.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS routes (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);');
    return db;
  })().catch(error => { database = undefined; throw error; });
  return database;
}
export async function listRoutes(): Promise<PlannedRoute[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM routes ORDER BY rowid DESC');
  return rows.map(row => JSON.parse(row.data));
}
export async function saveRoute(route: PlannedRoute) {
  const db = await getDatabase();
  await db.runAsync('INSERT INTO routes (id, data) VALUES (?, ?)', route.id, JSON.stringify(route));
}
export async function deleteRoute(id: string) {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM routes WHERE id = ?', id);
}
