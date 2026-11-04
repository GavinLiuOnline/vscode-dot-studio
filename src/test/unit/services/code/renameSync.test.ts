const env = {
    symbols: undefined as any[] | undefined,
    symbolsAfterRename: undefined as any[] | undefined,
    renameEdit: undefined as any,
    choice: undefined as string | undefined,
    prompts: [] as string[],
    warnings: [] as string[],
    commands: [] as string[],
    appliedEdits: [] as any[],
    saved: [] as string[],
    existing: new Set<string>(),
    activeEditor: undefined as any,
};

jest.mock('vscode', () => {
    class Position {
        constructor(public line: number, public character: number) { }
        isEqual(other: Position) { return other.line === this.line && other.character === this.character; }
    }
    class Range {
        constructor(public start: Position, public end: Position) { }
        contains(position: Position) { return position.line === this.start.line && position.character >= this.start.character && position.character <= this.end.character; }
    }
    class WorkspaceEdit {
        operations: string[] = [];
        private uris: { fsPath: string }[] = [];
        replace(uri: { fsPath: string }) { this.operations.push(`edit ${uri.fsPath}`); this.uris.push(uri); }
        renameFile(from: { fsPath: string }, to: { fsPath: string }) { this.operations.push(`rename ${from.fsPath} -> ${to.fsPath}`); }
        entries() { return this.uris.map(uri => [uri, []]); }
    }
    const uri = (fsPath: string) => ({ fsPath, toString: () => fsPath });
    const doc = (fsPath: string) => ({ uri: uri(fsPath), isDirty: true, save: async () => { env.saved.push(fsPath); return true; } });
    return {
        Position, Range, WorkspaceEdit,
        SymbolKind: { Namespace: 2, Class: 4, Enum: 9, Interface: 10, Struct: 22, Method: 5 },
        Uri: { file: uri },
        commands: {
            executeCommand: async (command: string) => {
                env.commands.push(command);
                if (command === 'vscode.executeDocumentSymbolProvider') return env.symbols;
                if (command === 'vscode.executeDocumentRenameProvider') return env.renameEdit;
                if (command === 'editor.action.rename') env.symbols = env.symbolsAfterRename ?? env.symbols;
                return undefined;
            },
            registerCommand: () => ({ dispose() { } }),
        },
        window: {
            get activeTextEditor() { return env.activeEditor; },
            showInformationMessage: async (message: string, ...items: unknown[]) => {
                env.prompts.push(message);
                return items.find(i => i === env.choice);
            },
            showWarningMessage: async (message: string) => { env.warnings.push(message); },
        },
        workspace: {
            textDocuments: [],
            openTextDocument: async (u: { fsPath: string }) => doc(u.fsPath),
            applyEdit: async (edit: any) => { env.appliedEdits.push(edit); return true; },
            fs: { stat: async (u: { fsPath: string }) => { if (!env.existing.has(u.fsPath)) throw new Error('missing'); return {}; } },
            onDidRenameFiles: () => ({ dispose() { } }),
        },
    };
}, { virtual: true });

import * as vscode from 'vscode';
import { renameSymbol, typeFollowsRenamedFiles } from '../../../../services/code/renameSync';
import { isOwnRename, ownRename } from '../../../../services/code/typeRename';

const symbol = (name: string, kind: number, line: number) => ({
    name, kind, children: [],
    selectionRange: new vscode.Range(new vscode.Position(line, 13), new vscode.Position(line, 13 + name.length)),
});
const renamed = (from: string, to: string) => [{ oldUri: vscode.Uri.file(from), newUri: vscode.Uri.file(to) }];
const editorAt = (fsPath: string, line: number, character: number, languageId = 'csharp') =>
    ({ document: { uri: vscode.Uri.file(fsPath), languageId }, selection: { active: new vscode.Position(line, character) } });

beforeEach(() => {
    Object.assign(env, { symbols: undefined, symbolsAfterRename: undefined, renameEdit: undefined, choice: undefined, prompts: [], warnings: [], commands: [], appliedEdits: [], saved: [], existing: new Set(), activeEditor: undefined });
});

describe('a file renamed in VS Code\'s Explorer', () => {
    const edit = () => {
        const e = new vscode.WorkspaceEdit();
        e.replace(vscode.Uri.file('/p/Bar.cs'), undefined as any, 'Bar');
        e.replace(vscode.Uri.file('/p/Program.cs'), undefined as any, 'Bar');
        return e;
    };

    it('offers to rename the type named after the old file name, looked up in the file at its new path', async () => {
        env.symbols = [symbol('Foo', vscode.SymbolKind.Class, 2)];
        env.renameEdit = edit();
        env.choice = 'Yes';

        await typeFollowsRenamedFiles(renamed('/p/Foo.cs', '/p/Bar.cs'));

        expect(env.prompts).toEqual(["Would you also like to rename the type 'Foo' to 'Bar' and all references to it?"]);
        expect(env.appliedEdits).toHaveLength(1);
        expect(env.saved.sort()).toEqual(['/p/Bar.cs', '/p/Program.cs']);
    });

    it('changes nothing when declined, and nothing for a file without such a type', async () => {
        env.symbols = [symbol('Foo', vscode.SymbolKind.Class, 2)];
        env.choice = 'No';
        await typeFollowsRenamedFiles(renamed('/p/Foo.cs', '/p/Bar.cs'));
        expect(env.appliedEdits).toEqual([]);

        env.prompts = [];
        env.symbols = [symbol('Other', vscode.SymbolKind.Class, 2)];
        await typeFollowsRenamedFiles(renamed('/p/Foo.cs', '/p/Bar.cs'));
        expect(env.prompts).toEqual([]);
    });

    it.each([
        ['a file that is only moved', '/p/Foo.cs', '/q/Foo.cs'],
        ['not a code file', '/p/Foo.json', '/p/Bar.json'],
        ['a new name that is no identifier', '/p/Foo.cs', '/p/My Foo.cs'],
    ])('does not ask for %s', async (_, from, to) => {
        env.symbols = [symbol('Foo', vscode.SymbolKind.Class, 2)];
        await typeFollowsRenamedFiles(renamed(from, to));
        expect(env.commands).toEqual([]);
    });

    it('leaves a rename of our own alone (the Solution Explorer asked before it)', async () => {
        env.symbols = [symbol('Foo', vscode.SymbolKind.Class, 2)];
        await ownRename('/p/Bar.cs', async () => undefined);
        expect(isOwnRename('/p/Bar.cs')).toBe(true);
        await typeFollowsRenamedFiles(renamed('/p/Foo.cs', '/p/Bar.cs'));
        expect(env.prompts).toEqual([]);
    });
});

describe('F2 on the type of a file named after it', () => {
    it('runs the rename, then offers the file the new name (and does not ask about it again)', async () => {
        env.activeEditor = editorAt('/p/Foo.cs', 2, 15);
        env.symbols = [symbol('Foo', vscode.SymbolKind.Class, 2)];
        env.symbolsAfterRename = [symbol('Order', vscode.SymbolKind.Class, 2)];
        env.choice = 'Yes';

        await renameSymbol();

        expect(env.commands).toContain('editor.action.rename');
        expect(env.prompts).toEqual(["Would you also like to rename the file 'Foo.cs' to 'Order.cs'?"]);
        expect(env.appliedEdits[0].operations).toEqual(['rename /p/Foo.cs -> /p/Order.cs']);
        expect(isOwnRename('/p/Order.cs')).toBe(true);
    });

    it('does nothing more when the rename was cancelled, or the file is not named after the type, or the cursor is elsewhere', async () => {
        env.activeEditor = editorAt('/p/Foo.cs', 2, 15);
        env.symbols = [symbol('Foo', vscode.SymbolKind.Class, 2)];
        await renameSymbol();
        expect(env.prompts).toEqual([]);

        env.activeEditor = editorAt('/p/Foo.cs', 5, 4);
        env.symbolsAfterRename = [symbol('Order', vscode.SymbolKind.Class, 2)];
        await renameSymbol();
        expect(env.prompts).toEqual([]);

        env.activeEditor = editorAt('/p/Other.cs', 2, 15);
        await renameSymbol();
        expect(env.prompts).toEqual([]);
        expect(env.commands.filter(c => c === 'editor.action.rename')).toHaveLength(3);
    });

    it('keeps the file name when a file with the new name exists already', async () => {
        env.activeEditor = editorAt('/p/Foo.cs', 2, 15);
        env.symbols = [symbol('Foo', vscode.SymbolKind.Class, 2)];
        env.symbolsAfterRename = [symbol('Order', vscode.SymbolKind.Class, 2)];
        env.existing.add('/p/Order.cs');

        await renameSymbol();

        expect(env.prompts).toEqual([]);
        expect(env.warnings).toEqual(["'Order.cs' exists already, so the file keeps the name 'Foo.cs'."]);
    });

    it('is the plain rename in a file that is not C#', async () => {
        env.activeEditor = editorAt('/p/Foo.vb', 2, 15, 'vb');
        await renameSymbol();
        expect(env.commands).toEqual(['editor.action.rename']);
    });
});
