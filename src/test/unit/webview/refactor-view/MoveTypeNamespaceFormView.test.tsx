import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../../../webview/refactor-view/App';
import { MoveTypeNamespaceForm, RefactorRequest } from '../../../../types/refactoring';

const form: MoveTypeNamespaceForm = { kind: 'moveTypeNamespace', typeName: 'Order', namespace: 'Shop.Old', namespaces: ['Shop.Old', 'Shop.Orders'] };

function setup() {
    const sent: RefactorRequest[] = [];
    render(<App api={{ postMessage: request => sent.push(request) }} />);
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'form', title: 'x', form } })); });
    return sent;
}

describe('refactoring form: Move Type to Namespace', () => {
    it('starts with the current namespace, so Move is off until another valid one is typed', () => {
        setup();
        const input = screen.getByRole('combobox') as HTMLInputElement;
        expect(input.value).toBe('Shop.Old');
        expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
        fireEvent.change(input, { target: { value: 'Shop..Orders' } });
        expect(screen.getByText('Not a valid namespace.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
    });

    it('suggests the namespaces of the solution and sends the one typed', () => {
        const sent = setup();
        expect(document.querySelectorAll('#rf-namespaces option')).toHaveLength(2);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: ' Shop.Orders ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Move' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'moveTypeNamespace', namespace: 'Shop.Orders' } });
    });

    it('cancels with Esc', () => {
        const sent = setup();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(sent[sent.length - 1]).toEqual({ type: 'cancel' });
    });
});
