// Tiny synthetic audio files for the tests (silence; never a real song).

/** One silent MPEG-1 Layer III frame: 32 kbps, 48 kHz, mono (96 bytes, 24 ms). */
export function mp3Frame(): Buffer {
  const frame = Buffer.alloc(96)
  frame.set([0xff, 0xfb, 0x14, 0xc0])
  return frame
}

export function silentMp3(frames = 10): Buffer {
  return Buffer.concat(Array.from({ length: frames }, mp3Frame))
}

/** An ID3v2.4 tag of `bodySize` zero bytes followed by MP3 frames. */
export function mp3WithId3(bodySize = 32): Buffer {
  const header = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0])
  header[6] = (bodySize >> 21) & 0x7f
  header[7] = (bodySize >> 14) & 0x7f
  header[8] = (bodySize >> 7) & 0x7f
  header[9] = bodySize & 0x7f
  return Buffer.concat([header, Buffer.alloc(bodySize), silentMp3(3)])
}

/** The start of an MP4 file: an `ftyp` box with the given major brand, then filler. */
export function mp4WithBrand(brand: string): Buffer {
  const ftyp = Buffer.alloc(24)
  ftyp.writeUInt32BE(24, 0)
  ftyp.write('ftyp', 4, 'latin1')
  ftyp.write(brand, 8, 'latin1')
  ftyp.write('isomiso2', 16, 'latin1')
  return Buffer.concat([ftyp, Buffer.alloc(64)])
}
