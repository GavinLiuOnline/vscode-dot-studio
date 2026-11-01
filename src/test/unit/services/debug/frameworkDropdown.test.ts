jest.mock('vscode', () => ({}), { virtual: true });
const mockUpdate = jest.fn();
jest.mock('../../../../services/debug/debugConfigService', () => ({ DebugConfigService: { updateStartupConfiguration: (...args: unknown[]) => mockUpdate(...args) } }));
jest.mock('../../../../services/solution/solutionService', () => ({
    SolutionService: {
        getAllFrameworks: () => [], isFrameworkSupported: (framework: string) => !framework.startsWith('net4'),
        getFrameworkDisplayName: (framework: string) => framework,
    },
}));
const mockChoice = jest.fn();
jest.mock('../../../../services/project/frameworkChoice', () => ({ FrameworkChoice: { set: (...args: unknown[]) => mockChoice(...args) } }));

import { FrameworkDropdownService } from '../../../../services/debug/frameworkDropdownService';

describe('FrameworkDropdownService', () => {
    const projects = new Map<string, { frameworks: string[] }>([
        ['/s/Web/Web.csproj', { frameworks: ['net10.0'] }],
        ['/s/Lib/Lib.csproj', { frameworks: ['net472', 'net10.0', 'net8.0'] }],
    ]);
    const service = (startup = '/s/Web/Web.csproj') => {
        const result = new FrameworkDropdownService();
        result.setSolution({ projects, getStartupProject: () => startup, solutionPath: '/s/App.sln', solutionFile: undefined, getActiveFramework: () => null } as never);
        return result;
    };
    beforeEach(() => { mockUpdate.mockReset(); mockChoice.mockReset(); });

    it('lists the frameworks of every project, not only of the startup project', () => {
        expect(service().getFrameworkOptions().map(option => option.label)).toEqual(['Auto', 'net10.0', 'net8.0', 'net472']);
    });

    it('remembers the choice for the solution, and F5 follows when the startup project targets it', async () => {
        await service().setActiveFramework('net10.0');
        expect(mockChoice).toHaveBeenCalledWith('/s/App.sln', 'net10.0');
        expect(mockUpdate).toHaveBeenCalledWith('/s/Web/Web.csproj', 'net10.0');
    });

    it('leaves the startup project alone when it does not target the framework', async () => {
        await service().setActiveFramework('net472');
        expect(mockChoice).toHaveBeenCalledWith('/s/App.sln', 'net472');
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('Auto forgets the choice and lets the startup project pick', async () => {
        await service().setActiveFramework(undefined);
        expect(mockChoice).toHaveBeenCalledWith('/s/App.sln', undefined);
        expect(mockUpdate).toHaveBeenCalledWith('/s/Web/Web.csproj', undefined);
    });
});
