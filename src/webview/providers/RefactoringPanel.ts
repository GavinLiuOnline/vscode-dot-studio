import * as vscode from 'vscode';
import { RefactorChoice, RefactorForm, RefactorRequest, RefactorMessage } from '../../types/refactoring';
import { activeSyntaxPalette } from '../../services/refactoring/themeColors';
import { TemplateWizardWebview } from './views/TemplateWizardWebview';

/**
 * The form a refactoring that needs choices asks them in: an editor tab in the active group, like a dialog.
 * Resolves with the choice on OK; with undefined on Cancel, ESC (while the form has focus) or closing the tab.
 */
export class RefactoringPanel {
    static extensionUri: vscode.Uri | undefined;
    private static open: RefactoringPanel | undefined;

    static pick(title: string, form: RefactorForm): Promise<RefactorChoice | undefined> {
        if (!this.extensionUri) {
            return Promise.reject(new Error('RefactoringPanel.extensionUri is not set'));
        }
        // One at a time: a second refactoring cancels the first one
        this.open?.panel.dispose();
        return new Promise(resolve => {
            this.open = new RefactoringPanel(this.extensionUri!, title, form, resolve);
        });
    }

    private readonly panel: vscode.WebviewPanel;

    private constructor(extensionUri: vscode.Uri, title: string, form: RefactorForm, private readonly done: (choice: RefactorChoice | undefined) => void) {
        this.panel = vscode.window.createWebviewPanel('shinobi.refactor', title, vscode.ViewColumn.Active, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'webview')],
        });
        this.panel.webview.html = TemplateWizardWebview.getHtmlForWebview(extensionUri, this.panel.webview, title, 'refactor-view');
        let settled = false;
        const settle = (choice: RefactorChoice | undefined) => {
            if (!settled) {
                settled = true;
                this.done(choice);
            }
        };
        const subscription = this.panel.webview.onDidReceiveMessage((request: RefactorRequest) => {
            if (request.type === 'ready') {
                const message: RefactorMessage = { type: 'form', title, form, palette: activeSyntaxPalette() };
                void this.panel.webview.postMessage(message);
            } else if (request.type === 'submit') {
                settle(request.choice);
                this.panel.dispose();
            } else {
                this.panel.dispose();
            }
        });
        this.panel.onDidDispose(() => {
            subscription.dispose();
            if (RefactoringPanel.open === this) {
                RefactoringPanel.open = undefined;
            }
            settle(undefined);
        });
    }
}
