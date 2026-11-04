import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../core/logger';
import { refreshProjectForNewFile } from './newFileRefresh';
import { t } from '../../core/i18n';

const log = logger('ApplyResult');

export interface ServerEdit { startLine: number; startCharacter: number; endLine: number; endCharacter: number; newText: string }
/** What the server's handlers answer: edits of the file and a new file */
export interface ServerResult { edits: ServerEdit[]; newFilePath?: string; newFileContent?: string; errors?: string[]; others?: { path: string; edits: ServerEdit[] }[]; summary?: string }

/**
 * Applies what a handler answered: the edits of the file and the new file, saved so a build and the language server see them.
 * Edits the server found would not compile are not applied; the errors are shown. Returns whether anything was applied.
 */
export async function applyServerResult(uri: vscode.Uri, result: ServerResult, title: string): Promise<boolean> {
    // The server compiled the result before handing it out: edits that would add compiler errors are not applied
    if (result.errors?.length) {
        const shown = result.errors.slice(0, 8);
        const more = result.errors.length > shown.length ? t('\n... and {0} more', result.errors.length - shown.length) : '';
        log.warn(`${title} refused, new errors: ${result.errors.join(' | ')}`);
        void vscode.window.showErrorMessage(
            t('{0} was not applied: the result would not compile ({1}). Nothing was changed.', title.replace(/\.\.\.$/, ''), t(result.errors.length === 1 ? '{0} new error' : '{0} new errors', result.errors.length)),
            { modal: true, detail: shown.join('\n') + more });
        return false;
    }
    if (result.newFilePath && fs.existsSync(result.newFilePath)) {
        void vscode.window.showErrorMessage(t('{0} already exists; pick another name.', result.newFilePath));
        return false;
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const wasDirty = document.isDirty;
    const edit = new vscode.WorkspaceEdit();
    const range = (change: ServerEdit) => new vscode.Range(change.startLine, change.startCharacter, change.endLine, change.endCharacter);
    for (const change of result.edits) {
        edit.replace(uri, range(change), change.newText);
    }
    // other existing files (the base class a member was pulled up to); the ones that were clean are saved afterwards
    const others: { document: vscode.TextDocument; wasDirty: boolean }[] = [];
    for (const other of result.others ?? []) {
        const otherDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(other.path));
        others.push({ document: otherDocument, wasDirty: otherDocument.isDirty });
        for (const change of other.edits) {
            edit.replace(otherDocument.uri, range(change), change.newText);
        }
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
    // what the user had unsaved stays unsaved (their own changes are not ours to save): it is said, so a file that stays unsaved is no surprise
    const unsaved: string[] = [];
    if (wasDirty) {
        unsaved.push(path.basename(uri.fsPath));
    } else if (await document.save() === false) {
        unsaved.push(path.basename(uri.fsPath));
    }
    for (const other of others) {
        if (other.wasDirty) {
            unsaved.push(path.basename(other.document.uri.fsPath));
        } else if (await other.document.save() === false) {
            unsaved.push(path.basename(other.document.uri.fsPath));
        }
    }
    log.info(`${title} on ${uri.fsPath}${result.summary ? `: ${result.summary}` : ''}`
        + `${others.length > 0 ? `; also changed: ${others.map(o => o.document.uri.fsPath).join(', ')}` : ''}`
        + `${unsaved.length > 0 ? `; left unsaved (had unsaved changes): ${unsaved.join(', ')}` : ''}`);
    const note = unsaved.length === 0 ? '' : unsaved.length === 1
        ? t('{0} had unsaved changes of yours, so it is changed but not saved.', unsaved[0])
        : t('{0} had unsaved changes of yours, so they are changed but not saved.', unsaved.join(', '));
    const message = [result.summary, note].filter(Boolean).join(' ');
    if (message) {
        void vscode.window.showInformationMessage(message);
    }
    return true;
}
