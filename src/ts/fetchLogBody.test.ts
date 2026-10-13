import { describe, expect, it } from "vitest"
import { gzipSync } from "fflate"
import { fetchLogBodyText } from "./fetchLogBody"

describe("fetchLogBodyText", () => {
    const text = JSON.stringify({ entries: ["같은 문장", "second"] })
    const bytes = new TextEncoder().encode(text)

    it("logs a gzip request body unpacked", () => {
        expect(fetchLogBodyText(gzipSync(bytes), { "Content-Encoding": "gzip" })).toBe(text)
    })

    it("logs a plain body as it is", () => {
        expect(fetchLogBodyText(bytes, { "Content-Type": "application/json" })).toBe(text)
    })

    it("falls back to the raw bytes when the gzip header lies", () => {
        expect(fetchLogBodyText(bytes, { "content-encoding": "gzip" })).toBe(text)
    })

    it("logs nothing for a request without a body", () => {
        expect(fetchLogBodyText(undefined, {})).toBe("")
    })
})
