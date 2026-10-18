import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

// Uploaded media (gift photos). Production: the Railway bucket (S3 API, private: the app proxies reads
// through /media/...). Dev/test: files under .data/media (gitignored). Config is read when used, never
// at import time, so `next build` doesn't need the S3_* variables.

export type StoredObject = { body: ReadableStream | Buffer; contentType: string; contentLength?: number }

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<StoredObject | null>
  delete(key: string): Promise<void>
}

const CONTENT_TYPES: Record<string, string> = { '.webp': 'image/webp' }

/** Filesystem adapter: one file per key under `root`; keys can't escape it. */
export function createFsStorage(root: string): ObjectStorage {
  const base = path.resolve(root)
  const resolve = (key: string): string | null => {
    const file = path.resolve(base, key)
    return file.startsWith(base + path.sep) ? file : null
  }
  return {
    async put(key, body) {
      const file = resolve(key)
      if (!file) throw new Error('invalid media key')
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, body)
    },
    async get(key) {
      const file = resolve(key)
      if (!file) return null
      try {
        const [body, info] = await Promise.all([readFile(file), stat(file)])
        const contentType = CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream'
        return { body, contentType, contentLength: info.size }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw err
      }
    },
    async delete(key) {
      const file = resolve(key)
      if (file) await rm(file, { force: true })
    },
  }
}

type S3Config = { bucket: string; accessKeyId: string; secretAccessKey: string; region: string; endpoint: string }

function s3Config(): S3Config | null {
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_ENDPOINT } = process.env
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_REGION || !S3_ENDPOINT) return null
  return {
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
  }
}

/** S3 adapter (Railway buckets use virtual-hosted style, so forcePathStyle stays false). */
export function createS3Storage(config: S3Config): ObjectStorage {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: false,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  const Bucket = config.bucket
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }))
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }))
        if (!res.Body) return null
        return {
          body: res.Body.transformToWebStream() as ReadableStream,
          contentType: res.ContentType ?? 'application/octet-stream',
          contentLength: res.ContentLength,
        }
      } catch (err) {
        const name = (err as { name?: string }).name
        if (name === 'NoSuchKey' || name === 'NotFound') return null
        throw err
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }))
    },
  }
}

let s3: { signature: string; storage: ObjectStorage } | null = null

export function getStorage(): ObjectStorage {
  const config = s3Config()
  if (!config) return createFsStorage(process.env.MEDIA_DIR || path.join(process.cwd(), '.data', 'media'))
  // one client per process (re-created only if the config changes)
  const signature = JSON.stringify(config)
  if (s3?.signature !== signature) s3 = { signature, storage: createS3Storage(config) }
  return s3.storage
}
