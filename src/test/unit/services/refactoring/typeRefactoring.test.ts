const edits: { replace: unknown[]; created: unknown[] } = { replace: [], created: [] };
const saved: string[] = [];
const picked = jest.fn();
const document = jest.fn();
const existsSync = jest.fn(() => false);

jest.mock('fs', () => ({ ...jest.requireActual('fs'), existsSync: (...args: unknown[]) => (existsSync as (...a: unknown[]) => boolean)(...args) }));
jest.mock('vscode', () => ({
    CodeActionKind: { RefactorExtract: 'refactor.extract' },
    CodeAction: class { command: unknown; constructor(public title: string, public kind: unknown) {} },
    Range: class { constructor(public a: number, public b: number, public c: number, public d: number) {} },
    Position: class { constructor(public line: number, public character: number) {} },
    Uri: { file: (path: string) => ({ fsPath: path }) },
    WorkspaceEdit: class {
        replace(_uri: unknown, range: unknown, text: string) { edits.replace.push([range, text]); }
        createFile(uri: unknown) { edits.created.push(uri); }
        insert() { /* the content of the new file */ }
    },
    window: { showInformationMessage: jest.fn(), showErrorMessage: jest.fn(), showWarningMessage: jest.fn() },
    workspace: {
        openTextDocument: async (uri: { fsPath: string }) => ({ uri, isDirty: false, save: async () => { saved.push(uri.fsPath); } }),
        applyEdit: async () => true,
    },
}), { virtual: true });
jest.mock('../../../../webview/providers/RefactoringPanel', () => ({ RefactoringPanel: { pick: (...args: unknown[]) => picked(...args) } }));
jest.mock('../../../../services/refactoring/newFileRefresh', () => ({ refreshProjectForNewFile: () => false }));

import * as vscode from 'vscode';
import { TypeRefactoring } from '../../../../services/refactoring/typeRefactoring';
import { EXTRACT_INTERFACE } from '../../../../services/refactoring/extractInterface';
import { EXTRACT_PARTIAL } from '../../../../services/refactoring/extractPartial';
import { EXTRACT_SUPERCLASS } from '../../../../services/refactoring/extractSuperclass';
import { PULL_UP } from '../../../../services/refactoring/pullUp';

const uri = { fsPath: '/p/Order.cs', toString: () => 'file:///p/Order.cs' } as vscode.Uri;
const position = new vscode.Position(4, 14);
const at = (line: number, character: number) => ({ start: new vscode.Position(line, character) }) as unknown as vscode.Range;
const lineOf = (text: string) => ({ lineAt: () => ({ text }), uri }) as unknown as vscode.TextDocument;

function setup(spec = EXTRACT_PARTIAL) {
    const server = { document };
    document.mockReset();
    return new TypeRefactoring(server as never, spec);
}

describe('TypeRefactoring', () => {
    beforeEach(() => { edits.replace = []; edits.created = []; saved.length = 0; picked.mockReset(); existsSync.mockReturnValue(false); });

    it('offers its entry on the name of a type only, as the server says', async () => {
        const refactoring = setup();
        document.mockResolvedValueOnce({ typeName: 'Order', partName: 'Part', members: [] });
        const [action] = await refactoring.provideCodeActions(lineOf('public class Order'), at(4, 14));
        expect(action.title).toBe('Extract members to partial class...');
        expect(action.command).toMatchObject({ command: 'shinobi.refactor.extractPartial', arguments: [uri, expect.anything()] });
        expect(document.mock.calls[0][1]).toBe('Shinobi.Refactorings.ExtractPartialInfoHandler');

        document.mockResolvedValueOnce(null);
        expect(await refactoring.provideCodeActions(lineOf('public class Order'), at(4, 3))).toEqual([]);
        expect(await refactoring.provideCodeActions(lineOf('    var x = 1;'), at(1, 1))).toEqual([]);
        expect(document).toHaveBeenCalledTimes(2);
    });

    it('offers nothing while the server is not there', async () => {
        const refactoring = setup();
        document.mockRejectedValue(new Error('Tried to send request while server is not started.'));
        expect(await refactoring.provideCodeActions(lineOf('public class Order'), at(4, 14))).toEqual([]);
    });

    it('asks the form, sends the choice with the position, applies the edits and saves both files', async () => {
        const refactoring = setup();
        document
            .mockResolvedValueOnce({ typeName: 'Order', partName: 'Part', members: [{ id: '1:A', kind: 'method', signature: 'void Add()' }] })
            .mockResolvedValueOnce({ edits: [{ startLine: 4, startCharacter: 7, endLine: 4, endCharacter: 7, newText: 'partial ' }], newFilePath: '/p/Order.Part.cs', newFileContent: 'x' });
        picked.mockResolvedValue({ kind: 'extractPartial', partName: 'Part', memberIds: ['1:A'] });
        await refactoring.run(uri, position);
        expect(picked.mock.calls[0][0]).toBe('Extract Members from Order');
        expect(document.mock.calls[1][1]).toBe('Shinobi.Refactorings.ExtractPartialHandler');
        expect(document.mock.calls[1][2]).toMatchObject({ kind: 'extractPartial', partName: 'Part', memberIds: ['1:A'], position });
        expect(edits.replace).toHaveLength(1);
        expect(edits.created).toHaveLength(1);
        expect(saved).toEqual(['/p/Order.Part.cs', '/p/Order.cs']);
    });

    it('changes nothing when the form is cancelled, or when the new file exists', async () => {
        const refactoring = setup();
        document.mockResolvedValue({ typeName: 'Order', partName: 'Part', members: [] });
        picked.mockResolvedValue(undefined);
        await refactoring.run(uri, position);
        expect(document).toHaveBeenCalledTimes(1);

        document.mockReset();
        document.mockResolvedValueOnce({ typeName: 'Order', partName: 'Part', members: [] }).mockResolvedValueOnce({ edits: [], newFilePath: '/p/Order.Part.cs', newFileContent: 'x' });
        picked.mockResolvedValue({ kind: 'extractPartial', partName: 'Part', memberIds: ['1:A'] });
        existsSync.mockReturnValue(true);
        await refactoring.run(uri, position);
        expect(edits.created).toHaveLength(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('already exists'));
    });

    it('ignores a choice of another refactoring and says so when the cursor is not on a type', async () => {
        const refactoring = setup(EXTRACT_INTERFACE as never);
        document.mockResolvedValueOnce({ typeName: 'Order', interfaceName: 'IOrder', members: [] });
        picked.mockResolvedValue({ kind: 'extractPartial', partName: 'Part', memberIds: [] });
        await refactoring.run(uri, position);
        expect(document).toHaveBeenCalledTimes(1);

        document.mockResolvedValueOnce(null);
        await refactoring.run(uri, position);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('extract an interface'));
    });

    it('shows the server\'s reason instead of the form when the type cannot be refactored', async () => {
        const refactoring = setup(EXTRACT_SUPERCLASS as never);
        document.mockResolvedValueOnce({ typeName: 'Inner', baseName: 'InnerBase', members: [], refusal: 'Inner is a nested type' });
        await refactoring.run(uri, position);
        expect(picked).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Inner is a nested type');
    });

    it('does not apply edits that would add compiler errors, and lists them', async () => {
        const refactoring = setup(EXTRACT_SUPERCLASS as never);
        document
            .mockResolvedValueOnce({ typeName: 'Foo', baseName: 'FooBase', members: [] })
            .mockResolvedValueOnce({ edits: [{ startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0, newText: 'x' }], newFilePath: '/p/FooBase.cs', newFileContent: 'x', errors: ['A.cs(3,5): CS0191: boom'] });
        picked.mockResolvedValue({ kind: 'extractSuperclass', baseName: 'FooBase', memberIds: ['1'], abstractIds: [], newFile: true });
        await refactoring.run(uri, position);
        expect(edits.replace).toHaveLength(0);
        expect(saved).toHaveLength(0);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('would not compile (1 new error)'), { modal: true, detail: 'A.cs(3,5): CS0191: boom' });
    });

    it('Pull Members Up is offered on a member line and on a type line, but not where the server refuses', async () => {
        const refactoring = setup(PULL_UP as never);
        document.mockResolvedValueOnce({ typeName: 'Dog', targets: [{ id: 'A' }], members: [], selected: [] });
        const [action] = await refactoring.provideCodeActions(lineOf('    public void Fetch() { }'), at(10, 20));
        expect(action.title).toBe('Pull members up...');
        expect(document.mock.calls[0][1]).toBe('Shinobi.Refactorings.PullUpInfoHandler');

        document.mockResolvedValueOnce({ typeName: 'Loner', targets: [], members: [], selected: [], refusal: 'Loner has no base class' });
        expect(await refactoring.provideCodeActions(lineOf('public class Loner'), at(4, 14))).toEqual([]);
        // a comment, an empty or a brace-only line is not asked at all
        expect(await refactoring.provideCodeActions(lineOf('    // a comment'), at(3, 8))).toEqual([]);
        expect(await refactoring.provideCodeActions(lineOf('    }'), at(5, 4))).toEqual([]);
        expect(document).toHaveBeenCalledTimes(2);
    });

    it('applies the edits of other files too, and saves them', async () => {
        const refactoring = setup(PULL_UP as never);
        document
            .mockResolvedValueOnce({ typeName: 'Dog', targets: [{ id: 'A', name: 'Animal', kind: 'class', where: '', isAbstract: false }], members: [], selected: [] })
            .mockResolvedValueOnce({
                edits: [{ startLine: 8, startCharacter: 0, endLine: 10, endCharacter: 0, newText: '' }],
                others: [{ path: '/p/Animal.cs', edits: [{ startLine: 5, startCharacter: 0, endLine: 5, endCharacter: 0, newText: 'int x;\n' }] }],
            });
        picked.mockResolvedValue({ kind: 'pullUp', targetId: 'A', memberIds: ['1:A'], abstractIds: [] });
        await refactoring.run(uri, position);
        expect(document.mock.calls[1][1]).toBe('Shinobi.Refactorings.PullUpHandler');
        expect(document.mock.calls[1][2]).toMatchObject({ kind: 'pullUp', targetId: 'A', memberIds: ['1:A'], position });
        expect(edits.replace).toHaveLength(2);
        expect(saved).toEqual(['/p/Order.cs', '/p/Animal.cs']);
    });
});
