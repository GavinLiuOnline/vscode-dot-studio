import * as vscode from 'vscode';
import { logger } from '../../core/logger';
import { RefactorChoice, RefactorForm } from '../../types/refactoring';
import { RefactoringPanel } from '../../webview/providers/RefactoringPanel';
import { CSharpServer } from './csharpServer';
import { applyServerResult, ServerResult } from './applyResult';
import { t } from '../../core/i18n';

const log = logger('TypeRefactoring');

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
    /** Said when the cursor is not where the refactoring works */
    notOnTypeMessage: string;
    /** The lines that can declare the type the refactoring works on (a class, struct or record by default) */
    declarationPattern?: RegExp;
    /** The entry's title when it depends on what the server found (its direction) */
    actionTitleOf?(info: Record<string, unknown>): string;
    /** The entry is offered on the name of a member as well (the server decides where), not only on a line that declares a type */
    onMembers?: boolean;
    /** The entry is not offered where the server refuses the refactoring (otherwise it is, and the reason shows when it is picked) */
    hideWhenRefused?: boolean;
    /** A second handler that adds what is too costly for the lightbulb (it looks through the solution): asked when the refactoring runs */
    detailsHandler?: string;
    /** What the details are called while the server works */
    detailsProgress?: string;
    /** The form of what the server listed */
    formOf(info: Omit<Form, 'kind'>): { title: string; form: Form };
}

/** Matches a line that declares a type; the server decides whether the cursor is on its name */
const TYPE_DECLARATION = /\b(class|struct|record)\s+[A-Za-z_]\w*/;

/** A line that can declare a type or a member: the server decides whether the cursor is on the name of one */
const MEMBER_DECLARATION = /[A-Za-z_]\w*\s*(\(|\{|=>|;|=|,)/;

/**
 * The pattern of the refactorings that pick members: a lightbulb entry on a type's name, the server lists the members, a form
 * in the editor area asks the choices, the server builds the edits, they are applied and saved.
 */
export class TypeRefactoring implements vscode.CodeActionProvider {
    static readonly metadata: vscode.CodeActionProviderMetadata = { providedCodeActionKinds: [vscode.CodeActionKind.RefactorExtract] };

    constructor(private readonly server: CSharpServer, readonly spec: TypeRefactoringSpec) {}

    private info(uri: vscode.Uri, position: vscode.Position): Promise<(Omit<RefactorForm, 'kind'> & { typeName: string; refusal?: string }) | null | undefined> {
        return this.server.document(uri, `${this.spec.handler}InfoHandler`, { position });
    }

    async provideCodeActions(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.CodeAction[]> {
        const line = document.lineAt(range.start.line).text;
        if (!(this.spec.declarationPattern ?? TYPE_DECLARATION).test(line) && !(this.spec.onMembers && MEMBER_DECLARATION.test(line))) {
            return [];
        }
        try {
            const info = await this.info(document.uri, range.start);
            if (!info || (this.spec.hideWhenRefused && info.refusal)) {
                return [];
            }
            const title = this.spec.actionTitleOf?.(info as Record<string, unknown>) ?? this.spec.actionTitle;
            const action = new vscode.CodeAction(title, vscode.CodeActionKind.RefactorExtract);
            action.command = { command: this.spec.command, title, arguments: [document.uri, range.start] };
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
        // The server knows this type cannot be refactored this way (a nested class, another part names a base class...): the reason, no form
        if (info.refusal) {
            void vscode.window.showWarningMessage(info.refusal);
            return;
        }
        let listed = info;
        if (this.spec.detailsHandler) {
            const detailsHandler = this.spec.detailsHandler;
            const details = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: this.spec.detailsProgress ?? t('Looking through the solution...') },
                () => this.server.document<unknown, typeof info>(uri, detailsHandler, { position }));
            listed = details ?? info;
        }
        const { title, form } = this.spec.formOf(listed as never);
        const choice = await RefactoringPanel.pick(title, form);
        if (!choice || choice.kind !== this.spec.kind) {
            return;
        }
        const result = await this.server.document<RefactorChoice & { position: vscode.Position }, ServerResult | null>(
            uri, `${this.spec.handler}Handler`, { ...choice, position });
        if (!result) {
            throw new Error(t('The language server gave no edits.'));
        }
        await applyServerResult(uri, result, this.spec.actionTitle);
    }
}
