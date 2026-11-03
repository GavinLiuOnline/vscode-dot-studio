jest.mock('vscode', () => ({}), { virtual: true });
import { colorOfScope, paletteFrom } from '../../../../services/refactoring/themeColors';

const rules = [
    { scope: ['storage.type', 'storage.modifier'], settings: { foreground: '#111111' } },
    { scope: 'keyword', settings: { foreground: '#569cd6' } },
    { scope: 'entity.name.type', settings: { foreground: '#4ec9b0' } },
    { scope: 'entity.name.type.interface', settings: { foreground: '#b8d7a3' } },
    { scope: 'entity.name.function, support.function', settings: { foreground: '#dcdcaa' } },
    { scope: 'variable', settings: { foreground: '#9cdcfe' } },
];

describe('colours of a theme for the preview', () => {
    it('takes the rule with the longest selector that is a prefix of the scope', () => {
        expect(colorOfScope(rules, 'entity.name.type.interface.cs')).toBe('#b8d7a3');
        expect(colorOfScope(rules, 'entity.name.type.class.cs')).toBe('#4ec9b0');
        expect(colorOfScope(rules, 'entity.name.function.cs')).toBe('#dcdcaa');
        expect(colorOfScope(rules, 'entity.name.typewriter')).toBeUndefined();
    });

    it('lets the later rule win on equal selectors and ignores descendant selectors', () => {
        expect(colorOfScope([
            { scope: 'variable', settings: { foreground: '#111' } },
            { scope: 'source.cs variable', settings: { foreground: '#222' } },
            { scope: 'variable', settings: { foreground: '#333' } },
        ], 'variable.other.property.cs')).toBe('#333');
    });

    it('builds the palette, the semantic colour first', () => {
        const palette = paletteFrom({ rules, semantic: { class: '#ff0000', property: { foreground: '#00ff00', italic: true } } });
        expect(palette).toEqual({
            keyword: '#569cd6', interface: '#b8d7a3', class: '#ff0000', method: '#dcdcaa', property: '#00ff00', parameter: '#9cdcfe',
        });
    });

    it('leaves out a kind the theme does not colour', () => {
        expect(paletteFrom({ rules: [], semantic: {} })).toEqual({});
    });
});
