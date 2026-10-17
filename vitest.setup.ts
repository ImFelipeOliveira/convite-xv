// Setup global dos testes (vitest): banco limpo + linha única de config a cada teste.
import { beforeEach } from 'vitest'
import { limparBanco, reinserirConfig } from './tests/helpers/db'

beforeEach(async () => {
  await limparBanco()
  await reinserirConfig()
})
