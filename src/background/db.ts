import type { IDBPDatabase } from 'idb'
import { openDB } from 'idb'
import { onMessage } from './utils'

/**
 *  封装indexDB方便background进行本地缓存
 *  暴露三个公共方法（异步调用）：
 *  getValue
 *  setValue
 *  deleteValue
 *
 *  同时注册这三个方法的Message消息，便于contentScript调用
 */
class CrxIndexDB {
  private database: string
  private tableName: string
  private db: any

  constructor(database: string, tableName: string) {
    this.database = database
    this.tableName = tableName
    this.createObjectStore()
    this.registerMessage()
  }

  public async getValue(keyName: string): Promise<any> {
    await this.dbReady()
    const { tableName } = this
    const tx = this.db.transaction(tableName, 'readonly')
    const store = tx.objectStore(tableName)
    const result = await store.get(keyName)
    return result.value
  }

  public async setValue(keyName: string, value: any) {
    await this.dbReady()
    const { tableName } = this
    const tx = this.db.transaction(tableName, 'readwrite')
    const store = tx.objectStore(tableName)
    const result = await store.put({
      keyName,
      value,
    })
    return result
  }

  public async deleteValue(keyName: string) {
    await this.dbReady()
    const { tableName } = this
    const tx = this.db.transaction(tableName, 'readwrite')
    const store = tx.objectStore(tableName)
    const result = await store.get(keyName)
    if (!result) {
      return result
    }
    await store.delete(keyName)
    return keyName
  }

  private sleep = (num): Promise<boolean> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true)
      }, num * 1000)
    })
  }

  private async dbReady() {
    if (!this.db) {
      await this.sleep(0.5)
      return await this.dbReady()
    }
    return true
  }

  private registerMessage() {
    onMessage('get-value-bg', async (params: { keyName: string }): Promise<any> => {
      try {
        return await this.getValue(params.keyName)
      }
      catch {
        return null
      }
    })
    onMessage('set-value-bg', async (params: { keyName: string, value: any }): Promise<any> => {
      try {
        const { keyName, value } = params
        return await this.setValue(keyName, value)
      }
      catch {
        return null
      }
    })
    onMessage('del-value-bg', async (params: { keyName: string }): Promise<any> => {
      try {
        return await this.deleteValue(params.keyName)
      }
      catch {
        return null
      }
    })
  }

  private async createObjectStore() {
    const tableName = this.tableName
    try {
      this.db = await openDB(this.database, 1, {
        upgrade(db: IDBPDatabase) {
          if (db.objectStoreNames.contains(tableName)) {
            return
          }
          db.createObjectStore(tableName, {
            keyPath: 'keyName',
          })
        },
      })
    }
    catch {
      return false
    }
  }
}

const db = new CrxIndexDB('crx_index_db', 'crx_bg_table')
export default db
