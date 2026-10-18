import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, processGiftImage } from '../images'

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 120 } } })

describe('processGiftImage', () => {
  it('resizes a large PNG to fit 1200×1200 and outputs webp', async () => {
    const png = await solid(3000, 2000).png().toBuffer()
    const out = await processGiftImage(png)
    if ('error' in out) throw new Error(out.error)
    expect(out).toMatchObject({ contentType: 'image/webp', width: 1200, height: 800 })
    const meta = await sharp(out.data).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 1200, height: 800 })
  })

  it('never upscales a small image', async () => {
    const out = await processGiftImage(await solid(300, 200).png().toBuffer())
    expect(out).toMatchObject({ width: 300, height: 200 })
  })

  it('applies the EXIF orientation and strips metadata (GPS included)', async () => {
    const jpeg = await solid(2400, 1200)
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '2/1 49/1 0/1' } })
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const before = await sharp(jpeg).metadata()
    expect(before.orientation).toBe(6)
    expect(before.exif).toBeDefined()

    const out = await processGiftImage(jpeg)
    if ('error' in out) throw new Error(out.error)
    // rotated 90° (portrait), then fit inside 1200×1200
    expect(out).toMatchObject({ width: 600, height: 1200 })
    const meta = await sharp(out.data).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.orientation).toBeUndefined()
    expect(meta.width).toBe(600)
  })

  it('accepts webp input', async () => {
    const out = await processGiftImage(await solid(100, 100).webp().toBuffer())
    expect(out).toMatchObject({ contentType: 'image/webp', width: 100 })
  })

  it('rejects a text file renamed .jpg (detected by content, not name)', async () => {
    expect(await processGiftImage(Buffer.from('isto não é uma foto\n'))).toEqual({ error: 'unsupported' })
  })

  it('rejects other image formats it does not accept (gif)', async () => {
    expect(await processGiftImage(await solid(10, 10).gif().toBuffer())).toEqual({ error: 'unsupported' })
  })

  it('rejects a truncated JPEG as invalid', async () => {
    const jpeg = await solid(400, 400).jpeg().toBuffer()
    expect(await processGiftImage(jpeg.subarray(0, 40))).toEqual({ error: 'invalid' })
  })

  it('rejects an image over 40 megapixels (decompression bomb) as invalid', async () => {
    const huge = await solid(7000, 6000).png({ compressionLevel: 9 }).toBuffer()
    expect(huge.length).toBeLessThan(8 * 1024 * 1024)
    expect(await processGiftImage(huge)).toEqual({ error: 'invalid' })
  })

  it('rejects more than 8 MB', async () => {
    expect(MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024)
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1)
    big.set([0xff, 0xd8, 0xff])
    expect(await processGiftImage(big)).toEqual({ error: 'too_large' })
  })
})
