import { describe, expect, it } from "vitest"
import { gunzipSync } from "fflate"
import { gzipSaveBody, shouldGzipSaveBody } from "./gzipBody"

describe("gzipSaveBody", () => {
    it("packs a database so it unpacks to the same bytes", async () => {
        const text = JSON.stringify({ chats: Array.from({ length: 20000 }, (_, i) => ({ data: "메시지 " + i })) })
        const bytes = new TextEncoder().encode(text)
        const packed = await gzipSaveBody(bytes)
        expect(packed.byteLength).toBeLessThan(bytes.byteLength)
        expect(new TextDecoder().decode(gunzipSync(packed))).toBe(text)
    })

    it("packs only large database files", () => {
        const large = new Uint8Array(64 * 1024)
        expect(shouldGzipSaveBody("database/database.bin", large)).toBe(true)
        expect(shouldGzipSaveBody("remotes/abc.local.bin", large)).toBe(true)
        expect(shouldGzipSaveBody("database/database.bin", new Uint8Array(1024))).toBe(false)
        expect(shouldGzipSaveBody("assets/image.png", large)).toBe(false)
    })
})
