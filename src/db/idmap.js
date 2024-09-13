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
const _dbpath = resolve(__dirname, 'db/idmap.sqlite')
if (!existsSync(resolve(__dirname, 'db'))) {
  mkdirSync(resolve(__dirname, 'db'))
}
const _db = sqlite.AsyncDatabase.open(_dbpath)
const _init = async () => {
  const db = await _db
  await db.run(
    "CREATE TABLE IF NOT EXISTS idmap (realId TEXT PRIMARY KEY UNIQUE, virtualId INTEGER)"
  )
  return db
}
/** @returns { Promise<IdMap|undefined> } */
const getByVirtualId = async (virtualId = 0) => {
  const db = await _init()
  return db.get(
    "SELECT * FROM idmap WHERE virtualId = ?",
    virtualId,
  )
}
/** @returns { Promise<IdMap|undefined> } */
const getByRealId = async (realId = 0) => {
  const db = await _init()
  return db.get(
    "SELECT * FROM idmap WHERE realId = ?",
    realId,
  )
}
const createVirtualId = async () => {
  const db = await _init()
  let id = randomInt()
  while (true) {
    const fromDb = await getByVirtualId(id)
    if (!fromDb) {
      break
    }
  }
  return id
}
const createVirtualIdForRealId = async (realId = '') => {
  const db = await _init()
  const fromDb = await getByRealId(realId)
  if (fromDb) {
    return fromDb
  }
  const virtualId = await createVirtualId()
  console.log(`Create ${virtualId} for ${realId}`)
  await db.run(
    "INSERT INTO idmap (virtualId, realId) VALUES (?, ?)",
    virtualId,
    realId,
  )
  return {
    virtualId, realId,
  }
}
const insertOrUpdate = async (realId = '', virtualId = 0) => {
  const db = await _init()
  const res = await db.run(
    'INSERT INTO idmap (realId, virtualId) VALUES(?, ?) ON CONFLICT(realId) DO UPDATE SET virtualId = ?',
    realId,
    virtualId,
    virtualId,
  )
  // console.log(res)
  return res
}
const idmap = {
  async getRealId (virtualId = 0) {
    const idMap = await getByVirtualId(virtualId)
    if (!idMap) {
      return {
        error: true,
        message: 'Virtual id not found'
      }
    }
    return idMap.realId
  },
  async getVirtualId (realId = '') {
    const { virtualId } = await createVirtualIdForRealId(realId)
    return virtualId
  },
  async setVirtualId (realId = '', virtualId = 0) {
    return insertOrUpdate(realId, virtualId)
  },
  async updateVirtualId (oldId = 0, newId = 0) {
    const isDup = await getByVirtualId(newId)
    if (isDup) {
      return {
        error: true,
        message: 'Duplicated virtual id'
      }
    }
    const fromDb = await getByVirtualId(oldId)
    if (!fromDb) {
      return {
        code: 404,
        message: 'Old ID not found'
      }
    }
    return insertOrUpdate(fromDb.realId, newId)
  }
}
module.exports = idmap
