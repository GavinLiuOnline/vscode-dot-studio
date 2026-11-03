import { advisoryKey, PackageAdvisories, PackageAdvisory } from '../../services/nuget/types';
import { t } from '../shared/i18n';

const SEVERITIES = ['Critical', 'High', 'Moderate', 'Low'] as const;

/** The worst severity of the vulnerabilities (Critical, High, Moderate, Low), as NuGet names them */
export function worstSeverity(advisory: PackageAdvisory | undefined): string | undefined {
    const found = (advisory?.vulnerabilities ?? []).map(vulnerability => vulnerability.severity);
    if (found.length === 0) {
        return undefined;
    }
    return SEVERITIES.find(severity => found.some(value => value.toLowerCase() === severity.toLowerCase())) ?? found[0];
}

export interface AdvisoryBadge {
    readonly kind: 'vulnerable' | 'deprecated';
    readonly text: string;
    readonly title: string;
}

/** The small labels a row shows for a package: vulnerable (with the worst severity) and deprecated */
export function advisoryBadges(advisory: PackageAdvisory | undefined): AdvisoryBadge[] {
    const badges: AdvisoryBadge[] = [];
    const severity = worstSeverity(advisory);
    if (advisory?.vulnerabilities?.length && severity) {
        const count = advisory.vulnerabilities.length;
        badges.push({
            kind: 'vulnerable',
            text: t('vulnerable: {0}', severity.toLowerCase()),
            title: count === 1
                ? t('{0} known vulnerability in this version', count)
                : t('{0} known vulnerabilities in this version', count),
        });
    }
    if (advisory?.deprecation) {
        const alternative = advisory.deprecation.alternative;
        badges.push({
            kind: 'deprecated',
            text: t('deprecated'),
            title: t('Deprecated ({0})', advisory.deprecation.reasons.join(', ')) + (alternative ? t('; use {0} instead', alternative.id) : ''),
        });
    }
    return badges;
}

/** Whether a package passes the "Vulnerable" and "Deprecated" filters (both off: everything; both on: either) */
export function passesAdvisoryFilter(advisory: PackageAdvisory | undefined, filter: { vulnerable: boolean; deprecated: boolean }): boolean {
    if (!filter.vulnerable && !filter.deprecated) {
        return true;
    }
    return (filter.vulnerable && !!advisory?.vulnerabilities?.length) || (filter.deprecated && !!advisory?.deprecation);
}

/**
 * The advisory of a package that the projects may use in several versions: the list shows one version, but a vulnerable older
 * one still counts (the projects that use it are affected). The vulnerabilities of all the versions in use, with the vulnerable
 * versions named when they are not just the shown one; the deprecation is the same for every version.
 */
export function advisoryAcrossVersions(advisories: PackageAdvisories, id: string, versionsInUse: readonly string[] | undefined, shown: string): PackageAdvisory | undefined {
    const versions = [...new Set([shown, ...(versionsInUse ?? [])].filter(Boolean))];
    const found = versions.flatMap(version => {
        const advisory = advisories[advisoryKey(id, version)];
        return advisory ? [{ version, advisory }] : [];
    });
    if (found.length === 0) {
        return undefined;
    }
    if (found.length === 1 && found[0].version === shown && versions.length <= 1) {
        return found[0].advisory;
    }
    const vulnerable = found.filter(entry => entry.advisory.vulnerabilities?.length);
    const vulnerabilities = vulnerable.flatMap(entry => entry.advisory.vulnerabilities ?? [])
        .filter((vulnerability, index, all) => all.findIndex(other => other.url === vulnerability.url) === index);
    const deprecation = found.find(entry => entry.advisory.deprecation)?.advisory.deprecation;
    return {
        ...(vulnerabilities.length ? { vulnerabilities, vulnerableVersions: vulnerable.map(entry => entry.version) } : {}),
        ...(deprecation ? { deprecation } : {}),
    };
}
