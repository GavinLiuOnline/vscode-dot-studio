const applied: unknown[] = [];
const disabled: string[] = [];
jest.mock('vscode', () => ({
    CodeActionKind: {
        RefactorExtract: 'refactor.extract', RefactorRewrite: 'refactor.rewrite',
        RefactorMove: { value: 'refactor.move', append: (part: string) => `refactor.move.${part}` },
    },
    CodeAction: class { command: unknown; constructor(public title: string, public kind: unknown) {} },
    window: { showInformationMessage: jest.fn(), showErrorMessage: jest.fn() },
    workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => (disabled.length > 0 ? disabled : fallback) }) },
}), { virtual: true });
jest.mock('../../../../services/refactoring/applyResult', () => ({ applyServerResult: async (...args: unknown[]) => { applied.push(args); return true; } }));

import * as vscode from 'vscode';
import { EXTRACT_LOCAL_FUNCTION_CHECKED, EXTRACT_METHOD_CHECKED, ExtractMethodChecked, editsOf } from '../../../../services/refactoring/extractMethodChecked';

const uriString = 'file:///p/R.cs';
const uri = { toString: () => uriString, fsPath: '/p/R.cs' } as vscode.Uri;
const range = (empty = false) => ({ isEmpty: empty, start: { line: 14, character: 8 }, end: { line: 16, character: 40 } }) as unknown as vscode.Range;
const doc = (text = 'x != null && y') => ({ uri, version: 3, getText: () => text }) as unknown as vscode.TextDocument;
const edit = { documentChanges: [{ textDocument: { uri: uriString }, edits: [{ range: { start: { line: 14, character: 8 }, end: { line: 16, character: 40 } }, newText: 'NewMethod()' }] }] };

describe('editsOf', () => {
    it('takes the edits of the file, from documentChanges or changes', () => {
        expect(editsOf(edit, uriString)).toEqual([{ startLine: 14, startCharacter: 8, endLine: 16, endCharacter: 40, newText: 'NewMethod()' }]);
        expect(editsOf({ changes: { [uriString]: [{ range: { start: { line: 1, character: 2 }, end: { line: 3, character: 4 } }, newText: 'a' }] } }, uriString)).toHaveLength(1);
    });

    it('refuses an edit that touches another file or creates one', () => {
        expect(editsOf({ changes: { 'file:///p/Other.cs': [] } }, uriString)).toBeUndefined();
        expect(editsOf({ documentChanges: [{ kind: 'create' }] }, uriString)).toBeUndefined();
    });
});

describe('ExtractMethodChecked', () => {
    const request = jest.fn();
    const document = jest.fn();
    const make = (extraction = EXTRACT_METHOD_CHECKED) => new ExtractMethodChecked({ request, document } as never, extraction);
    beforeEach(() => { disabled.length = 0; request.mockReset(); document.mockReset(); applied.length = 0; });

    it('is not offered, and the server is not asked, when the user hides it', async () => {
        disabled.push('extractMethodChecked');
        expect(await make().provideCodeActions(doc(), range())).toEqual([]);
        expect(request).not.toHaveBeenCalled();
    });

    it('is offered next to the server\'s entry, for a selection only', async () => {
        request.mockResolvedValue([{ title: 'Extract method' }, { title: 'Extract local function' }]);
        const [action] = await make().provideCodeActions(doc(), range());
        expect(action.title).toBe('Extract method (checked)...');
        expect(action.command).toMatchObject({ command: 'shinobi.refactor.extractMethodChecked' });
        expect(request.mock.calls[0][0]).toBe('textDocument/codeAction');
        expect(request.mock.calls[0][1]).toMatchObject({ context: { only: ['refactor.extract'] } });
        // the local function entry asks the same selection: answered from the same request
        const [local] = await make(EXTRACT_LOCAL_FUNCTION_CHECKED).provideCodeActions(doc(), range());
        expect(local.title).toBe('Extract local function (checked)...');
        expect(request).toHaveBeenCalledTimes(1);

        expect(await make().provideCodeActions(doc(), range(true))).toEqual([]);
        expect(await make().provideCodeActions(doc('   '), range())).toEqual([]);
    });

    it('is not offered where the server offers nothing, or is not there', async () => {
        request.mockResolvedValue([{ title: 'Introduce local' }]);
        expect(await make().provideCodeActions({ ...doc(), version: 4 } as vscode.TextDocument, range())).toEqual([]);
        request.mockRejectedValue(new Error('not started'));
        expect(await make().provideCodeActions({ ...doc(), version: 5 } as vscode.TextDocument, range())).toEqual([]);
    });

    it('resolves the server\'s edit, has it checked, and applies the answer', async () => {
        request.mockResolvedValueOnce([{ title: 'Extract method', data: 1 }]).mockResolvedValueOnce({ title: 'Extract method', edit });
        document.mockResolvedValue({ edits: [{ startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0, newText: 'repaired' }] });
        await make().run(uri, range());
        expect(request.mock.calls[1][0]).toBe('codeAction/resolve');
        expect(document.mock.calls[0][1]).toBe('Shinobi.Refactorings.CheckEditsHandler');
        expect(document.mock.calls[0][2]).toEqual({ edits: editsOf(edit, uriString) });
        expect(applied).toEqual([[uri, { edits: [{ startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0, newText: 'repaired' }] }, 'Extract method (checked)...']]);
    });

    it('says so when the server has nothing, and stops on an edit that touches other files', async () => {
        request.mockResolvedValueOnce([]);
        await make().run(uri, range());
        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        request.mockResolvedValueOnce([{ title: 'Extract method', edit: { documentChanges: [{ kind: 'create' }] } }]);
        await expect(make().run(uri, range())).rejects.toThrow('touches other files');
        expect(applied).toEqual([]);
    });
});
