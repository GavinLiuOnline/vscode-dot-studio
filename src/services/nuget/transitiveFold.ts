interface Folded {
    readonly id: string;
    /** Every version the projects use (the list shows one) */
    readonly versionsInUse?: string[];
    /** The version(s) each project gets through other packages, by project path */
    readonly projectVersions?: Record<string, string[]>;
}

const union = (a: readonly string[] = [], b: readonly string[] = []) => [...new Set([...a, ...b])];

/**
 * A package some project references itself is a top-level package of the solution; listing it once more under Transitive packages
 * only because other projects get it through others shows it twice. Its entry there is folded into the top-level one instead: the
 * versions in use (so a vulnerable older one still flags it) and what version each of those projects gets (the project list shows
 * it as transitive). What no project references itself stays in the transitive list.
 */
export function foldTransitiveIntoInstalled<I extends Folded, T extends Folded>(installed: readonly I[], transitive: readonly T[]): { installed: I[]; transitive: T[] } {
    const byId = new Map(transitive.map(entry => [entry.id.toLowerCase(), entry] as const));
    const folded = installed.map(entry => {
        const through = byId.get(entry.id.toLowerCase());
        if (!through) {
            return entry;
        }
        const projectVersions: Record<string, string[]> = { ...entry.projectVersions };
        for (const [project, versions] of Object.entries(through.projectVersions ?? {})) {
            projectVersions[project] = union(projectVersions[project], versions);
        }
        return { ...entry, versionsInUse: union(entry.versionsInUse, through.versionsInUse), projectVersions };
    });
    const installedIds = new Set(installed.map(entry => entry.id.toLowerCase()));
    return { installed: folded, transitive: transitive.filter(entry => !installedIds.has(entry.id.toLowerCase())) };
}
