'use client'

import { FileSpreadsheet, TriangleAlert } from 'lucide-react'
import { useActionState, useEffect, useState } from 'react'
import { importGuestsAction, type ImportGuestsState } from '@/features/guests/actions'
import { formatImportSummary, formatImportWarning } from '@/features/guests/import-report'
import { fieldErrorClass, helperClass, labelClass, requiredMark } from './styles'
import { Button } from './ui/Button'
import { useToast } from './ui/Toast'

const MAX_BYTES = 1024 * 1024

export function GuestImportForm({
  onImported,
}: {
  onImported?: (state: NonNullable<ImportGuestsState>) => void
}) {
  const [state, action, pending] = useActionState<ImportGuestsState, FormData>(importGuestsAction, null)
  const [fileName, setFileName] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (!state) return
    if (state.error) toast.error(state.error)
    else {
      toast.success(
        `${state.imported} ${state.imported === 1 ? 'convidado importado' : 'convidados importados'}`,
      )
      onImported?.(state)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form action={action} aria-label="Importar convidados" className="flex flex-col gap-6">
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
        <p className="text-[15px] leading-relaxed text-wine">
          Planilha CSV (separada por <code>;</code> ou <code>,</code>) com a coluna <code>nome</code> e, se
          quiser, <code>telefone</code> e <code>limite_acompanhantes</code>.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="import-file" className={labelClass}>
            <span>
              Arquivo CSV
              <span aria-hidden="true" className={`${requiredMark} ml-0.5`}>
                *
              </span>
            </span>
          </label>
          <div className="relative flex min-h-28 flex-col items-center justify-center gap-2 border border-dashed border-hairline-strong bg-blush/30 px-4 py-5 text-center transition-colors duration-(--dur-micro) hover:border-seal hover:bg-blush/60 has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-wine">
            <FileSpreadsheet aria-hidden="true" className="size-6 text-seal" strokeWidth={1.5} />
            <span aria-hidden="true" className="text-sm font-normal text-wine">
              {fileName ?? 'Escolher arquivo .csv'}
            </span>
            <input
              id="import-file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              aria-describedby="import-help"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0]
                setFileName(file?.name ?? null)
                e.currentTarget.setCustomValidity(
                  file && file.size > MAX_BYTES ? 'O arquivo deve ter no máximo 1 MB.' : '',
                )
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>
          <p id="import-help" className={helperClass}>
            Até 1 MB e 1000 convidados. Importar o mesmo arquivo de novo cria convidados repetidos.
          </p>
        </div>
      </fieldset>
      {state && (
        <div className="border border-hairline bg-paper p-4 text-sm">
          {state.error ? (
            <p className={fieldErrorClass}>{state.error}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className={state.errors.length ? 'text-wine' : 'text-sage'}>{formatImportSummary(state)}</p>
              {state.warnings && state.warnings.length > 0 && (
                // imported anyway: warnings never block a row (errors do)
                <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
                  <p id="import-warnings" className="flex items-center gap-1.5 font-medium text-gold-text">
                    <TriangleAlert aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                    Avisos
                  </p>
                  <ul aria-labelledby="import-warnings" className="flex flex-col gap-1 text-wine">
                    {state.warnings.map((w) => (
                      <li key={w.line}>{formatImportWarning(w)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end border-t border-hairline pt-5">
        <Button type="submit" pending={pending} pendingLabel="Importando…">
          Importar
        </Button>
      </div>
    </form>
  )
}
