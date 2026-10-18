'use client'

import { ImageOff } from 'lucide-react'
import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { saveGiftAction, type GiftFormState } from '@/features/gifts/admin-actions'
import { useDraftRestore, useSkewSafeFormAction } from './skew-recovery'
import { inputClass } from './styles'
import { Button } from './ui/Button'
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

export function GiftForm({ gift, categories, onSaved, onCancel }: Props) {
  const draftKey = gift ? `gift:${gift.id}` : 'gift:new'
  const safeAction = useSkewSafeFormAction(saveGiftAction, draftKey)
  const [state, action, pending] = useActionState<GiftFormState, FormData>(safeAction, null)
  const formRef = useRef<HTMLFormElement>(null)
  useDraftRestore(formRef, draftKey)
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
    sortOrder: String(gift?.sortOrder ?? 0),
  }
  const errors = failed?.fieldErrors ?? {}
  const prefix = gift ? `gift-${gift.id}` : 'gift-new'
  const [imageUrl, setImageUrl] = useState(values.imageUrl)
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
        <Field
          id={`${prefix}-image`}
          label="Foto"
          error={errors.imageUrl}
          helper="Endereço (https://) de uma imagem do produto."
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
        <Button type="submit" pending={pending} pendingLabel="Salvando…">
          Salvar
        </Button>
      </div>
    </form>
  )
}
