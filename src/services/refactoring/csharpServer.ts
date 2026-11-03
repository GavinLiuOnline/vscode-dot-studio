import * as vscode from 'vscode';
import { CSHARP_EXTENSIONS } from '../shared/csharpExtensionCheck';
import { logger } from '../../core/logger';

const log = logger('CSharpServer');

/** The part of the C# extension's exports we use (its "experimental" API: requests to the Roslyn language server) */
interface CSharpApi {
    experimental?: { sendServerRequest?<R>(type: { method: string; numberOfParams: number; parameterStructures: string }, params: unknown, token: vscode.CancellationToken): Promise<R> };
}

/** Where the .NET assembly of ours that the C# extension hands to the server is (package.json: csharpExtensionLoadPaths) */
export const SERVER_EXTENSION_PATH = 'out/server-extension/Shinobi.Refactorings.dll';

const ACTIVATE = 'server/_vs_activateExtension';
// sic: the server spells it "dipatch" for documents
const DISPATCH_DOCUMENT = 'textDocument/_vs_dipatchExtensionMessage';

async function api(): Promise<CSharpApi | undefined> {
    for (const id of Object.values(CSHARP_EXTENSIONS)) {
        const extension = vscode.extensions.getExtension<CSharpApi>(id);
        if (extension) {
            return extension.isActive ? extension.exports : extension.activate();
        }
    }
    return undefined;
}

/** Messages to the handlers of our assembly in the Roslyn language server of the C# extension */
export class CSharpServer {
    private activated: Promise<unknown> | undefined;

    constructor(private readonly assemblyPath: string) {}

    /** True when a C# extension with the server API is installed */
    static async isAvailable(): Promise<boolean> {
        return !!(await api())?.experimental?.sendServerRequest;
    }

    private async send<R>(method: string, params: unknown): Promise<R> {
        const send = (await api())?.experimental?.sendServerRequest;
        if (!send) {
            throw new Error('The C# extension is not available (or too old to send requests to its language server).');
        }
        log.debug(`${method} ${JSON.stringify(params)}`);
        // The extension passes the first argument to vscode-languageclient as it is, which wants a RequestType (a string
        // reads as a request with no method name, and the server dies on the malformed message): its shape is enough
        return send<R>({ method, numberOfParams: 1, parameterStructures: 'byName' }, params, new vscode.CancellationTokenSource().token);
    }

    /** Has the server load our assembly; again after the server restarted */
    private activate(force = false): Promise<unknown> {
        if (!this.activated || force) {
            this.activated = this.send(ACTIVATE, { assemblyFilePath: this.assemblyPath }).catch(error => {
                this.activated = undefined;
                throw error;
            });
        }
        return this.activated;
    }

    /** Runs the handler `handler` (a class of our assembly) on `document` and returns its JSON answer */
    async document<M, R>(document: vscode.Uri, handler: string, message: M): Promise<R | undefined> {
        const dispatch = async () => this.send<{ response?: string }>(DISPATCH_DOCUMENT, {
            textDocument: { uri: document.toString() },
            messageName: handler,
            assemblyFilePath: this.assemblyPath,
            message: JSON.stringify(message),
        });
        await this.activate();
        let reply: { response?: string };
        try {
            reply = await dispatch();
        } catch (error) {
            if (!/No handler found/.test(String(error instanceof Error ? error.message : error))) {
                throw error;
            }
            // The server restarted since: it has to be told about our assembly again
            log.debug(`${handler} not known to the server, activating the extension again`);
            await this.activate(true);
            reply = await dispatch();
        }
        return reply.response ? JSON.parse(reply.response) as R : undefined;
    }
}
