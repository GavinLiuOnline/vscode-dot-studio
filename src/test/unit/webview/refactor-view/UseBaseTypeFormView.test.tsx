import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../../../webview/refactor-view/App';
import { countText } from '../../../../webview/refactor-view/UseBaseTypeFormView';
import { ExtractInterfaceForm, RefactorRequest, UseBaseTypeForm } from '../../../../types/refactoring';

const form: UseBaseTypeForm = {
    kind: 'useBaseType',
    typeName: 'Dog',
    targets: [
        { id: 'Animal', name: 'Animal', kind: 'class', where: 'Animal.cs (Zoo)', count: 0, publicCount: 0 },
        { id: 'IPet', name: 'IPet', kind: 'interface', where: 'IPet.cs (Zoo)', count: 4, publicCount: 2 },
    ],
};

function setup(shown: unknown = form) {
    const sent: RefactorRequest[] = [];
    render(<App api={{ postMessage: request => sent.push(request) }} />);
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'form', title: 'x', form: shown } })); });
    return sent;
}

describe('refactoring form: Use Base Type', () => {
    it('says how many places each target would be used in and checks the first one that changes anything', () => {
        setup();
        expect(screen.getByRole('radio', { name: /Animal/ })).toBeDisabled();
        expect(screen.getByRole('radio', { name: /IPet/ })).toBeChecked();
        expect(screen.getByText('4 places, 2 in the parameters of public methods')).toBeTruthy();
        expect(screen.getByText(/nothing to change/)).toBeTruthy();
    });

    it('submits the target, and cancels with Esc', () => {
        const sent = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Use' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'useBaseType', targetId: 'IPet' } });
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(sent[sent.length - 1]).toEqual({ type: 'cancel' });
    });

    it('is off when no target changes anything', () => {
        setup({ ...form, targets: [form.targets[0]] });
        expect(screen.getByRole('button', { name: 'Use' })).toBeDisabled();
    });

    it('counts in the words of the form', () => {
        expect(countText({ id: 'a', name: 'A', kind: 'class', where: '', count: 1, publicCount: 0 })).toBe('1 place');
        expect(countText({ id: 'a', name: 'A', kind: 'class', where: '', count: -1, publicCount: 0 })).toBe('');
    });
});

describe('the option on Extract Interface', () => {
    const extractForm: ExtractInterfaceForm = { kind: 'extractInterface', typeName: 'Order', interfaceName: 'IOrder', members: [{ id: 'a', kind: 'method', signature: 'void Add();' }] };

    it('is off by default and sent only when it is on', () => {
        const sent = setup(extractForm);
        fireEvent.click(screen.getByRole('button', { name: 'Extract' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'extractInterface', interfaceName: 'IOrder', memberIds: ['a'], newFile: true } });
        fireEvent.click(screen.getByRole('checkbox', { name: /Use IOrder instead of Order where possible/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Extract' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'extractInterface', interfaceName: 'IOrder', memberIds: ['a'], newFile: true, useBaseType: true } });
    });
});
