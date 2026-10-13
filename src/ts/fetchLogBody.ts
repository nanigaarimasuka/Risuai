import { gunzipSync } from "fflate"

/**
 * The text the fetch log shows for a request body. A body sent with
 * Content-Encoding: gzip is logged unpacked, so the log stays readable.
 */
export function fetchLogBodyText(body: Uint8Array | undefined, headers?: { [key: string]: string }): string {
    if (!body) {
        return ''
    }
    const encoding = Object.entries(headers ?? {})
        .find(([name]) => name.toLowerCase() === 'content-encoding')?.[1]
    if (encoding?.trim().toLowerCase() === 'gzip') {
        try {
            return new TextDecoder().decode(gunzipSync(body))
        } catch {
            // Not valid gzip after all; log the bytes as they are.
        }
    }
    return new TextDecoder().decode(body)
}
