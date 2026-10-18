/** Thin gold frame inset 14 px from its positioned parent; `double` adds the faint inner line at 19 px. */
export function Frame({ double = false }: { double?: boolean }) {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-[14px] border border-[rgba(184,149,90,.75)]" />
      {double && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-[19px] border border-[rgba(184,149,90,.3)]" />
      )}
    </>
  )
}
