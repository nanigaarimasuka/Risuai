import { describe, expect, it } from "vitest"
import { chatChanges, contentVersion } from "./chatChanges"

const copy = (value: unknown) => structuredClone(value)

function known(changes: ReturnType<typeof chatChanges>) {
    return {
        epoch: changes.epoch,
        chatId: changes.chatId,
        messages: changes.messageVersions,
        fields: changes.fieldVersions,
    }
}

describe("contentVersion", () => {
    it("keeps a version until something inside changes", () => {
        const message = { role: "user", data: "hi", info: { model: "a" } }
        const first = contentVersion(message)
        expect(contentVersion(message)).toBe(first)
        message.info.model = "b"
        const second = contentVersion(message)
        expect(second).not.toBe(first)
        message.data = "hello"
        expect(contentVersion(message)).not.toBe(second)
    })
})

describe("chatChanges", () => {
    it("copies everything without known", () => {
        const chat = { id: "c", name: "n", message: [{ data: "a" }, { data: "b" }], scriptstate: { k: 1 } }
        const changes = chatChanges(chat, undefined, copy)
        expect(changes.keys).toEqual(["id", "name", "message", "scriptstate"])
        expect(changes.messageArray).toBe(true)
        expect(changes.messages).toEqual({ 0: { data: "a" }, 1: { data: "b" } })
        expect(changes.fields).toEqual({ id: "c", name: "n", scriptstate: { k: 1 } })
    })

    it("copies only new and changed messages, and changed keys", () => {
        const chat = { id: "c", message: [{ data: "a" }, { data: "b" }, { data: "c" }], scriptstate: { k: 1 }, lore: [1] }
        const first = chatChanges(chat, undefined, copy)
        chat.message.splice(0, 1)
        chat.message[1].data = "c2"
        chat.message.push({ data: "d" })
        chat.scriptstate.k = 2
        const next = chatChanges(chat, known(first), copy)
        expect(next.messages).toEqual({ 1: { data: "c2" }, 2: { data: "d" } })
        expect(next.messageVersions[0]).toBe(first.messageVersions[1])
        expect(next.fields).toEqual({ id: "c", scriptstate: { k: 2 } })
        expect(next.fieldVersions.lore).toBe(first.fieldVersions.lore)
    })

    it("copies everything for another chat or epoch", () => {
        const chat = { id: "c", message: [{ data: "a" }] }
        const first = chatChanges(chat, undefined, copy)
        expect(chatChanges(chat, { ...known(first), chatId: "other" }, copy).messages).toEqual({ 0: { data: "a" } })
        expect(chatChanges(chat, { ...known(first), epoch: "old" }, copy).messages).toEqual({ 0: { data: "a" } })
    })
})
