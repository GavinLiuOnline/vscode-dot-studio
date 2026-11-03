import * as vscode from 'vscode';
import * as fs from 'fs';
import { logger } from '../../core/logger';
import { ExtractInterfaceChoice, ExtractInterfaceForm } from '../../types/refactoring';
import { RefactoringPanel } from '../../webview/providers/RefactoringPanel';
import { CSharpServer } from './csharpServer';
import { refreshProjectForNewFile } from './newFileRefresh';

const log = logger('ExtractInterface');

export const EXTRACT_INTERFACE_COMMAND = 'shinobi.refactor.extractInterface';

interface ServerEdit { startLine: number; startCharacter: number; endLine: number; endCharacter: number; newText: string }
interface ServerResult { edits: ServerEdit[]; newFilePath?: string; newFileContent?: string }
type ServerInfo = Omit<ExtractInterfaceForm, 'kind'>;

const HANDLER = 'Shinobi.Refactorings.ExtractInterface';

/** Matches a line that declares a type; the server decides whether the cursor is on its name */
const TYPE_DECLARATION = /\b(class|struct|record)\s+[A-Za-z_]\w*/;

/** Extract Interface with Visual Studio's choices: the members, the name, a new file; the picker is a form in the editor area */
export class ExtractInterface implements vscode.CodeActionProvider {
    static readonly metadata: vscode.CodeActionProviderMetadata = { providedCodeActionKinds: [vscode.CodeActionKind.RefactorExtract] };

    constructor(private readonly server: CSharpServer) {}

    async provideCodeActions(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.CodeAction[]> {
        if (!TYPE_DECLARATION.test(document.lineAt(range.start.line).text)) {
            return [];
        }
        try {
            const info = await this.server.document<unknown, ServerInfo | null>(document.uri, `${HANDLER}InfoHandler`, { position: range.start });
            if (!info) {
                return [];
            }
            const action = new vscode.CodeAction('Extract interface (choose members)...', vscode.CodeActionKind.RefactorExtract);
            action.command = { command: EXTRACT_INTERFACE_COMMAND, title: action.title, arguments: [document.uri, range.start] };
            return [action];
        } catch (error) {
            // No C# extension, a server that is still starting: no action, no noise
            log.debug(`No Extract interface action: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /** Asks the server for the members, the user for the choices, the server for the edits, and applies them */
    async run(uri: vscode.Uri, position: vscode.Position): Promise<void> {
        const info = await this.server.document<unknown, ServerInfo | null>(uri, `${HANDLER}InfoHandler`, { position });
        if (!info) {
            void vscode.window.showInformationMessage('Put the cursor on the name of a class, struct or record to extract an interface.');
            return;
        }
        const choice = await RefactoringPanel.pick(`Extract Interface from ${info.typeName}`, { kind: 'extractInterface', ...info });
        if (!choice || choice.kind !== 'extractInterface') {
            return;
        }
        const result = await this.server.document<ExtractInterfaceChoice & { position: vscode.Position }, ServerResult | null>(
            uri, `${HANDLER}Handler`, { ...choice, position });
        if (!result) {
            throw new Error('The language server gave no edits.');
        }
        if (result.newFilePath && fs.existsSync(result.newFilePath)) {
            void vscode.window.showErrorMessage(`${result.newFilePath} already exists; pick another interface name.`);
            return;
        }
        const document = await vscode.workspace.openTextDocument(uri);
        const wasDirty = document.isDirty;
        const edit = new vscode.WorkspaceEdit();
        for (const change of result.edits) {
            edit.replace(uri, new vscode.Range(change.startLine, change.startCharacter, change.endLine, change.endCharacter), change.newText);
        }
        if (result.newFilePath && result.newFileContent !== undefined) {
            const created = vscode.Uri.file(result.newFilePath);
            edit.createFile(created, { ignoreIfExists: false });
            edit.insert(created, new vscode.Position(0, 0), result.newFileContent);
        }
        if (!await vscode.workspace.applyEdit(edit)) {
            throw new Error('The edits could not be applied.');
        }
        // Saved, so a build and the language server see the new file (an unsaved one is only in the editor); the file the user
        // was editing only when it had no other unsaved changes
        if (result.newFilePath) {
            await (await vscode.workspace.openTextDocument(vscode.Uri.file(result.newFilePath))).save();
            if (refreshProjectForNewFile(result.newFilePath)) {
                log.debug('Touched the project file: the language server does not see new files in multi-targeted projects otherwise');
            }
        }
        if (!wasDirty) {
            await document.save();
        }
        log.info(`Extracted ${choice.interfaceName} from ${uri.fsPath}`);
    }
}
