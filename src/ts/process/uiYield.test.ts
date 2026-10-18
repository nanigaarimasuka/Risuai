import { describe, expect, it } from "vitest"
import { createUIYielder } from "./uiYield"

describe("createUIYielder", () => {
    it("does not yield before a slice has run long enough", async () => {
        const yieldToUI = createUIYielder(1000)
        let ranTask = false
        setTimeout(() => { ranTask = true }, 0)
        await yieldToUI()
        expect(ranTask).toBe(false)
    })

    it("lets a task queued before it run once a slice is over", async () => {
        const yieldToUI = createUIYielder(0)
        let ranTask = false
        const channel = new MessageChannel()
        channel.port1.onmessage = () => {
            ranTask = true
            channel.port1.close()
        }
        channel.port2.postMessage(null)
        await yieldToUI()
        expect(ranTask).toBe(true)
    })
})
