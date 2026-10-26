import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('src/lang', () => ({
    language: {}
}))

vi.mock('../alert', () => ({
    alertError: vi.fn(),
    alertInput: vi.fn(),
    waitAlert: vi.fn()
}))

vi.mock('../util', () => ({
    base64url: vi.fn(),
    getKeypairStore: vi.fn(),
    saveKeypairStore: vi.fn()
}))

import { NodeStorage } from './nodeStorage'

const hex = (key: string) => Buffer.from(key, 'utf-8').toString('hex')

// The server splits the file-path header on $$ and reads each part as one
// hex-encoded key (server.cjs /api/remove).
const serverKeys = (header: string) => header.split('$$').map((part) => Buffer.from(part, 'hex').toString('utf-8'))

describe('NodeStorage.removeItem', () => {
    const fetchMock = vi.fn()
    let storage: NodeStorage

    beforeEach(() => {
        fetchMock.mockReset()
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: true })))
        vi.stubGlobal('fetch', fetchMock)
        storage = new NodeStorage()
        vi.spyOn(storage as any, 'checkAuth').mockResolvedValue(undefined)
        vi.spyOn(storage, 'createAuth').mockResolvedValue('test-auth')
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('sends one key as its hex path', async () => {
        await storage.removeItem('coldstorage/a')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0][1].headers['file-path']).toBe(hex('coldstorage/a'))
    })

    it('sends several keys so the server reads each one back', async () => {
        const keys = ['coldstorage/a', 'coldstorage/b', 'coldstorage/c']
        await storage.removeItem(keys)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(serverKeys(fetchMock.mock.calls[0][1].headers['file-path'])).toEqual(keys)
    })

    it('splits many keys into batches and removes every one', async () => {
        const keys = Array.from({ length: 70 }, (_, i) => `coldstorage/${i}`)
        await storage.removeItem(keys)
        expect(fetchMock).toHaveBeenCalledTimes(3)
        const sent = fetchMock.mock.calls.flatMap((call) => serverKeys(call[1].headers['file-path']))
        expect(sent).toEqual(keys)
    })

    it('fails when the server refuses', async () => {
        fetchMock.mockImplementation(async () => new Response('', { status: 500 }))
        await expect(storage.removeItem(['coldstorage/a', 'coldstorage/b'])).rejects.toBe('removeItem Error')
    })
})
