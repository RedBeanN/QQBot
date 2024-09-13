const { resolve } = require('path')
const sqlite = require('promised-sqlite3')
const { existsSync, mkdirSync } = require('fs')
const { randomBytes } = require('crypto')

const randomHash = () => {
  return randomBytes(4).toString('hex')
}

/**
 * @typedef UrlMap
 * @prop { string } url
 * @prop { string } hash
 */
const _dbpath = resolve(__dirname, 'db/url.sqlite')
if (!existsSync(resolve(__dirname, 'db'))) {
  mkdirSync(resolve(__dirname, 'db'))
}
const _db = sqlite.AsyncDatabase.open(_dbpath)
const _init = async () => {
  const db = await _db
  await db.run(
    "CREATE TABLE IF NOT EXISTS url (url TEXT PRIMARY KEY UNIQUE, hash TEXT)"
  )
  return db
}
/** @returns { Promise<UrlMap|undefined> } */
const getByHash = async (hash = '') => {
  const db = await _init()
  return db.get(
    "SELECT * FROM url WHERE hash = ?",
    hash,
  )
}
/** @returns { Promise<UrlMap|undefined> } */
const getByUrl = async (url = 0) => {
  const db = await _init()
  return db.get(
    "SELECT * FROM url WHERE url = ?",
    url,
  )
}
const createHash = async () => {
  const db = await _init()
  let hash = randomHash()
  while (true) {
    const fromDb = await getByHash(hash)
    if (!fromDb) {
      break
    }
  }
  return hash
}
const createHashForUrl = async (url = '') => {
  const db = await _init()
  const fromDb = await getByUrl(url)
  if (fromDb) {
    return fromDb
  }
  const hash = await createHash()
  console.log(`Create ${hash} for ${url}`)
  await db.run(
    "INSERT INTO url (hash, url) VALUES (?, ?)",
    hash,
    url,
  )
  return {
    hash, url,
  }
}
const urlmap = {
  async getUrl (hash = 0) {
    const url = await getByHash(hash)
    if (!url) {
      return {
        error: true,
        message: 'Hash not found'
      }
    }
    return url.url
  },
  async getHash (url = '') {
    const { hash } = await createHashForUrl(url)
    return hash
  },
}
module.exports = urlmap
