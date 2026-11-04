import * as vscode from 'vscode';
import { logger } from '../../core/logger';
import { applyServerResult, ServerEdit, ServerResult } from './applyResult';
import { CSharpServer } from './csharpServer';
import { t } from '../../core/i18n';
import { isRefactoringDisabled } from './disabled';

const log = logger('ExtractMethodChecked');

/** What the server's Extract method / Extract local function is called in the lightbulb menu, and ours next to it */
export interface CheckedExtraction {
    command: string;
    /** The entry of ours */
    title: string;
    /** The server's entry (English: the server's language is the editor's, other languages are not matched) */
    nativeTitle: RegExp;
}

export const EXTRACT_METHOD_CHECKED: CheckedExtraction = {
    command: 'shinobi.refactor.extractMethodChecked',
    title: t('Extract method (checked)...'),
    nativeTitle: /^extract method$/i,
};

export const EXTRACT_LOCAL_FUNCTION_CHECKED: CheckedExtraction = {
    command: 'shinobi.refactor.extractLocalFunctionChecked',
    title: t('Extract local function (checked)...'),
    nativeTitle: /^extract local function$/i,
};

interface LspPosition { line: number; character: number }
interface LspAction { title: string; kind?: string; edit?: LspWorkspaceEdit; data?: unknown }
interface LspTextEdit { range: { start: LspPosition; end: LspPosition }; newText: string }
interface LspWorkspaceEdit {
    changes?: Record<string, LspTextEdit[]>;
    documentChanges?: { kind?: string; textDocument?: { uri: string }; edits?: LspTextEdit[] }[];
}

/** The edits of a workspace edit that touch `uri`; undefined when it touches anything else (a file is created, another file changes) */
export function editsOf(edit: LspWorkspaceEdit, uri: string): ServerEdit[] | undefined {
    const perFile: Record<string, LspTextEdit[]> = { ...edit.changes };
    for (const change of edit.documentChanges ?? []) {
        if (change.kind || !change.textDocument || !change.edits) {
            return undefined;
        }
        (perFile[change.textDocument.uri] ??= []).push(...change.edits);
    }
    const files = Object.keys(perFile);
    if (files.length !== 1 || files[0] !== uri) {
        return undefined;
    }
    return perFile[uri].map(e => ({
        startLine: e.range.start.line, startCharacter: e.range.start.character,
        endLine: e.range.end.line, endCharacter: e.range.end.character, newText: e.newText,
    }));
}

/**
 * The language server's own Extract method and Extract local function make an out parameter that is not assigned on every path
 * (CS0177) and other code that does not compile. This asks the server for its edit, has our assembly compile it on a copy of the
 * solution and repair what it can (the missing `x = default;`), and applies it only when it compiles.
 */
export class ExtractMethodChecked implements vscode.CodeActionProvider {
    static readonly metadata: vscode.CodeActionProviderMetadata = { providedCodeActionKinds: [vscode.CodeActionKind.RefactorExtract] };

    constructor(private readonly server: CSharpServer, readonly extraction: CheckedExtraction) {}

    /** Extract method and Extract local function ask the same question of the same selection: one request answers both */
    private static last: { key: string; actions: Promise<LspAction[]> } | undefined;

    private cachedNativeActions(document: vscode.TextDocument, range: vscode.Range): Promise<LspAction[]> {
        const key = `${document.uri.toString()}|${document.version}|${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
        if (ExtractMethodChecked.last?.key !== key) {
            ExtractMethodChecked.last = { key, actions: this.nativeActions(document.uri, range) };
        }
        return ExtractMethodChecked.last.actions;
    }

    /** The server's code actions for a range (kind refactor.extract), straight from the server so our own provider is not called again */
    private async nativeActions(uri: vscode.Uri, range: vscode.Range): Promise<LspAction[]> {
        const result = await this.server.request<LspAction[] | null>('textDocument/codeAction', {
            textDocument: { uri: uri.toString() },
            range: { start: { line: range.start.line, character: range.start.character }, end: { line: range.end.line, character: range.end.character } },
            context: { diagnostics: [], only: ['refactor.extract'] },
        });
        return result ?? [];
    }

    async provideCodeActions(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.CodeAction[]> {
        if (isRefactoringDisabled(this.extraction.command) || range.isEmpty || document.getText(range).trim().length === 0) {
            return [];
        }
        try {
            if (!(await this.cachedNativeActions(document, range)).some(action => this.extraction.nativeTitle.test(action.title))) {
                return [];
            }
            const action = new vscode.CodeAction(this.extraction.title, vscode.CodeActionKind.RefactorExtract);
            action.command = { command: this.extraction.command, title: this.extraction.title, arguments: [document.uri, range] };
            return [action];
        } catch (error) {
            log.debug(`No ${this.extraction.title} action: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /** The server's edit, checked and repaired by our assembly, applied */
    async run(uri: vscode.Uri, range: vscode.Range): Promise<void> {
        const native = (await this.nativeActions(uri, range)).find(action => this.extraction.nativeTitle.test(action.title));
        if (!native) {
            void vscode.window.showInformationMessage(t('The language server offers nothing to extract for this selection.'));
            return;
        }
        const resolved = native.edit ? native : await this.server.request<LspAction>('codeAction/resolve', native);
        const edits = resolved.edit ? editsOf(resolved.edit, uri.toString()) : undefined;
        if (!edits) {
            throw new Error('The language server gave no edit for this selection, or one that touches other files.');
        }
        const result = await this.server.document<{ edits: ServerEdit[] }, ServerResult | null>(uri, 'Shinobi.Refactorings.CheckEditsHandler', { edits });
        if (!result) {
            throw new Error('The language server gave no edits.');
        }
        await applyServerResult(uri, result, this.extraction.title);
    }
}
