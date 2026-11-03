import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../core/logger';
import { Settings } from '../shared/settings';
import { nugetConfigFiles } from './nugetCredentials';
import { isInWorkspace } from './feedAuth';
import { t } from '../../core/i18n';

const log = logger('NuGetV3Offer');
const DECLINED_KEY = 'shinobi.nugetV3Migration.declined';
export const NUGET_ORG_V3 = 'https://api.nuget.org/v3/index.json';

/**
 * Whether the address is one of nuget.org's old ones: the V2 feed (`https://www.nuget.org/api/v2/`), or an address that looks like
 * V3 but is not the service index (`https://www.nuget.org/api/v3/`, which NuGet takes for a V2 feed and asks for `FindPackagesById()`)
 */
export function isLegacyNuGetOrgUrl(url: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(url.trim());
    } catch {
        return false;
    }
    if (!/^(www\.|api\.)?nuget\.org$/i.test(parsed.hostname) || /\/v3\/index\.json$/i.test(parsed.pathname)) {
        return false;
    }
    return /^\/(api\/v[23]|v[23])\/?$/i.test(parsed.pathname) || parsed.pathname === '/';
}

/** The text with every comment replaced by spaces (line breaks stay), so offsets still fit the file */
const withoutComments = (content: string) => content.replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ' '));

/** The sources of a NuGet.Config that list nuget.org by an old address: their names and addresses */
export function legacyNuGetOrgSources(content: string): { name: string; url: string }[] {
    const found: { name: string; url: string }[] = [];
    for (const match of withoutComments(content).matchAll(/<add\b[^>]*>/gi)) {
        const key = /\bkey\s*=\s*"([^"]*)"/i.exec(match[0])?.[1];
        const value = /\bvalue\s*=\s*"([^"]*)"/i.exec(match[0])?.[1];
        if (key !== undefined && value !== undefined && isLegacyNuGetOrgUrl(value) && inPackageSources(content, match.index)) {
            found.push({ name: key, url: value });
        }
    }
    return found;
}

/** Whether the offset lies inside <packageSources> (an <add> of another section may have a nuget.org value that is not a source) */
function inPackageSources(content: string, offset: number): boolean {
    const masked = withoutComments(content);
    const open = masked.lastIndexOf('<packageSources', offset);
    const close = masked.indexOf('</packageSources>', open < 0 ? 0 : open);
    return open >= 0 && close > offset;
}

/** The NuGet.Config with the old nuget.org addresses of its sources replaced by the V3 service index; everything else stays as it was */
export function upgradeNuGetOrgSources(content: string): string {
    const masked = withoutComments(content);
    let result = content;
    const edits: { start: number; end: number }[] = [];
    for (const match of masked.matchAll(/<add\b[^>]*>/gi)) {
        const value = /\bvalue\s*=\s*"([^"]*)"/i.exec(match[0]);
        if (value && isLegacyNuGetOrgUrl(value[1]) && inPackageSources(content, match.index)) {
            const start = match.index + value.index + value[0].indexOf('"') + 1;
            edits.push({ start, end: start + value[1].length });
        }
    }
    for (const edit of edits.reverse()) {
        result = result.slice(0, edit.start) + NUGET_ORG_V3 + result.slice(edit.end);
    }
    return result;
}

/** Where "Don't Ask Again" is remembered: per workspace, per solution folder */
export class NuGetV3Offer {
    private static state: vscode.Memento | undefined;

    static initialize(state: vscode.Memento): void {
        this.state = state;
    }

    static isDeclined(solutionDir: string): boolean {
        return (this.state?.get<string[]>(DECLINED_KEY, []) ?? []).includes(solutionDir);
    }

    static async decline(solutionDir: string): Promise<void> {
        await this.state?.update(DECLINED_KEY, [...(this.state.get<string[]>(DECLINED_KEY, []) ?? []), solutionDir]);
    }
}

export interface NuGetV3OfferDeps {
    ask(message: string, ...buttons: string[]): Promise<string | undefined>;
    /** The NuGet.Config files NuGet reads for the folder, and whether each lies in the workspace or a git checkout (a user config does not) */
    configFiles(solutionDir: string): { file: string; editable: boolean }[];
}

const vscodeDeps: NuGetV3OfferDeps = {
    ask: (message, ...buttons) => Promise.resolve(vscode.window.showInformationMessage(message, ...buttons)),
    configFiles: solutionDir => nugetConfigFiles(solutionDir).map(file => ({ file, editable: isInWorkspace(file) })),
};

/**
 * Offers to change nuget.org's old address in the NuGet.Config files of the solution (not the user's) to the V3 service index. The
 * V2 address has no vulnerability data (`dotnet list package --vulnerable`, NuGet Audit and the NuGet manager find none), and an
 * address like `.../api/v3/` is taken for a V2 feed and fails.
 */
export async function offerNuGetV3Migration(solutionPath: string, deps: NuGetV3OfferDeps = vscodeDeps): Promise<void> {
    const solutionDir = path.dirname(solutionPath);
    if (!Settings.offerNuGetV3Migration() || NuGetV3Offer.isDeclined(solutionDir)) {
        return;
    }
    const candidates = deps.configFiles(solutionDir).filter(({ file, editable }) => {
        if (!editable) {
            return false;
        }
        try {
            return legacyNuGetOrgSources(fs.readFileSync(file, 'utf8')).length > 0;
        } catch {
            return false;
        }
    }).map(({ file }) => file);
    if (candidates.length === 0) {
        return;
    }

    const update = 'Update';
    const notNow = 'Not Now';
    const never = "Don't Ask Again";
    const names = candidates.map(file => path.relative(solutionDir, file) || path.basename(file)).join(', ');
    const choice = await deps.ask(
        `${names} lists nuget.org by an old address. Package vulnerabilities (the NuGet manager, \`dotnet list package --vulnerable\`, NuGet Audit) come from the V3 feed only, `
        + `and an address like https://www.nuget.org/api/v3/ is taken for a V2 feed and fails. Change it to ${NUGET_ORG_V3}?`,
        update, notNow, never);
    if (choice === never) {
        await NuGetV3Offer.decline(solutionDir);
        return;
    }
    if (choice !== update) {
        return;
    }
    try {
        for (const file of candidates) {
            fs.writeFileSync(file, upgradeNuGetOrgSources(fs.readFileSync(file, 'utf8')));
        }
        log.info(`nuget.org changed to the V3 address in ${names}`);
        vscode.window.showInformationMessage(t('nuget.org now uses the V3 address in {0}.', names));
    } catch (error) {
        log.error('Changing the NuGet.Config failed:', error);
        vscode.window.showErrorMessage(t('Could not change the NuGet.Config: {0}', error instanceof Error ? error.message : error));
    }
}
