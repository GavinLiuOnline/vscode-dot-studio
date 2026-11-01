import { advisoryAcrossVersions, advisoryBadges, passesAdvisoryFilter, worstSeverity } from '../../../../webview/nuget-view/advisoryView';

const high = { vulnerabilities: [{ severity: 'Low', url: 'a' }, { severity: 'High', url: 'b' }] };
const deprecated = { deprecation: { reasons: ['Legacy', 'CriticalBugs'], alternative: { id: 'Azure.Storage.Common' } } };

describe('advisory view helpers', () => {
    it('names the worst severity', () => {
        expect(worstSeverity(high)).toBe('High');
        expect(worstSeverity({ vulnerabilities: [{ severity: 'critical', url: 'a' }, { severity: 'High', url: 'b' }] })).toBe('Critical');
        expect(worstSeverity({ vulnerabilities: [{ severity: 'Weird', url: 'a' }] })).toBe('Weird');
        expect(worstSeverity(undefined)).toBeUndefined();
    });

    it('makes a badge for each kind, with the count and the replacement in the tooltip', () => {
        expect(advisoryBadges({ ...high, ...deprecated })).toEqual([
            { kind: 'vulnerable', text: 'vulnerable: high', title: '2 known vulnerabilities in this version' },
            { kind: 'deprecated', text: 'deprecated', title: 'Deprecated (Legacy, CriticalBugs); use Azure.Storage.Common instead' },
        ]);
        expect(advisoryBadges({ vulnerabilities: [{ severity: 'Low', url: 'a' }] })[0].title).toBe('1 known vulnerability in this version');
        expect(advisoryBadges(undefined)).toEqual([]);
    });

    it('filters: off shows all, on shows the flagged ones, both on shows either', () => {
        expect(passesAdvisoryFilter(undefined, { vulnerable: false, deprecated: false })).toBe(true);
        expect(passesAdvisoryFilter(undefined, { vulnerable: true, deprecated: false })).toBe(false);
        expect(passesAdvisoryFilter(high, { vulnerable: true, deprecated: false })).toBe(true);
        expect(passesAdvisoryFilter(high, { vulnerable: false, deprecated: true })).toBe(false);
        expect(passesAdvisoryFilter(deprecated, { vulnerable: true, deprecated: true })).toBe(true);
    });
});

describe('advisoryAcrossVersions', () => {
    const advisories = {
        'system.security.cryptography.pkcs|9.0.11': { vulnerabilities: [{ severity: 'High', url: 'https://github.com/advisories/x' }] },
        'system.security.cryptography.pkcs|10.0.14': {},
    };

    it('finds the vulnerable version when the list shows the newest one', () => {
        const advisory = advisoryAcrossVersions(advisories, 'System.Security.Cryptography.Pkcs', ['10.0.14', '9.0.11'], '10.0.14');
        expect(advisory?.vulnerabilities).toEqual([{ severity: 'High', url: 'https://github.com/advisories/x' }]);
        expect(advisory?.vulnerableVersions).toEqual(['9.0.11']);
    });

    it('is the plain advisory when only the shown version is in use', () => {
        expect(advisoryAcrossVersions(advisories, 'System.Security.Cryptography.Pkcs', ['9.0.11'], '9.0.11')).toBe(advisories['system.security.cryptography.pkcs|9.0.11']);
        expect(advisoryAcrossVersions(advisories, 'System.Security.Cryptography.Pkcs', undefined, '9.0.11')).toBe(advisories['system.security.cryptography.pkcs|9.0.11']);
    });

    it('is nothing for versions without advisories', () => {
        expect(advisoryAcrossVersions(advisories, 'Serilog', ['4.0.0'], '4.0.0')).toBeUndefined();
        expect(advisoryAcrossVersions(advisories, 'System.Security.Cryptography.Pkcs', ['10.0.14'], '10.0.14')).toEqual(advisories['system.security.cryptography.pkcs|10.0.14']);
    });

    it('joins the vulnerabilities of several vulnerable versions without repeating an advisory', () => {
        const both = { 'a|1.0.0': { vulnerabilities: [{ severity: 'High', url: 'u1' }] }, 'a|2.0.0': { vulnerabilities: [{ severity: 'High', url: 'u1' }, { severity: 'Low', url: 'u2' }] } };
        const advisory = advisoryAcrossVersions(both, 'A', ['1.0.0', '2.0.0'], '2.0.0');
        expect(advisory?.vulnerabilities?.map(v => v.url)).toEqual(['u1', 'u2']);
        expect([...(advisory?.vulnerableVersions ?? [])].sort()).toEqual(['1.0.0', '2.0.0']);
    });
});
