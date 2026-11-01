import { foldTransitiveIntoInstalled } from '../../../../services/nuget/transitiveFold';

type Row = { id: string; currentVersion: string; versionsInUse?: string[]; projectVersions?: Record<string, string[]> };

describe('foldTransitiveIntoInstalled', () => {
    const installed: Row[] = [
        { id: 'System.Security.Cryptography.Pkcs', currentVersion: '10.0.14', versionsInUse: ['10.0.14'] },
        { id: 'Serilog', currentVersion: '4.0.0', versionsInUse: ['4.0.0'] },
    ];
    const transitive: Row[] = [
        { id: 'system.security.cryptography.pkcs', currentVersion: '9.0.11', versionsInUse: ['9.0.11', '9.0.4'], projectVersions: { '/a.csproj': ['9.0.11'], '/b.csproj': ['9.0.4'] } },
        { id: 'Newtonsoft.Json.Bson', currentVersion: '1.0.3', versionsInUse: ['1.0.3'], projectVersions: { '/a.csproj': ['1.0.3'] } },
    ];

    it('lists a package some project references itself once, as top-level, with the versions the others get', () => {
        const result = foldTransitiveIntoInstalled(installed, transitive);
        expect(result.transitive.map(entry => entry.id)).toEqual(['Newtonsoft.Json.Bson']);
        const pkcs = result.installed.find(entry => entry.id === 'System.Security.Cryptography.Pkcs')!;
        expect(pkcs.currentVersion).toBe('10.0.14');
        expect([...pkcs.versionsInUse!].sort()).toEqual(['10.0.14', '9.0.11', '9.0.4']);
        expect(pkcs.projectVersions).toEqual({ '/a.csproj': ['9.0.11'], '/b.csproj': ['9.0.4'] });
    });

    it('leaves a package nobody references itself, and the packages with nothing transitive, as they were', () => {
        const result = foldTransitiveIntoInstalled(installed, transitive);
        expect(result.transitive[0]).toBe(transitive[1]);
        expect(result.installed.find(entry => entry.id === 'Serilog')).toBe(installed[1]);
    });

    it('does not change its input', () => {
        const before = JSON.stringify([installed, transitive]);
        foldTransitiveIntoInstalled(installed, transitive);
        expect(JSON.stringify([installed, transitive])).toBe(before);
    });
});
