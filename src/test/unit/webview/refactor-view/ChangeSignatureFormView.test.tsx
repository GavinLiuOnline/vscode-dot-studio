import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../../../webview/refactor-view/App';
import { ChangeSignatureForm, RefactorRequest } from '../../../../types/refactoring';

const form: ChangeSignatureForm = {
    kind: 'changeSignature', typeName: 'Calc', methodName: 'Add', returnType: 'int', related: [],
    parameters: [
        { name: 'a', type: 'int', modifier: '' },
        { name: 'b', type: 'int', modifier: '', defaultValue: '1' },
    ],
};

function setup(shown: ChangeSignatureForm = form) {
    const sent: RefactorRequest[] = [];
    render(<App api={{ postMessage: request => sent.push(request) }} />);
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'form', title: 'x', form: shown } })); });
    return sent;
}

const last = (sent: RefactorRequest[]) => sent[sent.length - 1];

describe('refactoring form: Change Signature', () => {
    it('starts with the parameters as they are, so the button is off until something changes', () => {
        setup();
        expect(screen.getByLabelText('Preview').textContent).toBe('int Add(int a, int b = 1)');
        expect(screen.getByRole('button', { name: 'Change Signature' })).toBeDisabled();
    });

    it('reorders, renames and retypes, and sends the old index of every parameter', () => {
        const sent = setup();
        fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]);
        fireEvent.change(row(1).getByLabelText('Name'), { target: { value: 'left' } });
        fireEvent.change(row(0).getByLabelText('Type'), { target: { value: 'long' } });
        expect(screen.getByLabelText('Preview').textContent).toBe('int Add(long b = 1, int left)');
        expect(screen.getByText('A parameter without a default value cannot follow one with a default value.')).toBeTruthy();
        fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);
        fireEvent.click(screen.getByRole('button', { name: 'Change Signature' }));
        expect(last(sent)).toEqual({ type: 'submit', choice: { kind: 'changeSignature', parameters: [
            { oldIndex: 0, name: 'left', type: 'int' },
            { oldIndex: 1, name: 'b', type: 'long' },
        ] } });
    });

    it('removes a parameter, and a removed one can be restored', () => {
        const sent = setup();
        fireEvent.click(row(1).getByRole('button', { name: 'Remove' }));
        expect(screen.getByLabelText('Preview').textContent).toBe('int Add(int a)');
        fireEvent.click(row(1).getByRole('button', { name: 'Restore' }));
        expect(screen.getByLabelText('Preview').textContent).toBe('int Add(int a, int b = 1)');
        fireEvent.click(row(1).getByRole('button', { name: 'Remove' }));
        fireEvent.click(screen.getByRole('button', { name: 'Change Signature' }));
        expect(last(sent)).toEqual({ type: 'submit', choice: { kind: 'changeSignature', parameters: [{ oldIndex: 0, name: 'a', type: 'int' }] } });
    });

    it('a new parameter needs a name, a type and a value for the calls (or a default value)', () => {
        const sent = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Add parameter' }));
        const added = row(2);
        // behind a parameter with a default value only an optional one fits: the new one goes first
        fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[2]);
        fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]);
        expect(screen.getByRole('button', { name: 'Change Signature' })).toBeDisabled();
        fireEvent.change(added.getByLabelText('Name'), { target: { value: 'scale' } });
        fireEvent.change(added.getByLabelText('Type'), { target: { value: 'double' } });
        expect(screen.getByText('Say what the calls pass, or give it a default value.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Change Signature' })).toBeDisabled();
        fireEvent.change(added.getByLabelText('The calls pass'), { target: { value: '1.5' } });
        fireEvent.click(screen.getByRole('button', { name: 'Change Signature' }));
        expect(last(sent)).toEqual({ type: 'submit', choice: { kind: 'changeSignature', parameters: [
            { oldIndex: null, name: 'scale', type: 'double', defaultValue: '', callSiteValue: '1.5' },
            { oldIndex: 0, name: 'a', type: 'int' },
            { oldIndex: 1, name: 'b', type: 'int' },
        ] } });
    });

    it('refuses duplicate names and names that are no identifier', () => {
        setup();
        fireEvent.change(row(1).getByLabelText('Name'), { target: { value: 'a' } });
        expect(screen.getAllByText('Two parameters have this name.')).toHaveLength(2);
        fireEvent.change(row(1).getByLabelText('Name'), { target: { value: '1x' } });
        expect(screen.getByText('Not a valid C# identifier.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Change Signature' })).toBeDisabled();
    });

    it('lists the methods that change along and keeps this of an extension method first', () => {
        setup({ ...form, related: ['IShape.Scale'], parameters: [{ name: 's', type: 'string', modifier: 'this' }, { name: 'n', type: 'int', modifier: '' }] });
        expect(screen.getByText('IShape.Scale')).toBeTruthy();
        expect(row(0).getByRole('button', { name: 'Move down' })).toBeDisabled();
        expect(row(1).getByRole('button', { name: 'Move up' })).toBeDisabled();
        expect(row(0).getByRole('button', { name: 'Remove' })).toBeDisabled();
    });
});

/** The queries of the row of a parameter, by its place in the list as it is now */
const row = (index: number) => within(screen.getAllByRole('group')[index]);
