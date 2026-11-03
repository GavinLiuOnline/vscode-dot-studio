import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../core/logger';
import { parseJsonc } from '../../core/jsonc';
import { SyntaxPalette, TokenKind } from '../../types/refactoring';

const log = logger('ThemeColors');

/** A TextMate rule of a colour theme (or of the user's `editor.tokenColorCustomizations`) */
export interface TokenRule { scope?: string | string[]; settings?: { foreground?: string } }

/** What a theme file holds of what we need: its TextMate rules and the semantic token colours */
export interface ThemeData { rules: TokenRule[]; semantic: Record<string, unknown> }

/** The semantic token type and the TextMate scopes (most specific first) of what the preview colours; the C# grammar's names */
const KINDS: Record<Exclude<TokenKind, 'plain'>, { semantic: string; scopes: string[] }> = {
    // the C# server colours every keyword (modifiers and built-in types too) with the semantic type `keyword`, which VS Code maps to the `keyword` scope
    keyword: { semantic: 'keyword', scopes: ['keyword.other', 'keyword'] },
    interface: { semantic: 'interface', scopes: ['entity.name.type.interface.cs', 'entity.name.type.interface', 'entity.name.type', 'support.type'] },
    class: { semantic: 'class', scopes: ['entity.name.type.class.cs', 'entity.name.type.class', 'entity.name.type', 'support.class'] },
    method: { semantic: 'method', scopes: ['entity.name.function.cs', 'entity.name.function', 'support.function'] },
    property: { semantic: 'property', scopes: ['variable.other.property.cs', 'variable.other.property', 'variable.other.object.property', 'variable.other', 'variable'] },
    parameter: { semantic: 'parameter', scopes: ['variable.parameter.cs', 'variable.parameter', 'variable'] },
};

const foregroundOf = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : typeof (value as { foreground?: unknown })?.foreground === 'string' ? (value as { foreground: string }).foreground : undefined;

/** The colour the rules give `scope`: the rule with the longest selector that is the scope or a prefix of it, the later rule on a tie */
export function colorOfScope(rules: readonly TokenRule[], scope: string): string | undefined {
    let best: { length: number; color: string } | undefined;
    for (const rule of rules) {
        const color = rule.settings?.foreground;
        if (!color) { continue; }
        const selectors = Array.isArray(rule.scope) ? rule.scope : (rule.scope ?? '').split(',');
        for (const raw of selectors) {
            const selector = raw.trim();
            // descendant selectors ("source.cs meta.x") are not worth a scope stack here
            if (!selector || /\s/.test(selector) || !(scope === selector || scope.startsWith(selector + '.'))) { continue; }
            if (!best || selector.length >= best.length) {
                best = { length: selector.length, color };
            }
        }
    }
    return best?.color;
}

/**
 * The palette of the preview from a theme: the semantic token colour when the theme sets one for the kind (the C# server
 * colours types and members semantically), else the colour of the first TextMate scope some rule matches.
 */
export function paletteFrom(theme: ThemeData): SyntaxPalette {
    const palette: SyntaxPalette = {};
    for (const [kind, { semantic, scopes }] of Object.entries(KINDS) as [keyof typeof KINDS, typeof KINDS[keyof typeof KINDS]][]) {
        let color = foregroundOf(theme.semantic[semantic]);
        for (let i = 0; !color && i < scopes.length; i++) {
            color = colorOfScope(theme.rules, scopes[i]);
        }
        if (color) {
            palette[kind] = color;
        }
    }
    return palette;
}

function readTheme(file: string, seen = new Set<string>()): ThemeData {
    const data: ThemeData = { rules: [], semantic: {} };
    if (seen.has(file) || !fs.existsSync(file)) { return data; }
    seen.add(file);
    const theme = parseJsonc(fs.readFileSync(file, 'utf8')).value as { include?: string; tokenColors?: unknown; semanticTokenColors?: Record<string, unknown> } | undefined;
    if (!theme) { return data; }
    // an included theme comes first: this one's rules win
    const included = typeof theme.include === 'string' ? readTheme(path.resolve(path.dirname(file), theme.include), seen) : data;
    return {
        rules: [...included.rules, ...(Array.isArray(theme.tokenColors) ? theme.tokenColors as TokenRule[] : [])],
        semantic: { ...included.semantic, ...(theme.semanticTokenColors ?? {}) },
    };
}

/** The colours of the colour theme that is active, with the user's token colour settings on top; undefined when the theme cannot be read */
export function activeSyntaxPalette(): SyntaxPalette | undefined {
    try {
        const name = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme');
        if (!name) { return undefined; }
        for (const extension of vscode.extensions.all) {
            const themes = (extension.packageJSON?.contributes?.themes ?? []) as { id?: string; label?: string; path: string }[];
            const found = themes.find(theme => theme.id === name || theme.label === name);
            if (found) {
                const data = readTheme(path.join(extension.extensionPath, found.path));
                const customizations = vscode.workspace.getConfiguration('editor').get<{ textMateRules?: TokenRule[]; [theme: string]: unknown }>('tokenColorCustomizations');
                const forTheme = customizations?.[`[${name}]`] as { textMateRules?: TokenRule[] } | undefined;
                data.rules.push(...(customizations?.textMateRules ?? []), ...(forTheme?.textMateRules ?? []));
                const palette = paletteFrom(data);
                log.debug(`Colour theme ${name} (${found.path}): ${JSON.stringify(palette)}`);
                return Object.keys(palette).length > 0 ? palette : undefined;
            }
        }
    } catch {
        // an unreadable theme: the fallback colours
    }
    return undefined;
}
