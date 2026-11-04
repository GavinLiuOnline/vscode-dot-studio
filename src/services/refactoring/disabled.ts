import * as vscode from 'vscode';

/** What `shinobi.refactorings.disabled` calls a refactoring: its command without the prefix */
export const refactoringId = (command: string): string => command.replace('shinobi.refactor.', '');

/** Whether the user hides the refactoring from the lightbulb and the Refactor menu; read on each call, so a change applies at once */
export function isRefactoringDisabled(command: string): boolean {
    return vscode.workspace.getConfiguration('shinobi.refactorings').get<string[]>('disabled', []).includes(refactoringId(command));
}
