/** Brazilian CPF check (11 digits, both check digits, not all-equal). Punctuation is ignored. */
export function isValidCpf(input: string): boolean {
  if (!/^[\d.\-\s]*$/.test(input)) return false
  const d = input.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const digits = d.split('').map(Number)
  for (const len of [9, 10]) {
    let sum = 0
    for (let i = 0; i < len; i++) sum += digits[i] * (len + 1 - i)
    const check = ((sum * 10) % 11) % 10
    if (check !== digits[len]) return false
  }
  return true
}
