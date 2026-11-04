import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../../../webview/refactor-view/App';
import { ConvertTypeForm, RefactorRequest } from '../../../../types/refactoring';

const toInterface: ConvertTypeForm = {
    kind: 'convertType', direction: 'toInterface', typeName: 'Shape', canUseDefaultMembers: true, bodies: [],
    implementers: [{ name: 'Circle', where: 'Circle.cs (Zoo)' }, { name: 'Square', where: 'Square.cs (Zoo)' }],
};

function setup(form: ConvertTypeForm) {
    const sent: RefactorRequest[] = [];
    render(<App api={{ postMessage: request => sent.push(request) }} />);
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'form', title: 'x', form } })); });
    return sent;
}

describe('refactoring form: Convert Abstract Class / Interface', () => {
    it('says what changes and which classes are rewritten, and converts', () => {
        const sent = setup(toInterface);
        expect(screen.getByText('Convert to Interface')).toBeTruthy();
        expect(screen.getByText('2 classes that derive from Shape are rewritten:')).toBeTruthy();
        expect(screen.getByText('Circle')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Convert' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'convertType', defaultMembers: false } });
    });

    it('needs the choice for members with a body', () => {
        const sent = setup({ ...toInterface, bodies: ['public virtual string Describe()'] });
        expect(screen.getByRole('button', { name: 'Convert' })).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox', { name: /default interface members/ }));
        expect(screen.getByRole('button', { name: 'Convert' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Convert' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'convertType', defaultMembers: true } });
    });

    it('talks of implementing for an interface, and cancels with Esc', () => {
        const sent = setup({ ...toInterface, direction: 'toClass', typeName: 'IShape', implementers: [{ name: 'Circle', where: '' }] });
        expect(screen.getByText('Convert to Abstract Class')).toBeTruthy();
        expect(screen.getByText('1 class that implements IShape is rewritten:')).toBeTruthy();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(sent[sent.length - 1]).toEqual({ type: 'cancel' });
    });
});
