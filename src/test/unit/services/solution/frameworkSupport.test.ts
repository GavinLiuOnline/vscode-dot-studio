jest.mock('vscode', () => ({ workspace: { workspaceFolders: [] }, window: {}, commands: {}, env: {}, Uri: {} }), { virtual: true });

import { SolutionService } from '../../../../services/solution/solutionService';

describe('SolutionService.isFrameworkSupported', () => {
    it('is true for .NET 5 and later, also with a platform', () => {
        for (const framework of ['net5.0', 'net8.0', 'net9.0', 'net10.0', 'net11.0', 'net8.0-windows', 'net10.0-android']) {
            expect(SolutionService.isFrameworkSupported(framework)).toBe(true);
        }
    });

    it('is false for .NET Framework, .NET Standard and .NET Core', () => {
        for (const framework of ['net48', 'net472', 'net471', 'net461', 'netstandard2.0', 'netstandard2.1', 'netcoreapp3.1', 'net40']) {
            expect(SolutionService.isFrameworkSupported(framework)).toBe(false);
        }
    });
});
