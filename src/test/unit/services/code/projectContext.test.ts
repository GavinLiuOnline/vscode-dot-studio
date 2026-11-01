import * as path from 'path';
import { applyFrameworkContext, contextFor, projectOfFile } from '../../../../services/code/projectContext';

const p = (...parts: string[]) => path.join(path.resolve('/repo'), ...parts);
const projects = [
    { name: 'Lib', projectPath: p('Lib', 'Lib.csproj'), frameworks: ['net472', 'net10.0'] },
    { name: 'Lib.Tests', projectPath: p('Lib', 'Tests', 'Lib.Tests.csproj'), frameworks: ['net10.0'] },
    { name: 'Web', projectPath: p('Web', 'Web.csproj'), frameworks: ['net10.0', 'net8.0'] },
];
const doc = (file: string, languageId = 'csharp', scheme = 'file') => ({ languageId, uri: { scheme, fsPath: file } });

describe('projectOfFile', () => {
    it('is the project with the deepest folder around the file', () => {
        expect(projectOfFile(p('Lib', 'Tests', 'A.cs'), projects)?.name).toBe('Lib.Tests');
        expect(projectOfFile(p('Lib', 'Models', 'A.cs'), projects)?.name).toBe('Lib');
        expect(projectOfFile(p('Other', 'A.cs'), projects)).toBeUndefined();
        // A folder that only starts with the same letters is not inside it
        expect(projectOfFile(p('LibX', 'A.cs'), projects)).toBeUndefined();
    });
});

describe('contextFor', () => {
    it('names the project and framework for a file of a project that targets several and the chosen one', () => {
        expect(contextFor(p('Lib', 'A.cs'), 'net472', projects)).toEqual({ projectName: 'Lib', tfm: 'net472' });
    });

    it('is nothing for Auto, a project with one framework or one that does not target the choice', () => {
        expect(contextFor(p('Lib', 'A.cs'), undefined, projects)).toBeUndefined();
        expect(contextFor(p('Lib', 'Tests', 'A.cs'), 'net10.0', projects)).toBeUndefined();
        expect(contextFor(p('Web', 'A.cs'), 'net472', projects)).toBeUndefined();
        expect(contextFor(p('Other', 'A.cs'), 'net10.0', projects)).toBeUndefined();
    });
});

describe('applyFrameworkContext', () => {
    it('asks the C# extension to switch the context of each open C# file that has one to switch', async () => {
        const run = jest.fn().mockResolvedValue(undefined);
        const lib = doc(p('Lib', 'A.cs'));
        const web = doc(p('Web', 'B.cs'));
        await applyFrameworkContext([lib, web, doc(p('Lib', 'Tests', 'C.cs')), doc(p('Lib', 'readme.md'), 'markdown'), doc(p('Lib', 'D.cs'), 'csharp', 'untitled')], 'net10.0', projects, run);
        expect(run.mock.calls).toEqual([
            ['csharp.changeProjectContext', lib, { projectName: 'Lib', tfm: 'net10.0' }],
            ['csharp.changeProjectContext', web, { projectName: 'Web', tfm: 'net10.0' }],
        ]);
    });

    it('does nothing for Auto', async () => {
        const run = jest.fn();
        await applyFrameworkContext([doc(p('Lib', 'A.cs'))], undefined, projects, run);
        expect(run).not.toHaveBeenCalled();
    });

    it('goes on when the command is missing or fails', async () => {
        const run = jest.fn().mockRejectedValue(new Error("command 'csharp.changeProjectContext' not found"));
        await expect(applyFrameworkContext([doc(p('Lib', 'A.cs')), doc(p('Web', 'B.cs'))], 'net10.0', projects, run)).resolves.toBeUndefined();
        expect(run).toHaveBeenCalledTimes(2);
    });
});
