'use client'

import { FileMusic, Music, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { mediaUrl, restoredMusicKey } from '@/features/media/keys'
import { readDraft } from '@/lib/form-draft'
import { fieldErrorClass, focusRing, helperClass, inputClass, labelClass } from './styles'
import { Button, Spinner } from './ui/Button'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Field, fieldDescribedBy } from './ui/Field'
import { useToast } from './ui/Toast'

const MAX_MUSIC_BYTES = 8 * 1024 * 1024
const MUSIC_TOO_LARGE = 'A música é grande demais (máx. 8 MB).'
const MUSIC_FAILED = 'Não foi possível enviar a música. Tente de novo.'
/** What the server accepts (it checks the bytes too); also lets phones offer their audio files. */
const ACCEPT = 'audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,.mp3,.m4a'

type UploadResponse = { ok: true; key: string; url: string } | { ok: false; error: string }

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

/**
 * "Música do convite" in Configurações: the file goes to POST /admin/api/music right away (music/<uuid>.ext
 * in the bucket, never in git); the settings form then saves only its key (hidden `musicKey`), so replacing
 * or removing takes effect with "Salvar", like every other setting.
 */
export function MusicField({
  savedKey,
  initialKey,
  startSeconds,
  keyError,
  startError,
  onUploadingChange,
}: {
  /** key stored in the database (to tell an unsaved change apart) */
  savedKey: string
  /** key the field starts with (the submitted one after a failed save) */
  initialKey: string
  startSeconds: string
  keyError?: string
  startError?: string
  onUploadingChange: (uploading: boolean) => void
}) {
  const toast = useToast()
  const [musicKey, setMusicKey] = useState(initialKey)
  const [fileLabel, setFileLabel] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // replacing asks after the file is picked, so the dialog can name it (and the picker opens straight from the click)
  const [confirm, setConfirm] = useState<{ kind: 'remove' } | { kind: 'replace'; file: File } | null>(null)
  const [status, setStatus] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLButtonElement>(null)
  const replaceRef = useRef<HTMLButtonElement>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // After a version-skew reload the draft holds the uploaded file's key (hidden inputs aren't refilled by
  // the draft restore). This child effect runs before useSkewSafeForm's (which then takes the draft); a
  // tampered value falls back to the saved key. Read after mount: the form is server-rendered.
  useEffect(() => {
    const draft = readDraft(window.location.pathname, 'settings')
    if (draft?.musicKey === undefined) return
    const restore = (key: string) => setMusicKey(key)
    restore(restoredMusicKey(draft.musicKey, initialKey))
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const setBusy = (busy: boolean) => {
    setUploading(busy)
    onUploadingChange(busy)
  }

  const pick = () => inputRef.current?.click()

  /** A picked or dropped file: uploaded right away, or after a confirmation when it replaces the current one. */
  function choose(file: File) {
    if (musicKey) setConfirm({ kind: 'replace', file })
    else void upload(file)
  }

  async function upload(file: File) {
    setError(null)
    if (file.size > MAX_MUSIC_BYTES) {
      setError(MUSIC_TOO_LARGE)
      toast.error(MUSIC_TOO_LARGE)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setStatus('Enviando música…')
    try {
      const body = new FormData()
      body.set('file', file)
      // manual: an expired session answers with a redirect to the login page, not JSON
      const res = await fetch('/admin/api/music', { method: 'POST', body, signal: controller.signal, redirect: 'manual' })
      const json: UploadResponse | null = res.headers.get('content-type')?.includes('application/json')
        ? await res.json()
        : null
      if (controller.signal.aborted) return
      if (json?.ok) {
        setMusicKey(json.key)
        setFileLabel(`${file.name} · ${formatSize(file.size)}`)
        setStatus('Música enviada.')
        toast.success('Música enviada. Clique em Salvar para aplicar no convite.')
        requestAnimationFrame(() => replaceRef.current?.focus())
      } else {
        const message = json && !json.ok ? json.error : MUSIC_FAILED
        setError(message)
        toast.error(message)
        setStatus('')
      }
    } catch {
      if (controller.signal.aborted) return
      setError(MUSIC_FAILED)
      toast.error(MUSIC_FAILED)
      setStatus('')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setBusy(false)
      }
    }
  }

  function remove() {
    setConfirm(null)
    setMusicKey('')
    setFileLabel(null)
    setError(null)
    setStatus('Música removida.')
    toast.success('Música removida. Clique em Salvar para aplicar no convite.')
    requestAnimationFrame(() => pickRef.current?.focus())
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) choose(file)
  }

  const unsaved = musicKey !== savedKey
  const shownError = error ?? keyError ?? null
  const ext = musicKey.endsWith('.m4a') ? 'M4A' : 'MP3'

  return (
    <>
      <div role="group" aria-labelledby="settings-music-label" className="flex flex-col gap-1.5">
        <span id="settings-music-label" className={labelClass}>
          <span>
            Arquivo de áudio
            <span aria-hidden="true" className="ml-1.5 font-normal text-muted">
              (opcional)
            </span>
          </span>
        </span>
        <input type="hidden" name="musicKey" value={musicKey} />
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          data-testid="music-input"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]
            // the same file can be picked again after an error
            e.currentTarget.value = ''
            if (file) choose(file)
          }}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!uploading) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {musicKey ? (
            <div
              className={`flex max-w-md flex-col gap-3 rounded-[2px] border bg-blush/40 p-4 ${
                dragging ? 'border-seal shadow-ring-seal' : 'border-hairline'
              }`}
            >
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-paper text-seal">
                  <FileMusic className="size-5" strokeWidth={1.5} />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-medium text-wine">{fileLabel ?? `Música do convite (${ext})`}</span>
                  <span className="text-[13px] text-muted">
                    {unsaved ? 'Nova música, ainda não salva.' : 'Toca no convite depois que o envelope é aberto.'}
                  </span>
                </div>
              </div>
              {/* metadata only: the preview downloads the song when the admin presses play */}
              <audio
                key={musicKey}
                controls
                preload="metadata"
                src={mediaUrl(musicKey)}
                aria-label="Prévia da música"
                data-testid="music-preview"
                className="w-full"
              />
              {uploading && (
                <span className="inline-flex items-center gap-2 text-[13px] font-medium text-wine">
                  <Spinner />
                  Enviando música…
                </span>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  ref={replaceRef}
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                  onClick={pick}
                  disabled={uploading}
                  aria-describedby="settings-music-help settings-music-error"
                >
                  Trocar música
                </Button>
                <Button
                  ref={removeRef}
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                  onClick={() => setConfirm({ kind: 'remove' })}
                  disabled={uploading}
                >
                  Remover música
                </Button>
              </div>
            </div>
          ) : (
            <button
              ref={pickRef}
              type="button"
              onClick={pick}
              disabled={uploading}
              aria-busy={uploading || undefined}
              aria-describedby="settings-music-help settings-music-error"
              className={`flex min-h-32 w-full max-w-md cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[2px] border border-dashed px-4 py-5 text-center transition-colors duration-(--dur-micro) hover:border-seal hover:bg-blush/60 disabled:cursor-wait ${
                dragging ? 'border-seal bg-blush/70' : 'border-hairline-strong bg-paper'
              } ${focusRing}`}
            >
              {uploading ? (
                <span className="inline-flex items-center gap-2 text-[15px] font-medium text-wine">
                  <Spinner />
                  Enviando música…
                </span>
              ) : (
                <>
                  <Music aria-hidden="true" className="size-6 text-seal" strokeWidth={1.5} />
                  <span className="text-[15px] font-medium text-seal">Escolher música</span>
                  <span aria-hidden="true" className="hidden text-[13px] text-muted sm:block">
                    ou arraste o arquivo aqui
                  </span>
                </>
              )}
            </button>
          )}
        </div>
        <p id="settings-music-help" className={helperClass}>
          MP3 ou M4A, até 8 MB. {unsaved && <strong className="font-medium text-wine">Clique em Salvar para aplicar.</strong>}
        </p>
        <p id="settings-music-error" role="alert" className={fieldErrorClass}>
          {shownError}
        </p>
        <span role="status" className="sr-only">
          {status}
        </span>
      </div>
      <Field
        id="settings-musicStartSeconds"
        label="Começar em (segundos)"
        error={startError}
        helper="Ponto da música onde o convite começa a tocar, de 0 a 600. Ex.: 30 para pular a introdução."
      >
        <input
          name="musicStartSeconds"
          type="number"
          inputMode="numeric"
          min={0}
          max={600}
          step={1}
          defaultValue={startSeconds}
          id="settings-musicStartSeconds"
          aria-invalid={!!startError}
          aria-describedby={fieldDescribedBy('settings-musicStartSeconds', true)}
          className={`${inputClass} max-w-40 tabular-nums`}
        />
      </Field>
      {confirm?.kind === 'remove' && (
        <ConfirmDialog
          title="Remover a música?"
          confirmLabel="Remover"
          pendingLabel="Removendo…"
          pending={false}
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
          returnFocusRef={removeRef}
        >
          O convite fica sem música depois que você salvar as configurações.
        </ConfirmDialog>
      )}
      {confirm?.kind === 'replace' && (
        <ConfirmDialog
          title="Trocar a música?"
          confirmLabel="Trocar"
          pendingLabel="Enviando…"
          pending={uploading}
          confirmVariant="primary"
          onConfirm={async () => {
            await upload(confirm.file)
            setConfirm(null)
          }}
          onCancel={() => setConfirm(null)}
          returnFocusRef={replaceRef}
        >
          “{confirm.file.name}” substitui a música atual no convite depois que você salvar as configurações.
        </ConfirmDialog>
      )}
    </>
  )
}
