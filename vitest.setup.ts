// Global test setup (vitest): clean database + the single settings row before each test.
import { beforeEach } from 'vitest'
import { resetDatabase, reseedSettings } from './tests/helpers/db'

beforeEach(async () => {
  await resetDatabase()
  await reseedSettings()
})
