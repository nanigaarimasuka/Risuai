import { describe, expect, it } from "vitest"
import { canFormatRecentHistoryOnly, editprocessScriptHasEffects, selectRecentHistory } from "./recentHistory"

// sendChat before the change: count every message, then drop chats from the
// front (the chats before the history, then the oldest messages) while over
// the limit, keeping at least one.
function trimLikeSendChat(arg: { counted: number, leading: number[], messages: number[], max: number }) {
    const chats: { tokens: number, history: boolean, index?: number }[] = [...arg.leading.map((tokens) => ({ tokens, history: false })), ...arg.messages.map((tokens, index) => ({ tokens, history: true, index }))]
    let current = arg.counted + arg.messages.reduce((a, b) => a + b, 0)
    while (current > arg.max) {
        if (chats.length <= 1) {
            return { error: current }
        }
        current -= chats[0].tokens
        chats.splice(0, 1)
    }
    return { kept: chats.filter((c) => c.history).map((c) => c.index), leadingKept: chats.filter((c) => !c.history).length, current }
}

async function selectThenTrim(arg: { counted: number, leading: number[], messages: number[], max: number }) {
    const formatted: number[] = []
    const leadingTokens = arg.leading.reduce((a, b) => a + b, 0)
    const recent = await selectRecentHistory({
        count: arg.messages.length,
        fixedTokens: arg.counted,
        leadingTokens,
        maxTokens: arg.max,
        format: async (index) => {
            formatted.push(index)
            return { chat: index, tokens: arg.messages[index] }
        },
    })
    // As sendChat: without every message the leading chats go, then the same
    // trimming runs on what is left.
    const leading = recent.complete ? arg.leading : []
    const chats: { tokens: number, history: boolean, index?: number }[] = [...leading.map((tokens) => ({ tokens, history: false })), ...recent.chats.map((index) => ({ tokens: arg.messages[index], history: true, index }))]
    let current = arg.counted + recent.tokens - (recent.complete ? 0 : leadingTokens)
    while (current > arg.max) {
        if (chats.length <= 1) {
            return { result: { error: current }, formatted }
        }
        current -= chats[0].tokens
        chats.splice(0, 1)
    }
    return {
        result: { kept: chats.filter((c) => c.history).map((c) => c.index), leadingKept: chats.filter((c) => !c.history).length, current },
        formatted,
    }
}

// mulberry32: a small seeded generator with a full 32-bit period.
function seededRandom(seed: number) {
    return (n: number) => {
        seed = (seed + 0x6D2B79F5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) % n
    }
}

describe("selectRecentHistory", () => {
    it("keeps the same chats and total as counting everything and trimming", async () => {
        const random = seededRandom(11)
        let cut = 0
        let leadingRoom = 0
        for (let run = 0; run < 5000; run++) {
            const messages = Array.from({ length: random(40) }, () => 1 + random(500))
            const leading = Array.from({ length: random(4) }, () => random(random(2) ? 30 : 300))
            // Examples and the first message are counted before the history;
            // the "[Start a new chat]" chat is not, yet trimming takes it off.
            const counted = 500 + random(3000) + leading.reduce((a, t) => a + (random(2) ? t : 0), 0)
            const max = 600 + random(12000)
            const input = { counted, leading, messages, max }
            const expected = trimLikeSendChat(input)
            const { result } = await selectThenTrim(input)
            expect(result).toEqual(expected)
            if ('kept' in expected && expected.kept.length < messages.length) {
                cut++
                // Cases where the leading chats would fit in the room left.
                if (leading.length > 0 && expected.current + leading[leading.length - 1] <= max) {
                    leadingRoom++
                }
            }
        }
        expect(cut).toBeGreaterThan(1000)
        expect(leadingRoom).toBeGreaterThan(100)
    })

    it("drops the chats before the history when a message is left out, even if they fit", async () => {
        const messages = Array.from({ length: 100 }, () => 100)
        const input = { counted: 1000, leading: [0, 50], messages, max: 3000 }
        const { result } = await selectThenTrim(input)
        expect(result).toEqual(trimLikeSendChat(input))
        expect(result).toEqual({ kept: Array.from({ length: 20 }, (_, i) => 80 + i), leadingKept: 0, current: 2950 })
    })

    it("formats only the newest messages that fit, plus the one that did not", async () => {
        const messages = Array.from({ length: 1000 }, () => 100)
        const { result, formatted } = await selectThenTrim({ counted: 500, leading: [200], messages, max: 5300 })
        expect(result).toEqual({ kept: Array.from({ length: 50 }, (_, i) => 950 + i), leadingKept: 0, current: 5300 })
        expect(formatted.length).toBe(51)
        expect(formatted[0]).toBe(999)
    })

    it("keeps the chats before the history when every message fits", async () => {
        const input = { counted: 1000, leading: [10, 20], messages: [100, 100], max: 1300 }
        const { result } = await selectThenTrim(input)
        expect(result).toEqual(trimLikeSendChat(input))
        expect(result).toEqual({ kept: [0, 1], leadingKept: 2, current: 1200 })
    })

    it("reports the same total when even the newest message does not fit", async () => {
        const input = { counted: 1000, leading: [10], messages: [100, 5000], max: 2000 }
        const { result } = await selectThenTrim(input)
        expect(result).toEqual(trimLikeSendChat(input))
        expect(result).toEqual({ error: 5990 })
    })
})

describe("canFormatRecentHistoryOnly", () => {
    const plain = { type: "editprocess", in: "a", out: "b", ableFlag: false }
    it("allows plain editprocess and other scripts", () => {
        expect(canFormatRecentHistoryOnly({ summaryMemory: false, editprocessHandlers: 0, scripts: [plain, { type: "editdisplay", out: "@@emo happy" }] })).toBe(true)
    })
    it("needs every message with a summary memory, an editprocess handler or a script with effects", () => {
        expect(canFormatRecentHistoryOnly({ summaryMemory: true, editprocessHandlers: 0, scripts: [] })).toBe(false)
        expect(canFormatRecentHistoryOnly({ summaryMemory: false, editprocessHandlers: 1, scripts: [] })).toBe(false)
        expect(canFormatRecentHistoryOnly({ summaryMemory: false, editprocessHandlers: 0, scripts: [{ type: "editprocess", out: "@@inject" }] })).toBe(false)
    })
    it("recognizes @@ outputs and <...> actions on editprocess scripts", () => {
        expect(editprocessScriptHasEffects({ type: "editprocess", out: "@@emo happy" })).toBe(true)
        expect(editprocessScriptHasEffects({ type: "editprocess", out: "x", ableFlag: true, flag: "g<inject>" })).toBe(true)
        expect(editprocessScriptHasEffects({ type: "editprocess", out: "x", ableFlag: true, flag: "g<order 3>" })).toBe(false)
        expect(editprocessScriptHasEffects({ type: "editprocess", out: "x", ableFlag: false, flag: "g<inject>" })).toBe(false)
        expect(editprocessScriptHasEffects({ type: "editoutput", out: "@@emo happy" })).toBe(false)
    })
})
