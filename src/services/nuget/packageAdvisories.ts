import * as path from 'path';
import { cliFailureReason, execDotnet } from './dotnetCli';
import { advisoryKey, PackageAdvisories, PackageAdvisory, PackageSource, upgradeNuGetOrgUrl } from './types';
import { logger } from '../../core/logger';

const log = logger('PackageAdvisories');

interface ListedPackage {
    id?: string;
    resolvedVersion?: string;
    vulnerabilities?: { severity?: string; advisoryurl?: string }[];
    deprecationReasons?: string[];
    alternativePackage?: { id?: string; versionRange?: string };
}

/** The packages (top-level and transitive, of every project and framework) in the JSON of `dotnet list package` */
function listedPackages(json: string): ListedPackage[] {
    try {
        const data = JSON.parse(json);
        return (data.projects ?? []).flatMap((project: any) => (project.frameworks ?? []).flatMap((framework: any) =>
            [...(framework.topLevelPackages ?? []), ...(framework.transitivePackages ?? [])]));
    } catch {
        return [];
    }
}

/**
 * The vulnerabilities and deprecations `dotnet list package --vulnerable --format json` and `--deprecated --format json`
 * report, by package version. Both lists may be empty or unreadable.
 */
export function parseAdvisories(vulnerableJson: string, deprecatedJson: string): PackageAdvisories {
    const result: Record<string, PackageAdvisory> = {};
    const entry = (listed: ListedPackage) => (listed.id && listed.resolvedVersion ? advisoryKey(listed.id, listed.resolvedVersion) : undefined);

    for (const listed of listedPackages(vulnerableJson)) {
        const key = entry(listed);
        if (key && listed.vulnerabilities?.length) {
            const known = result[key]?.vulnerabilities ?? [];
            const added = listed.vulnerabilities
                .filter(vulnerability => vulnerability.advisoryurl && !known.some(existing => existing.url === vulnerability.advisoryurl))
                .map(vulnerability => ({ severity: vulnerability.severity ?? 'Unknown', url: vulnerability.advisoryurl! }));
            result[key] = { ...result[key], vulnerabilities: [...known, ...added] };
        }
    }
    for (const listed of listedPackages(deprecatedJson)) {
        const key = entry(listed);
        if (key && listed.deprecationReasons?.length) {
            result[key] = {
                ...result[key],
                deprecation: {
                    reasons: listed.deprecationReasons,
                    alternative: listed.alternativePackage?.id ? { id: listed.alternativePackage.id, range: listed.alternativePackage.versionRange } : undefined,
                },
            };
        }
    }
    return result;
}

/** Joins the advisories of several projects */
export function mergeAdvisories(all: readonly PackageAdvisories[]): PackageAdvisories {
    const merged: Record<string, PackageAdvisory> = {};
    for (const advisories of all) {
        for (const [key, advisory] of Object.entries(advisories)) {
            const known = merged[key]?.vulnerabilities ?? [];
            const vulnerabilities = [...known, ...(advisory.vulnerabilities ?? []).filter(v => !known.some(existing => existing.url === v.url))];
            merged[key] = { ...merged[key], ...advisory, ...(vulnerabilities.length ? { vulnerabilities } : {}) };
        }
    }
    return merged;
}

const NUGET_ORG_V3 = 'https://api.nuget.org/v3/index.json';

/**
 * `dotnet list package --vulnerable` reads the vulnerability data from the feeds' V3 service index; a V2 URL of nuget.org
 * (`https://www.nuget.org/api/v2/`, still in many NuGet.Config files) has none, and the command then answers "no vulnerable
 * packages" for everything. With such a source and no V3 nuget.org beside it, ask nuget.org's V3 feed for the data.
 */
export function advisorySourceArgs(sources: readonly PackageSource[]): string[] {
    const enabled = sources.filter(source => source.enabled && !source.isLocal);
    const hasV3 = enabled.some(source => source.url.toLowerCase().includes('api.nuget.org/v3'));
    const hasV2 = enabled.some(source => /nuget\.org/i.test(source.url) && upgradeNuGetOrgUrl(source.url) !== source.url);
    return hasV2 && !hasV3 ? ['--source', NUGET_ORG_V3] : [];
}

/**
 * Runs the two lists for a project or a whole solution, from the last restore (`--no-restore`: no restore of its own, which took
 * long and touched `obj/`; the answer needs the feeds' vulnerability data). `complete` is false when a list failed, so that its
 * emptiness is not taken for "no vulnerabilities".
 */
export async function readTargetAdvisories(target: string, sourceArgs: readonly string[] = [], timeout = 120000): Promise<{ advisories: PackageAdvisories; complete: boolean }> {
    let complete = true;
    const list = async (flag: string): Promise<string> => {
        try {
            // `--source` only for the vulnerable list: deprecation data comes from the configured feeds as before
            const extra = flag === '--vulnerable' ? sourceArgs : [];
            return (await execDotnet(['list', target, 'package', flag, '--include-transitive', '--no-restore', '--format', 'json', ...extra], { timeout })).stdout;
        } catch (error) {
            // The reason from the CLI's output ("Failed to fetch results from V2 feed at ..."): the exception only says "Command failed"
            log.warn(`dotnet list package ${flag} failed for ${path.basename(target)}: ${cliFailureReason(error)}`);
            complete = false;
            return '';
        }
    };
    const [vulnerable, deprecated] = await Promise.all([list('--vulnerable'), list('--deprecated')]);
    return { advisories: parseAdvisories(vulnerable, deprecated), complete };
}

/** Runs the two lists for a project (a restore must have happened; the answer needs the feeds' vulnerability data) */
export async function readProjectAdvisories(projectPath: string, sourceArgs: readonly string[] = []): Promise<PackageAdvisories> {
    return (await readTargetAdvisories(projectPath, sourceArgs)).advisories;
}
