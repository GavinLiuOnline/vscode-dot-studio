import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../../core/logger';
import { t } from '../../core/i18n';
import { dirtyDocuments, findType, isOwnRename, ownRename, renameTypeOfFile, saveChanged, typeNamesOfRename, typeStartingAt } from './typeRename';

const log = logger('RenameSync');

export const RENAME_SYMBOL_COMMAND = 'shinobi.renameSymbol';

const symbolsOf = async (uri: vscode.Uri) =>
    (await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>('vscode.executeDocumentSymbolProvider', uri)) ?? [];

/**
 * A file renamed in VS Code's Explorer (or anywhere but our Solution Explorer, which asks before the rename): like Visual Studio,
 * offers to rename the type named after the file and all references to it.
 */
export async function typeFollowsRenamedFiles(files: readonly { oldUri: vscode.Uri; newUri: vscode.Uri }[]): Promise<void> {
    for (const { oldUri, newUri } of files) {
        const names = typeNamesOfRename(oldUri.fsPath, newUri.fsPath);
        if (!names || isOwnRename(newUri.fsPath)) {
            continue;
        }
        try {
            // the file is at its new path already: the type is looked for there, under its old name
            const edit = await renameTypeOfFile(newUri, names.oldName, names.newName, false);
            if (!edit) {
                continue;
            }
            const dirtyBefore = dirtyDocuments();
            if (!await vscode.workspace.applyEdit(edit)) {
                void vscode.window.showWarningMessage(t('Could not rename the type \'{0}\'.', names.oldName));
                continue;
            }
            await saveChanged(edit, dirtyBefore);
        } catch (error) {
            log.warn(`Renaming the type of ${newUri.fsPath} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/**
 * F2 on the type of a file named after it: the rename of VS Code runs as it always does, then the file is offered the new name.
 * (A symbol rename raises no event, so the command wraps the rename.) Anywhere else F2 is the plain rename.
 */
export async function renameSymbol(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const named = editor?.document.languageId === 'csharp' ? await typeNamedAfterFile(editor) : undefined;
    await vscode.commands.executeCommand('editor.action.rename');
    if (!editor || !named) {
        return;
    }
    try {
        await offerFileRename(editor.document.uri, named.start, named.oldName);
    } catch (error) {
        log.warn(`Renaming the file of ${editor.document.uri.fsPath} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** The type under the cursor when the file carries its name */
async function typeNamedAfterFile(editor: vscode.TextEditor): Promise<{ start: vscode.Position; oldName: string } | undefined> {
    const uri = editor.document.uri;
    const oldName = path.basename(uri.fsPath, path.extname(uri.fsPath));
    const type = findType(await symbolsOf(uri), oldName);
    return type?.selectionRange.contains(editor.selection.active) ? { start: type.selectionRange.start, oldName } : undefined;
}

async function offerFileRename(uri: vscode.Uri, start: vscode.Position, oldName: string): Promise<void> {
    const type = typeStartingAt(await symbolsOf(uri), start);
    if (!type || type.name === oldName) {
        return;
    }
    const newPath = path.join(path.dirname(uri.fsPath), type.name + path.extname(uri.fsPath));
    if (typeNamesOfRename(uri.fsPath, newPath) === undefined) {
        return;
    }
    const oldFile = path.basename(uri.fsPath);
    const newFile = path.basename(newPath);
    if (await exists(vscode.Uri.file(newPath))) {
        void vscode.window.showWarningMessage(t('\'{0}\' exists already, so the file keeps the name \'{1}\'.', newFile, oldFile));
        return;
    }
    const choice = await vscode.window.showInformationMessage(t('Would you also like to rename the file \'{0}\' to \'{1}\'?', oldFile, newFile), 'Yes', 'No');
    if (choice !== 'Yes') {
        return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(uri, vscode.Uri.file(newPath));
    if (!await ownRename(newPath, () => Promise.resolve(vscode.workspace.applyEdit(edit)))) {
        void vscode.window.showWarningMessage(t('Could not rename {0}', oldFile));
    }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

export function registerRenameSync(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles(event => void typeFollowsRenamedFiles(event.files)),
        vscode.commands.registerCommand(RENAME_SYMBOL_COMMAND, () => renameSymbol())
    );
}
