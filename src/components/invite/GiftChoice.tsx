'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

// Shared between the Gifts section and the RSVP "confirmed" screen on the same page: which gifts this
// guest reserved, so the RSVP screen swaps its "Ver lista de presentes" shortcut for a thank-you without
// a reload. Only rendered when the gift list is shown (flag on + non-empty catalog).

type GiftChoice = {
  /** reserved a gift, or gave in another way (Pix, later) */
  hasGiven: boolean
  chosenNames: string[]
  setChosenNames: (names: string[]) => void
}

const GiftChoiceContext = createContext<GiftChoice | null>(null)

export function GiftChoiceProvider({
  hasGiven,
  chosenNames: initialNames,
  children,
}: {
  /** computed server-side (today: guestHasGift; Pix will be OR-ed in) */
  hasGiven: boolean
  chosenNames: string[]
  children: ReactNode
}) {
  const [chosenNames, setChosenNames] = useState(initialNames)
  // a gift given outside the list (no reservation behind it) keeps counting after an undo
  const givenElsewhere = hasGiven && initialNames.length === 0
  return (
    <GiftChoiceContext.Provider
      value={{ hasGiven: givenElsewhere || chosenNames.length > 0, chosenNames, setChosenNames }}
    >
      {children}
    </GiftChoiceContext.Provider>
  )
}

/** null when the page shows no gift list. */
export function useGiftChoice(): GiftChoice | null {
  return useContext(GiftChoiceContext)
}
