import sharp from 'sharp'

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const MAX_SIDE = 1200
// decompression-bomb guard: ~50 MP is well above any phone camera
const MAX_INPUT_PIXELS = 50_000_000

export type ProcessedImage = { data: Buffer; contentType: 'image/webp'; width: number; height: number }
export type ImageError = { error: 'too_large' | 'unsupported' | 'invalid' }

type Kind = 'jpeg' | 'png' | 'webp' | 'heic' | 'avif'

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

/** The file type from its first bytes (the name and the browser's MIME type are never trusted). */
function detect(input: Buffer): Kind | null {
  const ascii = (from: number, to: number) => input.subarray(from, to).toString('latin1')
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'jpeg'
  if (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png'
  if (input.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  if (input.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (AVIF_BRANDS.has(brand)) return 'avif'
    if (HEIC_BRANDS.has(brand)) return 'heic'
  }
  return null
}

/**
 * Gift photo pipeline: validate by content, apply the EXIF orientation, drop all metadata (GPS
 * included; sharp only keeps it when asked), fit inside 1200×1200 without upscaling, encode webp.
 */
export async function processGiftImage(input: Buffer): Promise<ProcessedImage | ImageError> {
  if (input.length > MAX_UPLOAD_BYTES) return { error: 'too_large' }
  const kind = detect(input)
  if (!kind) return { error: 'unsupported' }
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true })
    return { data, contentType: 'image/webp', width: info.width, height: info.height }
  } catch {
    // HEIC (HEVC) isn't in sharp's prebuilt libvips: for the admin that is a format problem, not a broken file
    return { error: kind === 'heic' ? 'unsupported' : 'invalid' }
  }
}
