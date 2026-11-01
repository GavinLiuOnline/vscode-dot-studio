import * as path from 'path';
import { logger } from '../../core/logger';

const log = logger('ProjectContext');

export interface ContextProject {
    readonly name: string;
    readonly projectPath: string;
    readonly frameworks: readonly string[];
}

/** The project a file belongs to: the one with the deepest folder around it */
export function projectOfFile(filePath: string, projects: readonly ContextProject[]): ContextProject | undefined {
    let best: { project: ContextProject; length: number } | undefined;
    for (const project of projects) {
        const dir = path.dirname(project.projectPath) + path.sep;
        if (filePath.startsWith(dir) && (!best || dir.length > best.length)) {
            best = { project, length: dir.length };
        }
    }
    return best?.project;
}

/**
 * The C# extension's context for a file of a project that targets several frameworks: `{ projectName, tfm }` for its
 * `csharp.changeProjectContext` command, which then switches the file's language context (what `#if` regions, diagnostics and
 * IntelliSense go by) without asking. Undefined when the project has one framework, or does not target the chosen one.
 */
export function contextFor(filePath: string, framework: string | undefined, projects: readonly ContextProject[]): { projectName: string; tfm: string } | undefined {
    if (!framework) {
        return undefined;
    }
    const project = projectOfFile(filePath, projects);
    if (!project || project.frameworks.length < 2 || !project.frameworks.includes(framework)) {
        return undefined;
    }
    return { projectName: project.name, tfm: framework };
}

export interface ContextDocument {
    readonly languageId: string;
    readonly uri: { readonly scheme: string; readonly fsPath: string };
}

/**
 * Switches the language context of the open C# files of the projects that target the framework. The C# extension keeps the context
 * per file in memory and starts every file on its first framework, so this runs for the open files when the framework is chosen
 * and again as editors become active (the language server may not have been ready the first time). A file the extension does not
 * know the context for is left alone.
 */
export async function applyFrameworkContext(
    documents: readonly ContextDocument[], framework: string | undefined, projects: readonly ContextProject[],
    run: (command: string, ...args: unknown[]) => PromiseLike<unknown>
): Promise<void> {
    for (const document of documents) {
        if (document.languageId !== 'csharp' || document.uri.scheme !== 'file') {
            continue;
        }
        const context = contextFor(document.uri.fsPath, framework, projects);
        if (!context) {
            continue;
        }
        try {
            await run('csharp.changeProjectContext', document, context);
        } catch (error) {
            // Another C# extension, or none: the file keeps its context
            log.debug(`Could not switch the context of ${path.basename(document.uri.fsPath)}: ${error instanceof Error ? error.message : error}`);
        }
    }
}
