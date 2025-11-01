import db from './db'

(async () => {
  await db.setValue('key1', 123)
})()
