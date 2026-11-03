const exportsOf = { experimental: { sendServerRequest: jest.fn() } };
jest.mock('vscode', () => ({
    extensions: { getExtension: (id: string) => id === 'muhammad-sammy.csharp' ? { isActive: true, exports: exportsOf } : undefined },
    CancellationTokenSource: class { token = {}; },
}), { virtual: true });

import { CSharpServer } from '../../../../services/refactoring/csharpServer';

const send = exportsOf.experimental.sendServerRequest;
const uri = { toString: () => 'file:///a/Order.cs' } as never;

describe('CSharpServer', () => {
    beforeEach(() => send.mockReset());

    it('activates the assembly once, then runs the handler on the document', async () => {
        send.mockImplementation(async (type: { method: string }) => type.method.includes('activate') ? {} : { response: '{"ok":1}' });
        const server = new CSharpServer('/x/Shinobi.Refactorings.dll');
        expect(await server.document(uri, 'Shinobi.Refactorings.H', { a: 1 })).toEqual({ ok: 1 });
        await server.document(uri, 'Shinobi.Refactorings.H', { a: 1 });
        const methods = send.mock.calls.map(call => call[0].method);
        expect(methods).toEqual(['server/_vs_activateExtension', 'textDocument/_vs_dipatchExtensionMessage', 'textDocument/_vs_dipatchExtensionMessage']);
        expect(send.mock.calls[1][1]).toEqual({
            textDocument: { uri: 'file:///a/Order.cs' }, messageName: 'Shinobi.Refactorings.H',
            assemblyFilePath: '/x/Shinobi.Refactorings.dll', message: '{"a":1}',
        });
    });

    it('sends a request type, not a string: the C# extension hands it to the client as it is, and a string kills the server', async () => {
        send.mockResolvedValue({});
        await new CSharpServer('/x.dll').document(uri, 'H', {});
        expect(send.mock.calls[0][0]).toMatchObject({ method: 'server/_vs_activateExtension', numberOfParams: 1 });
    });

    it('activates again when the server no longer knows the handler (it restarted)', async () => {
        let dispatches = 0;
        send.mockImplementation(async (type: { method: string }) => {
            if (type.method.includes('activate')) { return {}; }
            if (dispatches++ === 0) { throw new Error('No handler found for message H.'); }
            return { response: 'null' };
        });
        expect(await new CSharpServer('/x.dll').document(uri, 'H', {})).toBeNull();
        expect(send.mock.calls.filter(call => call[0].method.includes('activate'))).toHaveLength(2);
    });

    it('passes other errors on', async () => {
        send.mockImplementation(async (type: { method: string }) => { if (type.method.includes('dipatch')) { throw new Error('boom'); } return {}; });
        await expect(new CSharpServer('/x.dll').document(uri, 'H', {})).rejects.toThrow('boom');
    });

    it('takes "already registered" as registered, and registers again only when the handler is missing', async () => {
        let dispatches = 0;
        send.mockImplementation(async (type: { method: string }) => {
            if (type.method.includes('deactivate')) { return {}; }
            if (type.method.includes('activate')) { throw new Error("Extension '/x.dll' is already registered."); }
            return dispatches++ === 0 ? { response: '{"ok":1}' } : { response: 'null' };
        });
        const server = new CSharpServer('/x.dll');
        expect(await server.document(uri, 'H', {})).toEqual({ ok: 1 });
        expect(send.mock.calls.map(call => call[0].method)).toEqual(['server/_vs_activateExtension', 'textDocument/_vs_dipatchExtensionMessage']);
    });

    it('drops the registration and makes it again when the server knows it but not the handler', async () => {
        let registered = true;
        let dispatches = 0;
        send.mockImplementation(async (type: { method: string }) => {
            if (type.method.includes('deactivate')) { registered = false; return {}; }
            if (type.method.includes('activate')) {
                if (registered) { throw new Error("Extension '/x.dll' is already registered."); }
                registered = true;
                return {};
            }
            if (dispatches++ === 0) { throw new Error('No handler found for message H.'); }
            return { response: '{"ok":2}' };
        });
        expect(await new CSharpServer('/x.dll').document(uri, 'H', {})).toEqual({ ok: 2 });
        expect(send.mock.calls.map(call => call[0].method)).toEqual([
            'server/_vs_activateExtension', 'textDocument/_vs_dipatchExtensionMessage',
            'server/_vs_activateExtension', 'server/_vs_deactivateExtension', 'server/_vs_activateExtension', 'textDocument/_vs_dipatchExtensionMessage',
        ]);
    });
});
