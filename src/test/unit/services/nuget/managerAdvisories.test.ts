jest.mock('vscode', () => ({ workspace: { workspaceFolders: [] }, window: {}, commands: {}, env: {} }), { virtual: true });
const mockRead = jest.fn();
jest.mock('../../../../services/nuget/packageAdvisories', () => ({
    ...jest.requireActual('../../../../services/nuget/packageAdvisories'),
    readProjectAdvisories: (...args: unknown[]) => mockRead(...args),
}));
const mockUnloaded = jest.fn();
jest.mock('../../../../services/solution/unloadedProjects', () => ({ UnloadedProjects: { isUnloaded: (...args: unknown[]) => mockUnloaded(...args) } }));
jest.mock('../../../../services/solution/solutionService', () => ({
    SolutionService: { getActiveSolution: () => ({ solutionPath: '/w/App.sln', projects: new Map([['/w/A.csproj', {}], ['/w/B.csproj', {}], ['/w/C.csproj', {}]]) }) },
}));

import { NuGetManagerService } from '../../../../services/nuget/nugetManagerService';
import { PackageBrowseService } from '../../../../services/nuget/packageBrowseService';

describe('NuGetManagerService.getAdvisories', () => {
    beforeEach(() => {
        jest.spyOn(PackageBrowseService, 'getPackageSources').mockResolvedValue([{ name: 'nuget.org', url: 'https://www.nuget.org/api/v2/', enabled: true, isLocal: false }]);
        mockRead.mockReset().mockImplementation(async (project: string) => ({ [`${project}|1`]: { deprecation: { reasons: ['Legacy'] } } }));
        mockUnloaded.mockReset().mockImplementation((_solution: string, project: string) => project === '/w/B.csproj');
    });

    it('hands the V3 nuget.org source to every read when the config only has the V2 URL', async () => {
        await NuGetManagerService.getAdvisories({ type: 'solution', target: '/w/App.sln' });
        expect(mockRead.mock.calls.map(call => call[1])).toEqual([['--source', 'https://api.nuget.org/v3/index.json'], ['--source', 'https://api.nuget.org/v3/index.json']]);
    });

    it('reads one project for a project manager', async () => {
        expect(Object.keys(await NuGetManagerService.getAdvisories({ type: 'project', target: '/w/A.csproj' }))).toEqual(['/w/A.csproj|1']);
        expect(mockRead).toHaveBeenCalledTimes(1);
    });

    it('reads every loaded project for the solution manager and joins them', async () => {
        const advisories = await NuGetManagerService.getAdvisories({ type: 'solution', target: '/w/App.sln' });
        expect(Object.keys(advisories).sort()).toEqual(['/w/A.csproj|1', '/w/C.csproj|1']);
        expect(mockRead.mock.calls.map(call => call[0]).sort()).toEqual(['/w/A.csproj', '/w/C.csproj']);
    });
});
