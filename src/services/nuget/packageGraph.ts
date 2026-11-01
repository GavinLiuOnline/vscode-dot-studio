import * as fs from 'fs';
import * as path from 'path';
import { VersionUtils } from '../shared/versionUtils';

/** The packages a project uses for one framework, as restore resolved them (`obj/project.assets.json`) */
export interface PackageGraph {
    readonly framework: string;
    /** Packages the project references itself */
    readonly direct: string[];
    /** By lower-case package id: its id, resolved version and the ids of the packages it depends on */
    readonly packages: Map<string, { readonly id: string; readonly version: string; readonly dependencies: string[] }>;
    /** The projects this one references, with the ids they depend on: packages only they bring in are transitive here too */
    readonly projectReferences?: { readonly id: string; readonly dependencies: string[] }[];
}

export interface ResolvedPackage {
    readonly id: string;
    readonly version: string;
}

/** The framework name a target is keyed by for an alias: `net471` is `.NETFramework,Version=v4.7.1` (.NET Core 3.1 and older, .NET Standard and .NET Framework use the long name) */
export function targetNameOfAlias(alias: string): string | undefined {
    const framework = /^net(4\d{1,2})$/i.exec(alias);
    if (framework) {
        return `.NETFramework,Version=v${framework[1].split('').join('.')}`;
    }
    const standard = /^netstandard(\d+\.\d+)$/i.exec(alias);
    if (standard) {
        return `.NETStandard,Version=v${standard[1]}`;
    }
    const core = /^netcoreapp(\d+\.\d+)$/i.exec(alias);
    return core ? `.NETCoreApp,Version=v${core[1]}` : undefined;
}

/**
 * The key of the framework's target in project.assets.json: its alias (current SDKs, `net10.0`), else its long name
 * (`.NETFramework,Version=v4.7.1`: how the older frameworks are keyed, in an order of their own, not the order of the
 * project's frameworks), else the one target left over once the other frameworks took theirs
 */
function targetKeyOf(alias: string, frameworks: string[], targetKeys: string[]): string {
    if (targetKeys.includes(alias)) {
        return alias;
    }
    const long = targetNameOfAlias(alias);
    if (long && targetKeys.includes(long)) {
        return long;
    }
    const left = targetKeys.filter(key => !frameworks.includes(key) && !frameworks.some(other => targetNameOfAlias(other) === key));
    const unmatched = frameworks.filter(other => !targetKeys.includes(other) && !(targetNameOfAlias(other) && targetKeys.includes(targetNameOfAlias(other)!)));
    return left[Math.max(0, unmatched.indexOf(alias))] ?? targetKeys[Math.max(0, frameworks.indexOf(alias))];
}

/**
 * Reads the package graph of a framework from project.assets.json; the first framework when none is
 * given or the project doesn't target it. Runtime-specific graphs (`net10.0/linux-x64`) are left out.
 */
export function parsePackageGraph(assetsJson: string, framework?: string): PackageGraph | undefined {
    let assets: any;
    try {
        assets = JSON.parse(assetsJson);
    } catch {
        return undefined;
    }
    const frameworks = Object.keys(assets?.project?.frameworks ?? {});
    const targetKeys = Object.keys(assets?.targets ?? {}).filter(key => !key.includes('/'));
    if (targetKeys.length === 0) {
        return undefined;
    }
    const alias = framework && frameworks.includes(framework) ? framework : frameworks[0];
    const targetKey = targetKeyOf(alias, frameworks, targetKeys);

    const packages: PackageGraph['packages'] = new Map();
    const projectReferences: NonNullable<PackageGraph['projectReferences']> = [];
    for (const [key, entry] of Object.entries<any>(assets.targets[targetKey] ?? {})) {
        const slash = key.lastIndexOf('/');
        const id = key.slice(0, slash);
        if (entry?.type === 'project') {
            projectReferences.push({ id, dependencies: Object.keys(entry.dependencies ?? {}) });
        } else if (entry?.type === 'package') {
            packages.set(id.toLowerCase(), { id, version: key.slice(slash + 1), dependencies: Object.keys(entry.dependencies ?? {}) });
        }
    }

    return {
        framework: alias ?? targetKey,
        direct: Object.keys(assets.project?.frameworks?.[alias]?.dependencies ?? {}),
        packages,
        projectReferences,
    };
}

/** The graphs of all the frameworks a project targets (a package may exist for one of them only) */
export function parsePackageGraphs(assetsJson: string): PackageGraph[] {
    let aliases: string[];
    try {
        aliases = Object.keys(JSON.parse(assetsJson)?.project?.frameworks ?? {});
    } catch {
        return [];
    }
    return aliases.flatMap(alias => parsePackageGraph(assetsJson, alias) ?? []);
}

/** The packages a package depends on, with the versions restore picked */
export function packageDependencies(graph: PackageGraph, id: string): ResolvedPackage[] {
    return (graph.packages.get(id.toLowerCase())?.dependencies ?? []).flatMap(dependency => {
        const resolved = graph.packages.get(dependency.toLowerCase());
        return resolved ? [{ id: resolved.id, version: resolved.version }] : [];
    });
}

/**
 * Visual Studio's "Transitively referenced by": for every package the project doesn't reference itself
 * (by lower-case id), the direct references that bring it in
 */
export function transitiveReferrers(graph: PackageGraph): Map<string, string[]> {
    const directIds = new Set(graph.direct.map(id => id.toLowerCase()));
    const referrers = new Map<string, string[]>();
    for (const direct of graph.direct) {
        const seen = new Set<string>();
        const visit = (id: string) => {
            for (const dependency of graph.packages.get(id.toLowerCase())?.dependencies ?? []) {
                const key = dependency.toLowerCase();
                if (seen.has(key) || !graph.packages.has(key)) {
                    continue;
                }
                seen.add(key);
                if (!directIds.has(key)) {
                    referrers.set(key, [...(referrers.get(key) ?? []), direct]);
                }
                visit(key);
            }
        };
        visit(direct);
    }
    // Packages that only a referenced project brings in: "Transitively referenced by" the project, as in Visual Studio
    for (const project of graph.projectReferences ?? []) {
        const label = `${project.id} (project)`;
        const seen = new Set<string>();
        const visit = (id: string) => {
            for (const dependency of graph.packages.get(id.toLowerCase())?.dependencies ?? []) {
                const key = dependency.toLowerCase();
                if (seen.has(key) || !graph.packages.has(key)) {
                    continue;
                }
                seen.add(key);
                if (!directIds.has(key)) {
                    referrers.set(key, [...(referrers.get(key) ?? []), label]);
                }
                visit(key);
            }
        };
        for (const dependency of project.dependencies) {
            const key = dependency.toLowerCase();
            if (graph.packages.has(key) && !seen.has(key)) {
                seen.add(key);
                if (!directIds.has(key)) {
                    referrers.set(key, [...(referrers.get(key) ?? []), label]);
                }
                visit(key);
            }
        }
    }
    return referrers;
}

const cache = new Map<string, { mtime: number; graph: PackageGraph | undefined }>();

/** The package graph of a project after its last restore; undefined before the first one */
export function readPackageGraph(projectPath: string, framework?: string): PackageGraph | undefined {
    const assetsPath = path.join(path.dirname(projectPath), 'obj', 'project.assets.json');
    let mtime: number;
    try {
        mtime = fs.statSync(assetsPath).mtimeMs;
    } catch {
        return undefined;
    }
    const key = `${projectPath}|${framework ?? ''}`;
    const cached = cache.get(key);
    if (cached?.mtime === mtime) {
        return cached.graph;
    }
    const graph = parsePackageGraph(fs.readFileSync(assetsPath, 'utf8'), framework);
    cache.set(key, { mtime, graph });
    return graph;
}

const graphsCache = new Map<string, { mtime: number; graphs: PackageGraph[] }>();

/** The package graphs of every framework of a project after its last restore; none before the first one */
export function readPackageGraphs(projectPath: string): PackageGraph[] {
    const assetsPath = path.join(path.dirname(projectPath), 'obj', 'project.assets.json');
    let mtime: number;
    try {
        mtime = fs.statSync(assetsPath).mtimeMs;
    } catch {
        return [];
    }
    const cached = graphsCache.get(projectPath);
    if (cached?.mtime === mtime) {
        return cached.graphs;
    }
    const graphs = parsePackageGraphs(fs.readFileSync(assetsPath, 'utf8'));
    graphsCache.set(projectPath, { mtime, graphs });
    return graphs;
}

export interface TransitivePackage<P> {
    readonly id: string;
    /** The highest version restore resolved across the projects */
    readonly currentVersion: string;
    /** Every version restore resolved across the projects and frameworks (an older one may be the vulnerable one) */
    readonly versionsInUse: string[];
    /** Projects that get the package through others */
    readonly projects: P[];
    /** The top-level packages that bring it in; with the project's name when there are several projects */
    readonly transitiveReferencedBy: string[];
}

/**
 * The NuGet manager's "Transitive packages", like Visual Studio's: packages the projects only get through
 * other packages, sorted by id. A package that any project references itself is a top-level package instead.
 */
export function collectTransitivePackages<P>(projects: readonly { project: P & { name: string }; graph: PackageGraph }[]): TransitivePackage<P>[] {
    const direct = new Set(projects.flatMap(({ graph }) => graph.direct.map(id => id.toLowerCase())));
    // The same project once per framework: only different projects need their name in "referenced by"
    const severalProjects = new Set(projects.map(entry => entry.project)).size > 1;
    const byId = new Map<string, { id: string; currentVersion: string; versionsInUse: string[]; projects: P[]; transitiveReferencedBy: string[] }>();
    for (const { project, graph } of projects) {
        for (const [key, referrers] of transitiveReferrers(graph)) {
            if (direct.has(key)) {
                continue;
            }
            const resolved = graph.packages.get(key)!;
            const entry = byId.get(key) ?? { id: resolved.id, currentVersion: resolved.version, versionsInUse: [], projects: [], transitiveReferencedBy: [] };
            if (!entry.versionsInUse.includes(resolved.version)) {
                entry.versionsInUse.push(resolved.version);
            }
            if (VersionUtils.compare(resolved.version, entry.currentVersion) < 0) {
                entry.currentVersion = resolved.version;
            }
            // One entry per project and framework: a project and a referrer count once
            if (!entry.projects.includes(project)) {
                entry.projects.push(project);
            }
            for (const referrer of referrers.map(name => severalProjects ? `${name} (${project.name})` : name)) {
                if (!entry.transitiveReferencedBy.includes(referrer)) {
                    entry.transitiveReferencedBy.push(referrer);
                }
            }
            byId.set(key, entry);
        }
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
