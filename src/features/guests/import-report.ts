// Dependency-free so the admin import form (client) can format the report.
import { joinNames } from './duplicates'

export type CsvLineError = { line: number; reason: string }
/** A row imported anyway whose phone repeats existing guests or other rows of the file (their names). */
export type CsvLineWarning = { line: number; names: string[] }

/** "Linha 3: telefone repetido (Ana e Bia)". */
export function formatImportWarning(w: CsvLineWarning): string {
  return `Linha ${w.line}: telefone repetido (${joinNames(w.names)})`
}

/** pt-BR import report, e.g. "2 importados, 1 erro (linha 5: Telefone inválido)". */
export function formatImportSummary(r: { imported: number; errors: CsvLineError[] }): string {
  const imported = `${r.imported} ${r.imported === 1 ? 'importado' : 'importados'}`
  if (r.errors.length === 0) return imported
  const details = r.errors.map((e) => `linha ${e.line}: ${e.reason}`).join('; ')
  return `${imported}, ${r.errors.length} ${r.errors.length === 1 ? 'erro' : 'erros'} (${details})`
}
