'use client'

import { useActionState } from 'react'
import { importGuestsAction, type ImportGuestsState } from '@/features/guests/actions'
import { formatImportSummary } from '@/features/guests/import-report'
import { inputClass, primaryButtonClass } from './styles'

const MAX_BYTES = 1024 * 1024

export function GuestImportForm() {
  const [state, action, pending] = useActionState<ImportGuestsState, FormData>(
    importGuestsAction,
    null,
  )
  return (
    <form action={action} aria-label="Importar convidados" className="flex flex-col gap-3">
      <p className="text-sm">
        Planilha CSV (separada por ; ou ,) com a coluna <code>nome</code> e, opcionalmente,{' '}
        <code>telefone</code> e <code>limite_acompanhantes</code>. Até 1 MB e 1000 convidados.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Arquivo CSV
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              e.currentTarget.setCustomValidity(
                file && file.size > MAX_BYTES ? 'O arquivo deve ter no máximo 1 MB.' : '',
              )
            }}
            className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-blush file:px-2 file:py-1 file:text-wine`}
          />
        </label>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          Importar
        </button>
      </div>
      <p className="text-sm">Importar o mesmo arquivo de novo cria convidados repetidos.</p>
      <p role="status" className="text-sm">
        {state?.error && <span className="text-error">{state.error}</span>}
        {state && !state.error && (
          <span className="block">{formatImportSummary(state)}</span>
        )}
      </p>
    </form>
  )
}
