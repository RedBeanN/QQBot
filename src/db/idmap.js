const { resolve } = require('path')
const sqlite = require('promised-sqlite3')
const { existsSync, mkdirSync } = require('fs')

const randomInt = () => {
  return Math.floor(Math.random() * 2_000_000_000) + 100_000_000
}
/**
 * @typedef IdMap
 * @prop { string } realId
 * @prop { number } virtualId
 */
const idmap = {
  _baseDir: __dirname,
  _db: null,
  _init (dbDir = idmap._baseDir) {
    if (idmap._db) return idmap._db
    const dbpath = resolve(dbDir, 'db/idmap.sqlite')
    console.log(`DBPath: ${dbpath}`)
    if (!existsSync(resolve(dbDir, 'db'))) {
      mkdirSync(resolve(dbDir, 'db'), { recursive: true })
    }
    idmap._db = new Promise(async resolve => {
      const db = await sqlite.AsyncDatabase.open(dbpath)
      await db.run(
        "CREATE TABLE IF NOT EXISTS idmap (realId TEXT PRIMARY KEY UNIQUE, virtualId INTEGER)"
      )
      resolve(db)
    })
    return idmap._db
  },
  /** @returns { Promise<IdMap|undefined> } */
  async getByVirtualId (virtualId = 0) {
    const db = await idmap._init()
    return db.get(
      "SELECT * FROM idmap WHERE virtualId = ?",
      virtualId,
    )
  },
  /** @returns { Promise<IdMap|undefined> } */
  async getByRealId (realId = 0) {
    const db = await idmap._init()
    return db.get(
      "SELECT * FROM idmap WHERE realId = ?",
      realId,
    )
  },
  async createVirtualId () {
    const db = await idmap._init()
    let id = randomInt()
    while (true) {
      const fromDb = await idmap.getByVirtualId(id)
      if (!fromDb) {
        break
      }
    }
    return id
  },
  async createVirtualIdForRealId (realId = '') {
    const db = await idmap._init()
    const fromDb = await idmap.getByRealId(realId)
    if (fromDb) {
      return fromDb
    }
    const virtualId = await idmap.createVirtualId()
    console.log(`Create ${virtualId} for ${realId}`)
    await db.run(
      "INSERT INTO idmap (virtualId, realId) VALUES (?, ?)",
      virtualId,
      realId,
    )
    return {
      virtualId, realId,
    }
  },
  async insertOrUpdate (realId = '', virtualId = 0) {
    const db = await idmap._init()
    const res = await db.run(
      'INSERT INTO idmap (realId, virtualId) VALUES(?, ?) ON CONFLICT(realId) DO UPDATE SET virtualId = ?',
      realId,
      virtualId,
      virtualId,
    )
    // console.log(res)
    return res
  },
  async getRealId (virtualId = 0) {
    const idMap = await idmap.getByVirtualId(virtualId)
    if (!idMap) {
      return {
        error: true,
        message: 'Virtual id not found'
      }
    }
    return idMap.realId
  },
  async getVirtualId (realId = '') {
    const { virtualId } = await idmap.createVirtualIdForRealId(realId)
    return virtualId
  },
  async setVirtualId (realId = '', virtualId = 0) {
    return idmap.insertOrUpdate(realId, virtualId)
  },
  async updateVirtualId (oldId = 0, newId = 0) {
    const isDup = await idmap.getByVirtualId(newId)
    if (isDup) {
      return {
        error: true,
        message: 'Duplicated virtual id'
      }
    }
    const fromDb = await idmap.getByVirtualId(oldId)
    if (!fromDb) {
      return {
        code: 404,
        message: 'Old ID not found'
      }
    }
    return idmap.insertOrUpdate(fromDb.realId, newId)
  }
}
module.exports = idmap
