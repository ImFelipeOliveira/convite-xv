import { Writable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogger } from '../logger'

function capture() {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString())
      cb()
    },
  })
  return { lines, stream }
}

describe('logger', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('redacts private fields and keeps base fields', () => {
    const { lines, stream } = capture()
    const log = createLogger(stream, 'info')
    log.info(
      { phone: '+5595991234567', token: 'abc', guest: { phone: 'x', message: 'oi' }, guestId: 'g1' },
      'hello',
    )
    const row = JSON.parse(lines[0])
    expect(row.phone).toBe('[redacted]')
    expect(row.token).toBe('[redacted]')
    expect(row.guest.phone).toBe('[redacted]')
    expect(row.guest.message).toBe('[redacted]')
    expect(row.guestId).toBe('g1')
    expect(row.msg).toBe('hello')
    expect(row.service).toBe('convite-xv')
    expect(row.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('keeps pino msg next to a redacted message field', () => {
    const { lines, stream } = capture()
    createLogger(stream, 'info').info({ message: 'secret' }, 'kept msg')
    const row = JSON.parse(lines[0])
    expect(row.message).toBe('[redacted]')
    expect(row.msg).toBe('kept msg')
  })

  it('does not leak query data through err', () => {
    const token = 'AbCdEfGhIjKlMnOpQrStUv'
    const err = Object.assign(
      new Error('Failed query: insert ...\nparams: Ana,+5595991234567,minha mensagem,' + token),
      {
        query: 'insert into guests',
        params: ['Ana', '+5595991234567', 'minha mensagem', token],
        cause: Object.assign(new Error('duplicate key ... +5595991234567'), { code: '23505' }),
      },
    )
    err.name = 'DrizzleQueryError'
    const { lines, stream } = capture()
    const log = createLogger(stream, 'info')
    log.error({ err }, 'boom')
    log.error({ error: err }, 'boom2')
    for (const line of lines) {
      for (const s of ['+5595991234567', 'minha mensagem', token, 'Failed query']) {
        expect(line).not.toContain(s)
      }
      expect(line).toContain('23505')
      expect(line).toContain('DrizzleQueryError')
    }
    expect(lines).toHaveLength(2)
  })

  it('takes the level from LOG_LEVEL', () => {
    vi.stubEnv('LOG_LEVEL', 'warn')
    const { lines, stream } = capture()
    const log = createLogger(stream)
    log.info('skipped')
    log.warn('kept')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).msg).toBe('kept')
  })
})
