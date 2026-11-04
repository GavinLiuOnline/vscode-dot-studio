import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../../../webview/refactor-view/App';
import { ExtractClassForm, RefactorRequest } from '../../../../types/refactoring';

const form: ExtractClassForm = {
    kind: 'extractClass',
    typeName: 'Order',
    className: 'OrderHelper',
    members: [
        { id: 'prices', kind: 'field', signature: 'private readonly List<int> _prices' },
        { id: 'sum', kind: 'method', signature: 'public int Sum()', deps: ['prices'] },
        { id: 'label', kind: 'method', signature: 'public string Label()', deps: [] },
        { id: 'changed', kind: 'event', signature: 'public event EventHandler Changed', blocked: 'events are not supported yet' },
    ],
};

function setup() {
    const sent: RefactorRequest[] = [];
    render(<App api={{ postMessage: request => sent.push(request) }} />);
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'form', title: 'x', form } })); });
    return sent;
}

const box = (name: RegExp) => screen.getByRole('checkbox', { name });

describe('refactoring form: Extract Class', () => {
    it('starts with nothing picked, so Extract is off, and a member that cannot move is off with its reason', () => {
        setup();
        expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled();
        expect(box(/public event EventHandler Changed/)).toBeDisabled();
        expect(screen.getByText('events are not supported yet')).toBeTruthy();
    });

    it('warns when a picked member uses one the new class could not reach, and picks it on request', () => {
        const sent = setup();
        fireEvent.click(box(/public int Sum/));
        expect(screen.getByRole('alert').textContent).toContain('private readonly List<int> _prices');
        expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /Move it too/ }));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByLabelText('Preview').textContent).toBe('class OrderHelper\n{\n    private readonly List<int> _prices;\n    public int Sum() { ... }\n}');
        fireEvent.click(screen.getByRole('button', { name: 'Extract' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'extractClass', className: 'OrderHelper', memberIds: ['prices', 'sum'], newFile: true } });
    });

    it('sends the name and the same-file choice, and cancels with Esc', () => {
        const sent = setup();
        fireEvent.click(box(/public string Label/));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Labels' } });
        fireEvent.click(screen.getByRole('radio', { name: /The same file/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Extract' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'extractClass', className: 'Labels', memberIds: ['label'], newFile: false } });
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(sent[sent.length - 1]).toEqual({ type: 'cancel' });
    });
});
