import Dexie, { type Table } from "dexie";

export interface Setting { key: string; value: unknown }

class SynesisDB extends Dexie {
  settings!: Table<Setting, string>;
  constructor(){
    super("synesis_db");
    this.version(1).stores({ settings: "key" });
  }
}

export const db = new SynesisDB();

export const saveSetting = (k:string,v:unknown)=>
  db.settings.put({ key:k, value:v });

export const loadSetting = async <T>(k:string, fallback:T): Promise<T> => {
  const row = await db.settings.get(k);
  return (row?.value as T) ?? fallback;
};
