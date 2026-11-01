import { useEffect, useState } from "react";
import { ensureArray, LocalNuGetPackage, sendToBackend } from "../shared";
import { UICmd } from "../../../types/commands/ui";
import { Checkbox } from "vscrui";
import { logger } from "../../shared/logger";
import { advisoryKey, PackageAdvisories, ProjectInfo as BackendProjectInfo } from "../../../services/nuget/types";
import { versionLabel } from "../versionLabels";

const log = logger('ProjectList');

interface ProjectListProps {
    selectedPackage: LocalNuGetPackage;
    projects?: BackendProjectInfo[];
    selectedProjects: Set<string>;
    setSelectedProjects: (projects: Set<string>) => void;
    initializing?: boolean;
    projectPath?: string | null; // For project-specific context
    /** The transitive packages: a project that does not install the package itself shows the version it gets through others */
    transitivePackages?: LocalNuGetPackage[];
    /** The vulnerabilities by package version: a project's vulnerable version is marked */
    advisories?: PackageAdvisories;
}

export default function ProjectList({
    selectedPackage,
    projects,
    selectedProjects,
    setSelectedProjects,
    initializing = false,
    projectPath,
    transitivePackages,
    advisories
}: ProjectListProps) {

    // How a project gets the package through others (the hover over its version): asked when the mouse comes, answered once
    const [paths, setPaths] = useState<Record<string, { framework: string; hops: string[] }[]>>({});
    // The hovered project and where its version is on the screen (the box is fixed to the window: nothing clips it)
    const [hovered, setHovered] = useState<{ path: string; rect: DOMRect } | undefined>(undefined);
    useEffect(() => {
        const listener = (event: MessageEvent<UICmd>) => {
            if (event.data.type === 'dependencyPaths') {
                const { projectPath: path, packageId, paths: found } = event.data.payload;
                setPaths(current => ({ ...current, [`${path}|${packageId.toLowerCase()}`]: found }));
            }
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, []);
    const hover = (projectPath: string | undefined, rect?: DOMRect) => {
        setHovered(projectPath && rect ? { path: projectPath, rect } : undefined);
        const key = projectPath && `${projectPath}|${selectedPackage.id.toLowerCase()}`;
        if (projectPath && key && !paths[key]) {
            sendToBackend({ type: 'getDependencyPaths', payload: { projectPath, packageId: selectedPackage.id } });
        }
    };
    /** A version with the vulnerabilities it has, marked: the colour of an error, bold, and the severity in the tooltip */
    const versionText = (version: string, text: string) => {
        const vulnerabilities = advisories?.[advisoryKey(selectedPackage.id, version)]?.vulnerabilities;
        return vulnerabilities?.length
            ? <span key={version} style={{ color: 'var(--vscode-errorForeground)', fontWeight: 600 }}
                title={`Known vulnerabilities: ${[...new Set(vulnerabilities.map(v => v.severity))].join(', ')}`} aria-label={`${text}, vulnerable`}>{text}</span>
            : <span key={version}>{text}</span>;
    };

    const transitiveVersionsOf = (project: BackendProjectInfo): string[] | undefined => {
        if (project.packages?.some(pkg => pkg.id.toLowerCase() === selectedPackage.id.toLowerCase())) {
            return undefined;
        }
        return [selectedPackage, ...(transitivePackages ?? [])]
            .find(pkg => pkg.id.toLowerCase() === selectedPackage.id.toLowerCase() && pkg.projectVersions?.[project.path])
            ?.projectVersions?.[project.path];
    };
    const isTransitiveIn = (project: BackendProjectInfo) => !!transitiveVersionsOf(project);

    // Auto-select projects based on context
    useEffect(() => {
        if (projects && projects.length > 0) {
            // If there's only one project, always auto-select it
            if (projects.length === 1 && !selectedProjects.has(projects[0].path)) {
                log.debug('Auto-selecting single project:', projects[0].name);
                setSelectedProjects(new Set([projects[0].path]));
            }
            // If opening from project context, auto-select the current project
            else if (projectPath) {
                const currentProject = projects.find(p => p.path === projectPath);
                if (currentProject && !selectedProjects.has(currentProject.path)) {
                    log.debug('Auto-selecting current project:', currentProject.name);
                    setSelectedProjects(new Set([currentProject.path]));
                }
            }
        }
    }, [projectPath, projects, selectedProjects, setSelectedProjects]);

    return (
        <div style={{
            background: 'var(--vscode-panel-background)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '4px',
            padding: '8px 16px',
            marginBottom: '16px'
        }}>
            {/* Get all available projects from the solution */}
            {(() => {
                // Use projects directly - no need to transform since they already have all needed info
                const projectList = ensureArray(projects);

                return projectList.map((project, idx) => (
                    <div key={idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 0',
                        borderBottom: idx < projectList.length - 1
                            ? '1px solid var(--vscode-panel-border)'
                            : 'none'
                    }}>
                        {projectList.length > 1 && (
                            <Checkbox
                                checked={selectedProjects.has(project.path)}
                                disabled={initializing || (projectPath === project.path)}
                                onChange={() => {
                                    if (!initializing && projectPath !== project.path) {
                                        const newSelected = new Set(selectedProjects);
                                        if (newSelected.has(project.path)) {
                                            newSelected.delete(project.path);
                                        } else {
                                            newSelected.add(project.path);
                                        }
                                        setSelectedProjects(newSelected);
                                    }
                                }}
                            />
                        )}
                        <div style={{
                            marginLeft: projectList.length > 1 ? '8px' : '0px',
                            flex: 1,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontSize: '13px' }}>
                                {project.name}
                            </div>
                            <div style={{
                                fontSize: '11px',
                                color: 'var(--vscode-descriptionForeground)',
                                marginLeft: '8px',
                                flexShrink: 0,
                                position: 'relative'
                            }}
                                onMouseEnter={e => isTransitiveIn(project) && hover(project.path, e.currentTarget.getBoundingClientRect())}
                                onMouseLeave={() => hover(undefined)}>
                                {hovered?.path === project.path && isTransitiveIn(project) && (
                                    <DependencyPaths project={project.name} anchor={hovered.rect} paths={paths[`${project.path}|${selectedPackage.id.toLowerCase()}`]} />
                                )}
                                {(() => {
                                    const installedPackage = project.packages?.find(pkg => pkg.id.toLowerCase() === selectedPackage.id.toLowerCase());
                                    if (installedPackage) {
                                        return versionText((installedPackage as { version?: string }).version ?? installedPackage.currentVersion, versionLabel(installedPackage));
                                    }
                                    const transitive = transitiveVersionsOf(project);
                                    return transitive
                                        ? <>{transitive.map((version, index) => <span key={version}>{index > 0 ? ', ' : ''}{versionText(version, version)}</span>)} (transitive)</>
                                        : 'Not installed';
                                })()}
                            </div>
                        </div>
                    </div>
                ));
            })()}
        </div>
    );
}
/** The box over a project's version: every hop from what the project references down to the package, per framework */
function DependencyPaths({ project, anchor, paths }: { project: string; anchor: DOMRect; paths: { framework: string; hops: string[] }[] | undefined }) {
    // Fixed to the window: right edge at the version's, above it, as wide as its lines need but never wider than the window
    const right = Math.max(8, window.innerWidth - anchor.right);
    return (
        <div role="tooltip" style={{
            position: 'fixed', right, bottom: window.innerHeight - anchor.top + 4, zIndex: 10, width: 'max-content',
            maxWidth: `calc(100vw - ${right + 8}px)`, boxSizing: 'border-box', padding: '6px 10px',
            background: 'var(--vscode-editorHoverWidget-background)', color: 'var(--vscode-editorHoverWidget-foreground)',
            border: '1px solid var(--vscode-editorHoverWidget-border)', boxShadow: '0 2px 8px var(--vscode-widget-shadow)', fontSize: '12px'
        }}>
            {!paths && 'Loading...'}
            {paths && paths.length === 0 && 'Not found in the last restore.'}
            {paths?.map((path, index) => (
                <div key={index} style={{ marginBottom: index < paths.length - 1 ? '6px' : 0 }}>
                    <div style={{ opacity: 0.7 }}>{path.framework}</div>
                    {[project, ...path.hops].map((hop, depth) => (
                        // One line per hop, the version stays with its package; only a hop longer than the window is cut
                        <div key={depth} title={hop} style={{ paddingLeft: `${depth * 12}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{depth > 0 ? '\u21B3 ' : ''}{hop}</div>
                    ))}
                </div>
            ))}
        </div>
    );
}
