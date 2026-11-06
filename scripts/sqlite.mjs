import { DatabaseSync } from 'node:sqlite';
export class LocalD1 {
  constructor(path=':memory:') { this.raw=new DatabaseSync(path); this.raw.exec('PRAGMA foreign_keys=ON'); }
  prepare(sql) {
    const database=this.raw;
    return {bind(...args){
      return {
        async all(){return {results:database.prepare(sql).all(...args)};},
        async first(){return database.prepare(sql).get(...args)||null;},
        async run(){const r=database.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}
      };
    }};
  }
  async batch(statements) {
    this.raw.exec('BEGIN');
    try{const result=[];for(const s of statements)result.push(await s.run());this.raw.exec('COMMIT');return result;}catch(e){this.raw.exec('ROLLBACK');throw e;}
  }
}
