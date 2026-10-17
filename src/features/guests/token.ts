import { customAlphabet } from 'nanoid'

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const nano = customAlphabet(ALPHABET, 22)

export function generateToken(): string {
  return nano()
}

export function isValidToken(t: string): boolean {
  return /^[0-9A-Za-z]{22}$/.test(t)
}
