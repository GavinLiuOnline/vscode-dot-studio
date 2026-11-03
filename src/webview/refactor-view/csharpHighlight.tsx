import React from 'react';
import { SyntaxPalette, TokenKind } from '../../types/refactoring';

export interface Token { text: string; kind: TokenKind }

const KEYWORDS = new Set([
    'public', 'private', 'protected', 'internal', 'partial', 'record', 'readonly', 'override', 'abstract', 'sealed', 'virtual', 'const', 'interface', 'void', 'get', 'set', 'init', 'event', 'this', 'ref', 'out', 'in', 'params', 'where', 'new', 'class', 'struct',
    'string', 'int', 'long', 'short', 'byte', 'bool', 'char', 'decimal', 'double', 'float', 'object', 'uint', 'ulong', 'ushort', 'sbyte', 'dynamic', 'var',
    'null', 'true', 'false', 'async', 'static', 'default',
]);

/**
 * Colours the C# of an interface signature (what Extract Interface previews): keywords, types, members, parameters.
 * It reads the shape of these few lines, not C# in general; a webview cannot ask for the theme's token colours, so the extension
 * reads them (themeColors.ts) and sends a palette; the theme's symbol icon colours are the fallback.
 */
export function tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    const word = /[A-Za-z_][A-Za-z0-9_]*|\s+|[^\sA-Za-z_]/g;
    const pieces = text.match(word) ?? [];
    let after: 'interface' | 'class' | undefined;
    for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        if (!/^[A-Za-z_]/.test(piece)) {
            tokens.push({ text: piece, kind: 'plain' });
            continue;
        }
        const next = pieces.slice(i + 1).find(candidate => !/^\s+$/.test(candidate));
        const previous = [...tokens].reverse().find(token => token.kind !== 'plain' || !/^\s+$/.test(token.text));
        let kind: TokenKind;
        if (KEYWORDS.has(piece)) {
            kind = 'keyword';
        } else if (after) {
            kind = after;
        } else if (next === '(') {
            kind = 'method';
        } else if (next === '{' || next === ';') {
            // `Type Name {` / `event Type Name;`: the name has a type before it, a type has a name after it
            kind = previous && previous.kind !== 'plain' || previous?.text === '>' ? 'property' : 'class';
        } else if (/^I[A-Z]/.test(piece)) {
            kind = 'interface';
        } else if (/^[A-Z]/.test(piece)) {
            kind = 'class';
        } else {
            kind = 'parameter';
        }
        after = piece === 'interface' ? 'interface' : piece === 'class' || piece === 'struct' || piece === 'record' ? 'class' : undefined;
        tokens.push({ text: piece, kind });
    }
    return tokens;
}

const FALLBACK: SyntaxPalette = {
    keyword: 'var(--vscode-symbolIcon-keywordForeground, #569cd6)',
    interface: 'var(--vscode-symbolIcon-interfaceForeground, #4ec9b0)',
    class: 'var(--vscode-symbolIcon-classForeground, #4ec9b0)',
    method: 'var(--vscode-symbolIcon-methodForeground, #dcdcaa)',
    property: 'var(--vscode-symbolIcon-propertyForeground, #9cdcfe)',
    parameter: 'var(--vscode-symbolIcon-variableForeground, #9cdcfe)',
};

/** `palette` is the editor theme's colours as the extension read them; without it the theme's symbol icon colours stand in */
export const Highlighted: React.FC<{ code: string; palette?: SyntaxPalette }> = ({ code, palette }) => (
    <>{tokenize(code).map((token, index) => token.kind === 'plain' ? token.text
        : <span key={index} data-kind={token.kind} style={{ color: (palette ?? FALLBACK)[token.kind] }}>{token.text}</span>)}</>
);
