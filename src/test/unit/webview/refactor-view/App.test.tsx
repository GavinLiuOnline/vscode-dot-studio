import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../../../webview/refactor-view/App';
import { ExtractInterfaceForm, ExtractPartialForm, RefactorForm, RefactorRequest } from '../../../../types/refactoring';

const form: ExtractInterfaceForm = {
    kind: 'extractInterface',
    typeName: 'Order',
    interfaceName: 'IOrder',
    members: [
        { id: 'Lines', kind: 'property', signature: 'IReadOnlyList<OrderLine> Lines { get; }' },
        { id: 'Add', kind: 'method', signature: 'void Add(string product);' },
    ],
};

function setup(shown: RefactorForm = form) {
    const sent: RefactorRequest[] = [];
    render(<App api={{ postMessage: request => sent.push(request) }} />);
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'form', title: 'x', form: shown } })); });
    return sent;
}

const partial: ExtractPartialForm = {
    kind: 'extractPartial',
    typeName: 'Order',
    partName: 'Part',
    members: [
        { id: '0:AA', kind: 'field', signature: 'private readonly List<OrderLine> _lines' },
        { id: '1:BB', kind: 'method', signature: 'public void Add(string product)' },
        { id: '2:CC', kind: 'constructor', signature: 'public Order()' },
    ],
};

describe('refactoring form: Extract Interface', () => {
    it('asks for the form when it opens', () => {
        const sent: RefactorRequest[] = [];
        render(<App api={{ postMessage: request => sent.push(request) }} />);
        expect(sent).toEqual([{ type: 'ready' }]);
    });

    it('lists every member checked, with the interface as a preview', () => {
        setup();
        // the members, and the option to use the interface in place of the type (off)
        const members = within(screen.getByRole('group', { name: 'Members' })).getAllByRole('checkbox');
        expect(members).toHaveLength(2);
        members.forEach(box => expect(box).toBeChecked());
        expect(screen.getByRole('checkbox', { name: /Use IOrder instead of Order where possible/ })).not.toBeChecked();
        expect(screen.getByLabelText('Preview').textContent).toBe(
            'public interface IOrder\n{\n    IReadOnlyList<OrderLine> Lines { get; }\n    void Add(string product);\n}');
    });

    it('submits the name, the checked members and the target', () => {
        const sent = setup();
        fireEvent.click(screen.getByLabelText(/IReadOnlyList/));
        fireEvent.change(screen.getByLabelText('Interface name'), { target: { value: 'IBasket' } });
        fireEvent.click(screen.getByLabelText(/The same file/));
        fireEvent.click(screen.getByRole('button', { name: 'Extract' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'extractInterface', interfaceName: 'IBasket', memberIds: ['Add'], newFile: false } });
    });

    it('does not accept a name that is no identifier, or no member', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Interface name'), { target: { value: '1Order' } });
        expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Interface name'), { target: { value: 'IOrder' } });
        fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }));
        expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled();
    });

    it('cancels with Cancel and with ESC', () => {
        const sent = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(sent.filter(request => request.type === 'cancel')).toHaveLength(2);
    });
});

describe('refactoring form: Extract Members to Partial', () => {
    it('shows the file the part goes to, all members checked with their kind, and the folded preview', () => {
        setup(partial);
        expect(screen.getByText('Order.Part.cs')).toBeTruthy();
        expect(screen.getAllByRole('checkbox')).toHaveLength(3);
        expect(screen.getByText('constructor')).toBeTruthy();
        expect(screen.getByLabelText('Preview').textContent).toBe(
            'partial class Order\n{\n    private readonly List<OrderLine> _lines;\n    public void Add(string product) { ... }\n    public Order() { ... }\n}');
    });

    it('submits the name of the part and the checked members', () => {
        const sent = setup(partial);
        fireEvent.click(screen.getByLabelText(/_lines/));
        fireEvent.change(screen.getByLabelText('Name of the part'), { target: { value: 'Lines' } });
        expect(screen.getByText('Order.Lines.cs')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Move' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'extractPartial', partName: 'Lines', memberIds: ['1:BB', '2:CC'] } });
    });

    it('needs a member and a name that is an identifier', () => {
        setup(partial);
        fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }));
        expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
        fireEvent.change(screen.getByLabelText('Name of the part'), { target: { value: 'a b' } });
        expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    });
});
