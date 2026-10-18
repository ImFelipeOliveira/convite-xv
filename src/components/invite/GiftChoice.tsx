'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

// Shared between the Gifts and Pix sections and the RSVP "confirmed" screen on the same page: what this
// guest gave, so the RSVP screen swaps its "Ver lista de presentes" shortcut for a thank-you without a
// reload. Only rendered when the gift list is shown (flag on + non-empty catalog).

type GiftChoice = {
  /** reserved a gift, or gave in another way (a paid Pix) */
  hasGiven: boolean
  chosenNames: string[]
  setChosenNames: (names: string[]) => void
  /** amount of the guest's paid Pix (null: none) */
  pixPaidCents: number | null
  setPixPaid: (cents: number) => void
}

const GiftChoiceContext = createContext<GiftChoice | null>(null)

export function GiftChoiceProvider({
  chosenNames: initialNames,
  givenElsewhere,
  children,
}: {
  chosenNames: string[]
  /** computed server-side: a gift outside the list (today: the guest's paid Pix); counts after an undo */
  givenElsewhere: { pixPaidCents: number } | null
  children: ReactNode
}) {
  const [chosenNames, setChosenNames] = useState(initialNames)
  const [pixPaidCents, setPixPaid] = useState<number | null>(givenElsewhere?.pixPaidCents ?? null)
  return (
    <GiftChoiceContext.Provider
      value={{
        hasGiven: pixPaidCents !== null || chosenNames.length > 0,
        chosenNames,
        setChosenNames,
        pixPaidCents,
        setPixPaid,
      }}
    >
      {children}
    </GiftChoiceContext.Provider>
  )
}

/** null when the page shows no gift list. */
export function useGiftChoice(): GiftChoice | null {
  return useContext(GiftChoiceContext)
}
