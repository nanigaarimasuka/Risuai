// A long loop on the UI thread gives the browser a turn about once a frame,
// so the page keeps painting and taking input while the loop runs. Each call
// to the returned function yields only when the current slice has run long
// enough, so short loops are not slowed.

type SchedulerWithYield = { yield?: () => Promise<void> }

function nextTask(): Promise<void> {
    const scheduler = (globalThis as { scheduler?: SchedulerWithYield }).scheduler
    if (typeof scheduler?.yield === 'function') {
        return scheduler.yield()
    }
    return new Promise((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = () => {
            channel.port1.close()
            resolve()
        }
        channel.port2.postMessage(null)
    })
}

export function createUIYielder(sliceMs = 12): () => Promise<void> {
    let sliceStart = performance.now()
    return async () => {
        if (performance.now() - sliceStart < sliceMs) {
            return
        }
        await nextTask()
        sliceStart = performance.now()
    }
}
