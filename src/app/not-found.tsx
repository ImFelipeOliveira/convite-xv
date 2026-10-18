import { Frame } from '@/components/ornaments/Frame'
import { Monogram } from '@/components/ornaments/Monogram'

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 px-9 text-center font-display text-wine">
      <Frame double />
      <Monogram letter="I" decorative />
      <h1 className="font-script text-[44px] leading-[1.1] font-normal text-rose">Convite não encontrado.</h1>
      <p className="max-w-[300px] text-[18px] leading-normal text-deep-rose italic">
        Confira se o link está completo.
      </p>
    </main>
  )
}
