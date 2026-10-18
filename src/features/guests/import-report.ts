// Dependency-free so the admin import form (client) can format the report.
export type CsvLineError = { line: number; reason: string }

/** pt-BR import report, e.g. "2 importados, 1 erro (linha 5: Telefone inválido)". */
export function formatImportSummary(r: { imported: number; errors: CsvLineError[] }): string {
  const imported = `${r.imported} ${r.imported === 1 ? 'importado' : 'importados'}`
  if (r.errors.length === 0) return imported
  const details = r.errors.map((e) => `linha ${e.line}: ${e.reason}`).join('; ')
  return `${imported}, ${r.errors.length} ${r.errors.length === 1 ? 'erro' : 'erros'} (${details})`
}
