import * as vscode from 'vscode';
import * as fs from 'fs';
import { logger } from '../../core/logger';
import { RefactorChoice, RefactorForm } from '../../types/refactoring';
import { RefactoringPanel } from '../../webview/providers/RefactoringPanel';
import { CSharpServer } from './csharpServer';
import { refreshProjectForNewFile } from './newFileRefresh';

const log = logger('TypeRefactoring');

interface ServerEdit { startLine: number; startCharacter: number; endLine: number; endCharacter: number; newText: string }
/** What the server's handlers answer: edits of the file and a new file */
interface ServerResult { edits: ServerEdit[]; newFilePath?: string; newFileContent?: string }

/** A refactoring of the type under the cursor that asks for choices in a form and lets the server build the edits */
export interface TypeRefactoringSpec<Form extends RefactorForm = RefactorForm> {
    /** The command the code action runs (hidden from the palette) */
    command: string;
    /** The entry in the lightbulb menu */
    actionTitle: string;
    /** The server's handler classes: `<handler>InfoHandler` lists what the form needs, `<handler>Handler` builds the edits */
    handler: string;
    /** The kind of its form and choice */
    kind: Form['kind'];
    /** Said when the cursor is not on the name of a type */
    notOnTypeMessage: string;
    /** The form of what the server listed */
    formOf(info: Omit<Form, 'kind'>): { title: string; form: Form };
}

/** Matches a line that declares a type; the server decides whether the cursor is on its name */
const TYPE_DECLARATION = /\b(class|struct|record)\s+[A-Za-z_]\w*/;

/**
 * The pattern of the refactorings that pick members: a lightbulb entry on a type's name, the server lists the members, a form
 * in the editor area asks the choices, the server builds the edits, they are applied and saved.
 */
export class TypeRefactoring implements vscode.CodeActionProvider {
    static readonly metadata: vscode.CodeActionProviderMetadata = { providedCodeActionKinds: [vscode.CodeActionKind.RefactorExtract] };

    constructor(private readonly server: CSharpServer, readonly spec: TypeRefactoringSpec) {}

    private info(uri: vscode.Uri, position: vscode.Position): Promise<(Omit<RefactorForm, 'kind'> & { typeName: string }) | null | undefined> {
        return this.server.document(uri, `${this.spec.handler}InfoHandler`, { position });
    }

    async provideCodeActions(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.CodeAction[]> {
        if (!TYPE_DECLARATION.test(document.lineAt(range.start.line).text)) {
            return [];
        }
        try {
            if (!await this.info(document.uri, range.start)) {
                return [];
            }
            const action = new vscode.CodeAction(this.spec.actionTitle, vscode.CodeActionKind.RefactorExtract);
            action.command = { command: this.spec.command, title: this.spec.actionTitle, arguments: [document.uri, range.start] };
            return [action];
        } catch (error) {
            // No C# extension, a server that is still starting: no action, no noise
            log.debug(`No ${this.spec.actionTitle} action: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /** Asks the server for the members, the user for the choices, the server for the edits, and applies them */
    async run(uri: vscode.Uri, position: vscode.Position): Promise<void> {
        const info = await this.info(uri, position);
        if (!info) {
            void vscode.window.showInformationMessage(this.spec.notOnTypeMessage);
            return;
        }
        const { title, form } = this.spec.formOf(info as never);
        const choice = await RefactoringPanel.pick(title, form);
        if (!choice || choice.kind !== this.spec.kind) {
            return;
        }
        const result = await this.server.document<RefactorChoice & { position: vscode.Position }, ServerResult | null>(
            uri, `${this.spec.handler}Handler`, { ...choice, position });
        if (!result) {
            throw new Error('The language server gave no edits.');
        }
        if (result.newFilePath && fs.existsSync(result.newFilePath)) {
            void vscode.window.showErrorMessage(`${result.newFilePath} already exists; pick another name.`);
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
        log.info(`${this.spec.actionTitle} on ${uri.fsPath}`);
    }
}
