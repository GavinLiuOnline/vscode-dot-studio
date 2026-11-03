import { tokenize } from '../../../../webview/refactor-view/csharpHighlight';

const kinds = (code: string) => tokenize(code).filter(token => token.kind !== 'plain').map(token => `${token.kind}:${token.text}`);

describe('C# highlighting of the interface preview', () => {
    it('colours the interface line', () => {
        expect(kinds('public interface IOrder')).toEqual(['keyword:public', 'keyword:interface', 'interface:IOrder']);
    });

    it('tells a property from its type', () => {
        expect(kinds('IReadOnlyList<OrderLine> Lines { get; }')).toEqual(['interface:IReadOnlyList', 'class:OrderLine', 'property:Lines', 'keyword:get']);
        expect(kinds('decimal Total { get; set; }')).toEqual(['keyword:decimal', 'property:Total', 'keyword:get', 'keyword:set']);
    });

    it('colours methods, their parameter types and names', () => {
        expect(kinds('void Add(string product, Money price);')).toEqual(['keyword:void', 'method:Add', 'keyword:string', 'parameter:product', 'class:Money', 'parameter:price']);
    });

    it('colours events and indexers', () => {
        expect(kinds('event EventHandler Changed;')).toEqual(['keyword:event', 'class:EventHandler', 'property:Changed']);
    });

    it('keeps every character', () => {
        const code = 'public interface IOrder\n{\n    void Add(string product);\n}';
        expect(tokenize(code).map(token => token.text).join('')).toBe(code);
    });
});
