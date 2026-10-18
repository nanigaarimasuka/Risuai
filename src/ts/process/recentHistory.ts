// Whether a request may format only the recent messages that fit its context
// instead of every message of the chat.
//
// Formatting a message for a request changes only that message's request copy
// unless something below can do more: a plugin's editprocess handler (any
// code), an editprocess regex script with an @@ output or <...> actions
// (@@emo sets the character's emotion, @@inject rewrites the stored message;
// the others are kept out with them), or a summary memory, which reads every
// message. Without those, the messages that fit are the same whether the chat
// is formatted from its oldest message and then trimmed, or from its newest
// until the context is full.

type RegexScript = {
    type?: string
    out?: string
    ableFlag?: boolean
    flag?: string
}

function scriptActions(script: RegexScript): string[] {
    if (!script.ableFlag || !script.flag?.includes('<')) {
        return []
    }
    const actions: string[] = []
    for (const match of script.flag.matchAll(/<(.+?)>/g)) {
        for (const meta of match[1].split(',').map((v) => v.trim())) {
            if (!meta.startsWith('order ')) {
                actions.push(meta)
            }
        }
    }
    return actions
}

export function editprocessScriptHasEffects(script: RegexScript): boolean {
    return script?.type === 'editprocess'
        && ((script.out ?? '').replaceAll('$n', '\n').startsWith('@@') || scriptActions(script).length > 0)
}

export function canFormatRecentHistoryOnly(arg: {
    summaryMemory: boolean
    editprocessHandlers: number
    scripts: RegexScript[]
}): boolean {
    return !arg.summaryMemory
        && arg.editprocessHandlers === 0
        && !arg.scripts.some(editprocessScriptHasEffects)
}

// Formats messages from the newest (index count - 1) down and keeps those
// that fit. fixedTokens is everything counted besides the history,
// leadingTokens what trimming takes off by dropping the chats before the
// history (it drops all of those before any message). The newest message is
// always kept, as trimming keeps the last chat and reports it when even that
// does not fit. complete is false when a message was left out: trimming would
// then have dropped every chat before the history too, so the caller drops
// them.
export async function selectRecentHistory<T>(arg: {
    count: number
    fixedTokens: number
    leadingTokens: number
    maxTokens: number
    format: (index: number) => Promise<{ chat: T, tokens: number }>
}): Promise<{ chats: T[], tokens: number, complete: boolean }> {
    const kept: T[] = []
    let tokens = 0
    let complete = true
    for (let index = arg.count - 1; index >= 0; index--) {
        const { chat, tokens: chatTokens } = await arg.format(index)
        if (kept.length > 0 && arg.fixedTokens - arg.leadingTokens + tokens + chatTokens > arg.maxTokens) {
            complete = false
            break
        }
        kept.push(chat)
        tokens += chatTokens
    }
    kept.reverse()
    return { chats: kept, tokens, complete }
}
