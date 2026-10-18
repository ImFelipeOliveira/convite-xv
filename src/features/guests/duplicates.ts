// Dependency-free so admin client components can format the duplicate-phone warnings.

const listFormat = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' })

/** ['Ana', 'Bia', 'Caio'] → 'Ana, Bia e Caio'. */
export function joinNames(names: string[]): string {
  return listFormat.format(names)
}

/**
 * Guests whose phone is shared with at least one other guest → the names of those OTHER guests
 * (in list order). Guests without a phone are never duplicates.
 */
export function otherGuestsSharingPhone(
  list: Array<{ id: string; name: string; phone: string | null }>,
): Map<string, string[]> {
  const byPhone = new Map<string, Array<{ id: string; name: string }>>()
  for (const g of list) {
    if (!g.phone) continue
    const group = byPhone.get(g.phone) ?? []
    group.push({ id: g.id, name: g.name })
    byPhone.set(g.phone, group)
  }
  const out = new Map<string, string[]>()
  for (const group of byPhone.values()) {
    if (group.length < 2) continue
    for (const g of group) out.set(g.id, group.filter((o) => o.id !== g.id).map((o) => o.name))
  }
  return out
}
