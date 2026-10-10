// Lets a plugin keep its own copy of a chat and copy only what changed, so
// reading a long chat does not deep-copy every message on this thread.
//
// Every object in a chat gets a version number. An object keeps its number
// while its own values (strings, numbers, ...) are the same values and its
// child objects keep theirs; any change anywhere inside it gives it a new one.
// Checking walks the chat but copies nothing, and unchanged strings compare by
// reference.

type SeenObject = {
    keys: string[]
    values: unknown[]
    version: number
}

const seen = new WeakMap<object, SeenObject>()
let nextVersion = 1

// Versions restart when the page loads; a plugin's copy from before then
// must not match them.
const epoch = Math.random().toString(36).slice(2) + Date.now().toString(36)

class ChildVersion {
    constructor(readonly version: number) {}
}

function isObject(value: unknown): value is object {
    return value !== null && typeof value === 'object'
}

function sameValue(a: unknown, b: unknown): boolean {
    if (a instanceof ChildVersion && b instanceof ChildVersion) {
        return a.version === b.version
    }
    return Object.is(a, b)
}

export function contentVersion(value: object): number {
    const keys = Object.keys(value)
    const values: unknown[] = new Array(keys.length)
    for (let i = 0; i < keys.length; i++) {
        const child = (value as Record<string, unknown>)[keys[i]]
        values[i] = isObject(child) ? new ChildVersion(contentVersion(child)) : child
    }
    const previous = seen.get(value)
    if (
        previous
        && previous.keys.length === keys.length
        && previous.keys.every((key, i) => key === keys[i] && sameValue(previous.values[i], values[i]))
    ) {
        return previous.version
    }
    const version = nextVersion++
    seen.set(value, { keys, values, version })
    return version
}

export type KnownChat = {
    epoch?: string
    chatId?: string
    messages?: number[]
    fields?: Record<string, number>
}

export type ChatChanges = {
    epoch: string
    chatId: string
    // The chat's own keys in order.
    keys: string[]
    // Whether 'message' is an array, sent as messageVersions and messages.
    messageArray: boolean
    // The version of each message, and copies of those whose versions are not
    // in known.
    messageVersions: number[]
    messages: Record<number, unknown>
    // The version of each object-valued key, and copies of those not in
    // known; keys holding plain values are always copied.
    fieldVersions: Record<string, number>
    fields: Record<string, unknown>
}

export function chatChanges(chat: any, known: KnownChat | null | undefined, snapshot: (value: unknown) => unknown): ChatChanges {
    const chatId = String(chat.id ?? '')
    const base = known && known.epoch === epoch && known.chatId === chatId ? known : null
    // By version, not index, so messages that only moved (after a deletion)
    // are not copied again.
    const knownMessages = new Set(Array.isArray(base?.messages) ? base.messages : [])
    const knownFields = base?.fields && typeof base.fields === 'object' ? base.fields : {}
    const out: ChatChanges = {
        epoch,
        chatId,
        keys: Object.keys(chat),
        messageArray: Array.isArray(chat.message),
        messageVersions: [],
        messages: {},
        fieldVersions: {},
        fields: {},
    }
    for (const key of out.keys) {
        const value = chat[key]
        if (key === 'message' && Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                const message = value[i]
                if (!isObject(message)) {
                    out.messageVersions.push(0)
                    out.messages[i] = snapshot(message)
                    continue
                }
                const version = contentVersion(message)
                out.messageVersions.push(version)
                if (!knownMessages.has(version)) {
                    out.messages[i] = snapshot(message)
                }
            }
            continue
        }
        if (!isObject(value)) {
            out.fields[key] = value
            continue
        }
        const version = contentVersion(value)
        out.fieldVersions[key] = version
        if (knownFields[key] !== version) {
            out.fields[key] = snapshot(value)
        }
    }
    return out
}
