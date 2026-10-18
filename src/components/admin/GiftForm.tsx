'use client'

import { ChevronRight, ImageOff, ImagePlus, ImageUp, Trash2 } from 'lucide-react'
import { useActionState, useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { saveGiftAction, type GiftFormState } from '@/features/gifts/admin-actions'
import { fieldErrorClass, focusRing, helperClass, inputClass, labelClass } from './styles'
import { mediaUrl } from '@/features/media/keys'
import { readDraft } from '@/lib/form-draft'
import { useImageFailed } from '@/lib/use-image-failed'
import { useSkewSafeForm } from './skew-recovery'
import { Button, Spinner } from './ui/Button'
import { Field, fieldDescribedBy } from './ui/Field'
import { useToast } from './ui/Toast'

export type GiftFormGift = {
  id: string
  name: string
  category: string
  /** form value, e.g. "250,90" ('' when none) */
  price: string
  purchaseUrl: string
  imageUrl: string
  /** uploaded photo key ('' when none) */
  imageKey: string
  sortOrder: number
}

type Props = {
  /** Present when editing; absent for a new gift. */
  gift?: GiftFormGift
  /** Existing categories offered as suggestions. */
  categories: string[]
  /** Called after the server confirmed the save (closes the sheet). */
  onSaved?: () => void
  onCancel?: () => void
}

/** Live preview of the photo URL (https only, like the server rule). */
function PhotoPreview({ url }: { url: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const valid = /^https:\/\/\S+$/i.test(url.trim())
  return (
    <div className="grid aspect-[4/3] w-40 place-items-center overflow-hidden rounded-[2px] border border-hairline bg-blush/50">
      {valid && failed !== url ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary store URLs, no next/image remote config
        <img
          key={url}
          src={url.trim()}
          alt="Prévia da foto"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(url)}
          className="size-full object-cover"
        />
      ) : (
        <span className="flex flex-col items-center gap-1 px-3 text-center text-[13px] text-muted">
          <ImageOff aria-hidden="true" className="size-5" strokeWidth={1.5} />
          {valid ? 'Não foi possível carregar a foto.' : 'Sem foto'}
        </span>
      )}
    </div>
  )
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024
const PHOTO_TOO_LARGE = 'A foto é grande demais (máx. 8 MB).'
const PHOTO_FAILED = 'Não foi possível enviar a foto. Tente de novo.'

type UploadResponse = { ok: true; key: string; previewUrl: string } | { ok: false; error: string }

/**
 * Uploaded photo: file picker (camera or gallery on phones; accept lists what the server takes), drag-and-drop on desktop, live preview,
 * "Trocar foto" / "Remover foto". The photo goes to POST /admin/api/gift-image right away; the form
 * then saves only its key (hidden `imageKey`).
 */
function GiftPhotoField({
  prefix,
  initialKey,
  uploading,
  onUploadingChange,
}: {
  prefix: string
  initialKey: string
  uploading: boolean
  onUploadingChange: (uploading: boolean) => void
}) {
  const [imageKey, setImageKey] = useState(initialKey)
  const [preview, setPreview] = useState<string | null>(initialKey ? mediaUrl(initialKey) : null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLButtonElement>(null)
  const replaceRef = useRef<HTMLButtonElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { failed: previewFailed, imgRef, onError: onPreviewError } = useImageFailed(preview)
  const labelId = `${prefix}-photo-label`
  const errorId = `${prefix}-photo-error`
  const helpId = `${prefix}-photo-help`

  // the sheet may close mid-upload: drop the request with it
  useEffect(() => () => abortRef.current?.abort(), [])

  const pick = () => inputRef.current?.click()

  async function upload(file: File) {
    setError(null)
    if (file.size > MAX_PHOTO_BYTES) {
      setError(PHOTO_TOO_LARGE)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    onUploadingChange(true)
    setStatus('Enviando foto…')
    try {
      const body = new FormData()
      body.set('file', file)
      // manual: an expired session answers with a redirect to the login page, not JSON
      const res = await fetch('/admin/api/gift-image', {
        method: 'POST',
        body,
        signal: controller.signal,
        redirect: 'manual',
      })
      const json: UploadResponse | null = res.headers.get('content-type')?.includes('application/json')
        ? await res.json()
        : null
      if (controller.signal.aborted) return
      if (json?.ok) {
        setImageKey(json.key)
        setPreview(json.previewUrl)
        setStatus('Foto enviada.')
        // the picker button was replaced by the preview: keep keyboard users here
        requestAnimationFrame(() => replaceRef.current?.focus())
      } else {
        setError(json && !json.ok ? json.error : PHOTO_FAILED)
        setStatus('')
      }
    } catch {
      if (controller.signal.aborted) return
      setError(PHOTO_FAILED)
      setStatus('')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        onUploadingChange(false)
      }
    }
  }

  function remove() {
    setImageKey('')
    setPreview(null)
    setError(null)
    setStatus('Foto removida.')
    requestAnimationFrame(() => pickRef.current?.focus())
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) void upload(file)
  }

  const describedBy = `${helpId} ${errorId}`

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <span id={labelId} className={labelClass}>
        <span>
          Foto do presente
          <span aria-hidden="true" className="ml-1.5 font-normal text-muted">
            (opcional)
          </span>
        </span>
      </span>
      <input type="hidden" name="imageKey" value={imageKey} />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid="gift-photo-input"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          // the same file can be picked again after an error
          e.currentTarget.value = ''
          if (file) void upload(file)
        }}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!uploading) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="flex flex-wrap items-end gap-4"
      >
        {preview ? (
          <>
            <div
              className={`relative grid aspect-[4/3] w-40 place-items-center overflow-hidden rounded-[2px] border bg-blush/50 ${
                dragging ? 'border-seal shadow-ring-seal' : 'border-hairline'
              }`}
            >
              {previewFailed ? (
                <span className="flex flex-col items-center gap-1 px-3 text-center text-[13px] text-muted">
                  <ImageOff aria-hidden="true" className="size-5" strokeWidth={1.5} />
                  Não foi possível carregar a foto.
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- our own /media/ photo
                <img
                  src={preview}
                  alt="Prévia da foto"
                  ref={imgRef}
                  onError={onPreviewError}
                  className="size-full object-cover"
                />
              )}
              {uploading && (
                <span className="absolute inset-0 grid place-items-center bg-paper/80 text-[13px] font-medium text-wine">
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    Enviando foto…
                  </span>
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                ref={replaceRef}
                variant="secondary"
                size="sm"
                icon={<ImageUp aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                onClick={pick}
                disabled={uploading}
                aria-describedby={describedBy}
              >
                Trocar foto
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                onClick={remove}
                disabled={uploading}
              >
                Remover foto
              </Button>
            </div>
          </>
        ) : (
          <button
            ref={pickRef}
            type="button"
            onClick={pick}
            disabled={uploading}
            aria-busy={uploading || undefined}
            aria-describedby={describedBy}
            className={`flex min-h-32 w-full max-w-80 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[2px] border border-dashed px-4 py-5 text-center transition-colors duration-(--dur-micro) hover:border-seal hover:bg-blush/60 disabled:cursor-wait ${
              dragging ? 'border-seal bg-blush/70' : 'border-hairline-strong bg-paper'
            } ${focusRing}`}
          >
            {uploading ? (
              <span className="inline-flex items-center gap-2 text-[15px] font-medium text-wine">
                <Spinner />
                Enviando foto…
              </span>
            ) : (
              <>
                <ImagePlus aria-hidden="true" className="size-6 text-seal" strokeWidth={1.5} />
                <span className="text-[15px] font-medium text-seal">Escolher foto</span>
                <span aria-hidden="true" className="hidden text-[13px] text-muted sm:block">
                  ou arraste a imagem aqui
                </span>
              </>
            )}
          </button>
        )}
      </div>
      <p id={helpId} className={helperClass}>
        JPG, PNG ou WEBP, até 8 MB.
      </p>
      <p id={errorId} role="alert" className={fieldErrorClass}>
        {error}
      </p>
      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  )
}

export function GiftForm({ gift, categories, onSaved, onCancel }: Props) {
  const draftKey = gift ? `gift:${gift.id}` : 'gift:new'
  const { action: safeAction, formRef } = useSkewSafeForm(saveGiftAction, draftKey)
  const [state, action, pending] = useActionState<GiftFormState, FormData>(safeAction, null)
  const toast = useToast()
  const uid = useId()

  useEffect(() => {
    if (!state) return
    if (state.ok) {
      toast.success(state.message)
      onSaved?.()
    } else if (state.error) {
      toast.error(state.error)
    } else {
      toast.error('Revise os campos destacados.')
    }
    // only react to a new action result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const failed = state && !state.ok ? state : null
  const values = failed?.values ?? {
    name: gift?.name ?? '',
    category: gift?.category ?? '',
    price: gift?.price ?? '',
    purchaseUrl: gift?.purchaseUrl ?? '',
    imageUrl: gift?.imageUrl ?? '',
    imageKey: gift?.imageKey ?? '',
    sortOrder: String(gift?.sortOrder ?? 0),
  }
  const errors = failed?.fieldErrors ?? {}
  const prefix = gift ? `gift-${gift.id}` : 'gift-new'
  // reloaded after a deploy mid-edit: the skew draft holds the uploaded photo's key (never the file) and
  // the image link. The hidden imageKey and the photo/link state can't be refilled from the DOM, so they
  // start from the draft here (read only: useSkewSafeForm takes it and refills the plain fields after mount).
  // GiftForm only mounts inside a client-opened sheet, so reading sessionStorage here can't mismatch SSR.
  const [restored] = useState(() =>
    typeof window === 'undefined' ? null : readDraft(window.location.pathname, draftKey),
  )
  const initialImageKey = restored?.imageKey ?? values.imageKey
  const [imageUrl, setImageUrl] = useState(restored?.imageUrl ?? values.imageUrl)
  const [uploading, setUploading] = useState(false)
  const [linkOpen, setLinkOpen] = useState(!!(restored?.imageUrl ?? values.imageUrl))
  const listId = `${uid}-categories`

  return (
    <form ref={formRef} action={action} aria-label={gift ? 'Editar presente' : 'Novo presente'} className="flex flex-col gap-6">
      {gift && <input type="hidden" name="id" value={gift.id} />}
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
        <Field id={`${prefix}-name`} label="Nome" required error={errors.name}>
          <input
            name="name"
            required
            maxLength={120}
            autoComplete="off"
            autoFocus
            data-autofocus
            defaultValue={values.name}
            aria-invalid={!!errors.name}
            id={`${prefix}-name`}
            aria-describedby={fieldDescribedBy(`${prefix}-name`, false)}
            className={inputClass}
          />
        </Field>
        <Field
          id={`${prefix}-category`}
          label="Categoria"
          error={errors.category}
          helper="Agrupa os presentes no convite. Sem categoria, vai para “Outros”."
        >
          <input
            name="category"
            maxLength={40}
            autoComplete="off"
            list={listId}
            placeholder="Ex.: Quarto"
            defaultValue={values.category}
            aria-invalid={!!errors.category}
            id={`${prefix}-category`}
            aria-describedby={fieldDescribedBy(`${prefix}-category`, true)}
            className={inputClass}
          />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field
          id={`${prefix}-price`}
          label="Preço aproximado"
          error={errors.price}
          helper="Só uma referência para o convidado."
        >
          <div className="relative max-w-56">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-base text-muted"
            >
              R$
            </span>
            <input
              name="price"
              inputMode="decimal"
              autoComplete="off"
              placeholder="250,00"
              defaultValue={values.price}
              aria-invalid={!!errors.price}
              id={`${prefix}-price`}
              aria-describedby={fieldDescribedBy(`${prefix}-price`, true)}
              className={`${inputClass} pl-11 tabular-nums`}
            />
          </div>
        </Field>
        <Field
          id={`${prefix}-purchase`}
          label="Link de compra sugerido"
          error={errors.purchaseUrl}
          helper="Ex.: link da Amazon. O convidado compra onde preferir."
        >
          <input
            name="purchaseUrl"
            inputMode="url"
            maxLength={2048}
            autoComplete="off"
            placeholder="https://"
            defaultValue={values.purchaseUrl}
            aria-invalid={!!errors.purchaseUrl}
            id={`${prefix}-purchase`}
            aria-describedby={fieldDescribedBy(`${prefix}-purchase`, true)}
            className={inputClass}
          />
        </Field>
        <GiftPhotoField
          prefix={prefix}
          initialKey={initialImageKey}
          uploading={uploading}
          onUploadingChange={setUploading}
        />
        {/* secondary: a pasted product image link (the uploaded photo wins when both exist) */}
        <details
          open={linkOpen || !!errors.imageUrl}
          onToggle={(e) => setLinkOpen(e.currentTarget.open)}
          className="group -mt-2"
        >
          <summary
            className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-full text-sm font-medium text-seal hover:text-wine [&::-webkit-details-marker]:hidden ${focusRing}`}
          >
            <ChevronRight
              aria-hidden="true"
              className="size-4 transition-transform duration-(--dur-micro) group-open:rotate-90"
              strokeWidth={1.75}
            />
            Ou cole um link de imagem
          </summary>
          <div className="mt-2 flex flex-col gap-4">
            <Field
              id={`${prefix}-image`}
              label="Link da imagem"
              error={errors.imageUrl}
              helper="Endereço (https://) de uma imagem do produto. Se houver foto enviada, ela é usada no lugar."
            >
              <input
                name="imageUrl"
                inputMode="url"
                maxLength={2048}
                autoComplete="off"
                placeholder="https://"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                aria-invalid={!!errors.imageUrl}
                id={`${prefix}-image`}
                aria-describedby={fieldDescribedBy(`${prefix}-image`, true)}
                className={inputClass}
              />
            </Field>
            <PhotoPreview url={imageUrl} />
          </div>
        </details>
        <Field
          id={`${prefix}-order`}
          label="Ordem"
          error={errors.sortOrder}
          helper="Menores aparecem primeiro dentro da categoria."
        >
          <input
            name="sortOrder"
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            step={1}
            defaultValue={values.sortOrder}
            aria-invalid={!!errors.sortOrder}
            id={`${prefix}-order`}
            aria-describedby={fieldDescribedBy(`${prefix}-order`, true)}
            className={`${inputClass} max-w-40 tabular-nums`}
          />
        </Field>
      </fieldset>
      <div className="flex flex-col-reverse gap-2 border-t border-hairline pt-5 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
        )}
        <Button type="submit" pending={pending} pendingLabel="Salvando…" disabled={uploading}>
          Salvar
        </Button>
      </div>
    </form>
  )
}
