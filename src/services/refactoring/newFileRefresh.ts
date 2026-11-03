import * as fs from 'fs';
import * as path from 'path';

const PROJECT_FILE = /\.(cs|vb|fs)proj$/i;

/** The project file of the folder `file` is in or the nearest folder above it */
export function projectFileOf(file: string): string | undefined {
    for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
        const found = fs.readdirSync(dir).find(name => PROJECT_FILE.test(name));
        if (found) {
            return path.join(dir, found);
        }
        if (dir === path.dirname(dir)) {
            return undefined;
        }
    }
}

/**
 * The C# language server does not see a file that is created in a project with several target frameworks (`<TargetFrameworks>`):
 * the files that use it keep CS0246 ("type could not be found") and navigation fails until the window is reloaded
 * (probed over LSP with the server of muhammad-sammy.csharp 2.160.9; a single-framework project picks the file up). A change of the
 * project file makes it read the project again, so a refactoring that creates a file touches the project file's time stamp.
 * Returns whether it did.
 */
export function refreshProjectForNewFile(file: string): boolean {
    try {
        const project = projectFileOf(file);
        if (!project || !/<TargetFrameworks[\s>]/i.test(fs.readFileSync(project, 'utf8'))) {
            return false;
        }
        const now = new Date();
        fs.utimesSync(project, now, now);
        return true;
    } catch {
        return false;
    }
}
