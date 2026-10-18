/** Fills `{nome}` (first name) and `{link}` in one pass, so values are never re-substituted. */
export function renderTemplate(template: string, v: { name: string; link: string }): string {
  const firstName = v.name.trim().split(/\s+/)[0] ?? ''
  return template.replace(/\{(nome|link)\}/g, (_, key: string) =>
    key === 'nome' ? firstName : v.link,
  )
}

const GREETINGS = ['Olá,', 'Oi,', 'Olá!']

/** Varies a leading "Olá," by seed so automatic sends are not byte-identical. */
export function varyGreeting(text: string, seed: number): string {
  if (!text.startsWith('Olá,')) return text
  const i = ((seed % GREETINGS.length) + GREETINGS.length) % GREETINGS.length
  return GREETINGS[i] + text.slice('Olá,'.length)
}
