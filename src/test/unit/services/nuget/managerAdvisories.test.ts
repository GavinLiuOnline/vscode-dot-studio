jest.mock('vscode', () => ({ workspace: { workspaceFolders: [] }, window: {}, commands: {}, env: {} }), { virtual: true });
const mockRead = jest.fn();
const whole = (advisories: unknown, complete = true) => ({ advisories, complete });
jest.mock('../../../../services/nuget/packageAdvisories', () => ({
    ...jest.requireActual('../../../../services/nuget/packageAdvisories'),
    readTargetAdvisories: (...args: unknown[]) => mockRead(...args),
}));
const mockUnloaded = jest.fn();
jest.mock('../../../../services/solution/unloadedProjects', () => ({ UnloadedProjects: { isUnloaded: (...args: unknown[]) => mockUnloaded(...args) } }));
jest.mock('../../../../services/solution/solutionService', () => ({
    SolutionService: { getActiveSolution: () => ({ solutionPath: '/w/App.sln', projects: new Map([['/w/A.csproj', {}], ['/w/B.csproj', {}], ['/w/C.csproj', {}]]) }) },
}));

import { NuGetManagerService } from '../../../../services/nuget/nugetManagerService';
import { PackageBrowseService } from '../../../../services/nuget/packageBrowseService';

describe('NuGetManagerService.getAdvisories', () => {
    const solution = { type: 'solution' as const, target: '/w/App.sln' };
    const perTarget = async (target: string) => whole({ [`${target}|1`]: { deprecation: { reasons: ['Legacy'] } } });

    beforeEach(() => {
        (NuGetManagerService as any).advisoryCache.clear();
        (NuGetManagerService as any).advisoryRuns.clear();
        jest.spyOn(PackageBrowseService, 'getPackageSources').mockResolvedValue([{ name: 'nuget.org', url: 'https://www.nuget.org/api/v2/', enabled: true, isLocal: false }]);
        mockRead.mockReset().mockImplementation(perTarget);
        mockUnloaded.mockReset().mockImplementation((_solution: string, project: string) => project === '/w/B.csproj');
    });

    it('reads the solution in one go and hands it the V3 nuget.org source when the config only has the V2 URL', async () => {
        const advisories = await NuGetManagerService.getAdvisories(solution);
        expect(Object.keys(advisories)).toEqual(['/w/App.sln|1']);
        expect(mockRead).toHaveBeenCalledTimes(1);
        expect(mockRead.mock.calls[0].slice(0, 2)).toEqual(['/w/App.sln', ['--source', 'https://api.nuget.org/v3/index.json']]);
    });

    it('reads the loaded projects one by one when the solution as a whole fails, and joins them', async () => {
        mockRead.mockImplementation(async (target: string) => target === '/w/App.sln' ? whole({}, false) : perTarget(target));
        const advisories = await NuGetManagerService.getAdvisories(solution);
        expect(Object.keys(advisories).sort()).toEqual(['/w/A.csproj|1', '/w/C.csproj|1']);
        expect(mockRead.mock.calls.map(call => call[0]).sort()).toEqual(['/w/A.csproj', '/w/App.sln', '/w/C.csproj']);
    });

    it('reads one project for a project manager', async () => {
        expect(Object.keys(await NuGetManagerService.getAdvisories({ type: 'project', target: '/w/A.csproj' }))).toEqual(['/w/A.csproj|1']);
        expect(mockRead).toHaveBeenCalledTimes(1);
    });

    it('one read at a time per manager: asking while it runs gets the same answer', async () => {
        let finish: () => void = () => { };
        mockRead.mockImplementation(() => new Promise(resolve => { finish = () => resolve(whole({ 'a|1': {} })); }));
        const first = NuGetManagerService.getAdvisories(solution);
        const second = NuGetManagerService.getAdvisories(solution);
        await new Promise(resolve => setTimeout(resolve, 10));
        finish();
        expect(await first).toBe(await second);
        expect(mockRead).toHaveBeenCalledTimes(1);
    });

    it('keeps the last complete answer for the next manager, and a failed read does not replace it', async () => {
        expect(NuGetManagerService.getCachedAdvisories(solution)).toBeUndefined();
        const good = await NuGetManagerService.getAdvisories(solution);
        expect(NuGetManagerService.getCachedAdvisories(solution)).toBe(good);

        // The network is gone: both the whole and the single reads fail
        mockRead.mockImplementation(async () => whole({}, false));
        const again = await NuGetManagerService.getAdvisories(solution);
        expect(again).toBe(good);
        expect(NuGetManagerService.getCachedAdvisories(solution)).toBe(good);
    });
});
