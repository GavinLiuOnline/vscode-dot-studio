import * as vscode from 'vscode';
import * as fs from 'fs';
import { logger } from '../../core/logger';
import { refreshProjectForNewFile } from './newFileRefresh';

const log = logger('ApplyResult');

export interface ServerEdit { startLine: number; startCharacter: number; endLine: number; endCharacter: number; newText: string }
/** What the server's handlers answer: edits of the file and a new file */
export interface ServerResult { edits: ServerEdit[]; newFilePath?: string; newFileContent?: string; errors?: string[] }

/**
 * Applies what a handler answered: the edits of the file and the new file, saved so a build and the language server see them.
 * Edits the server found would not compile are not applied; the errors are shown. Returns whether anything was applied.
 */
export async function applyServerResult(uri: vscode.Uri, result: ServerResult, title: string): Promise<boolean> {
    // The server compiled the result before handing it out: edits that would add compiler errors are not applied
    if (result.errors?.length) {
        const shown = result.errors.slice(0, 8);
        const more = result.errors.length > shown.length ? `\n... and ${result.errors.length - shown.length} more` : '';
        log.warn(`${title} refused, new errors: ${result.errors.join(' | ')}`);
        void vscode.window.showErrorMessage(
            `${title.replace(/\.\.\.$/, '')} was not applied: the result would not compile (${result.errors.length} new error${result.errors.length === 1 ? '' : 's'}). Nothing was changed.`,
            { modal: true, detail: shown.join('\n') + more });
        return false;
    }
    if (result.newFilePath && fs.existsSync(result.newFilePath)) {
        void vscode.window.showErrorMessage(`${result.newFilePath} already exists; pick another name.`);
        return false;
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
    log.info(`${title} on ${uri.fsPath}`);
    return true;
}
