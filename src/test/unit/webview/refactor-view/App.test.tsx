import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../../../webview/refactor-view/App';
import { ExtractInterfaceForm, RefactorRequest } from '../../../../types/refactoring';

const form: ExtractInterfaceForm = {
    kind: 'extractInterface',
    typeName: 'Order',
    interfaceName: 'IOrder',
    members: [
        { id: 'Lines', kind: 'property', signature: 'IReadOnlyList<OrderLine> Lines { get; }' },
        { id: 'Add', kind: 'method', signature: 'void Add(string product);' },
    ],
};

function setup() {
    const sent: RefactorRequest[] = [];
    render(<App api={{ postMessage: request => sent.push(request) }} />);
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'form', title: 'x', form } })); });
    return sent;
}

describe('refactoring form: Extract Interface', () => {
    it('asks for the form when it opens', () => {
        const sent: RefactorRequest[] = [];
        render(<App api={{ postMessage: request => sent.push(request) }} />);
        expect(sent).toEqual([{ type: 'ready' }]);
    });

    it('lists every member checked, with the interface as a preview', () => {
        setup();
        expect(screen.getAllByRole('checkbox')).toHaveLength(2);
        screen.getAllByRole('checkbox').forEach(box => expect(box).toBeChecked());
        expect(screen.getByLabelText('Preview').textContent).toBe(
            'public interface IOrder\n{\n    IReadOnlyList<OrderLine> Lines { get; }\n    void Add(string product);\n}');
    });

    it('submits the name, the checked members and the target', () => {
        const sent = setup();
        fireEvent.click(screen.getByLabelText(/IReadOnlyList/));
        fireEvent.change(screen.getByLabelText('New interface name'), { target: { value: 'IBasket' } });
        fireEvent.click(screen.getByLabelText(/The same file/));
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'extractInterface', interfaceName: 'IBasket', memberIds: ['Add'], newFile: false } });
    });

    it('does not accept a name that is no identifier, or no member', () => {
        setup();
        fireEvent.change(screen.getByLabelText('New interface name'), { target: { value: '1Order' } });
        expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('New interface name'), { target: { value: 'IOrder' } });
        fireEvent.click(screen.getByRole('button', { name: 'Deselect All' }));
        expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();
    });

    it('cancels with Cancel and with ESC', () => {
        const sent = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(sent.filter(request => request.type === 'cancel')).toHaveLength(2);
    });
});
