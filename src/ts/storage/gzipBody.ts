import { createUIYielder } from "../process/uiYield"

// Saved databases are mostly JSON text and go up on every save, so they are
// sent gzipped; the node server unpacks Content-Encoding: gzip before writing
// (express.raw inflates it), so the stored file is unchanged. Other files,
// such as images, are already compressed and go up as they are.
const GZIP_MIN_BYTES = 64 * 1024
const GZIP_CHUNK_BYTES = 256 * 1024

export function shouldGzipSaveBody(key: string, value: Uint8Array): boolean {
    return value.byteLength >= GZIP_MIN_BYTES
        && (key.startsWith('database/') || key.startsWith('remotes/'))
        && typeof CompressionStream === 'function'
}

// Compresses in chunks with a turn for the page between them, so a large
// database does not hold the UI thread for the whole compression.
export async function gzipSaveBody(value: Uint8Array): Promise<Uint8Array> {
    const stream = new CompressionStream('gzip')
    const packed = new Response(stream.readable).arrayBuffer()
    const writer = stream.writable.getWriter()
    const yieldToUI = createUIYielder()
    for (let offset = 0; offset < value.byteLength; offset += GZIP_CHUNK_BYTES) {
        await writer.write(value.subarray(offset, offset + GZIP_CHUNK_BYTES))
        await yieldToUI()
    }
    await writer.close()
    return new Uint8Array(await packed)
}
