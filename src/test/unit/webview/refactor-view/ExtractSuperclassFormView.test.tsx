import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../../../webview/refactor-view/App';
import { ExtractSuperclassForm, RefactorRequest } from '../../../../types/refactoring';

const form: ExtractSuperclassForm = {
    kind: 'extractSuperclass',
    typeName: 'Foo',
    baseName: 'FooBase',
    members: [
        { id: 'count', kind: 'field', signature: 'private int _count' },
        { id: 'inc', kind: 'method', signature: 'public void Inc()', canBeAbstract: true, abstractSignature: 'public abstract void Inc();', deps: ['count'] },
        { id: 'other', kind: 'method', signature: 'public void Other()', canBeAbstract: true, abstractSignature: 'public abstract void Other();', deps: [] },
        { id: 'part', kind: 'method', signature: 'public void Elsewhere()', blocked: 'it uses Z, which is declared elsewhere in Foo' },
    ],
};

function setup() {
    const sent: RefactorRequest[] = [];
    render(<App api={{ postMessage: request => sent.push(request) }} />);
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'form', title: 'x', form } })); });
    return sent;
}

const box = (name: RegExp) => screen.getByRole('checkbox', { name });

describe('refactoring form: Extract Superclass', () => {
    it('starts with nothing picked, so Extract is off, and a member that cannot move is off with its reason', () => {
        setup();
        expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled();
        expect(box(/public void Elsewhere/)).toBeDisabled();
        expect(screen.getByText(/declared elsewhere in Foo/)).toBeTruthy();
    });

    it('warns when a picked member uses one that stays, and picks it on request', () => {
        const sent = setup();
        fireEvent.click(box(/public void Inc/));
        expect(screen.getByRole('alert').textContent).toContain('private int _count');
        expect(screen.getByRole('button', { name: 'Extract' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /Move it too/ }));
        expect(screen.queryByRole('alert')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Extract' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'extractSuperclass', baseName: 'FooBase', memberIds: ['count', 'inc'], abstractIds: [], newFile: true } });
    });

    it('declares a member abstract: the preview shows the abstract declaration and no dependency is needed', () => {
        const sent = setup();
        fireEvent.click(box(/public void Inc/));
        fireEvent.click(screen.getAllByRole('checkbox', { name: /abstract/ })[0]);
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByLabelText('Preview').textContent).toBe('abstract class FooBase\n{\n    public abstract void Inc();\n}');
        fireEvent.click(screen.getByRole('button', { name: 'Extract' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'extractSuperclass', baseName: 'FooBase', memberIds: ['inc'], abstractIds: ['inc'], newFile: true } });
    });

    it('confirms with Enter on a checkbox, not while the choice is incomplete', () => {
        const sent = setup();
        fireEvent.keyDown(box(/public void Other/), { key: 'Enter' });
        expect(sent.filter(request => request.type === 'submit')).toHaveLength(0);
        fireEvent.click(box(/public void Other/));
        fireEvent.keyDown(box(/public void Other/), { key: 'Enter' });
        expect(sent.filter(request => request.type === 'submit')).toHaveLength(1);
    });

    it('sends the target and the name', () => {
        const sent = setup();
        fireEvent.click(box(/public void Other/));
        fireEvent.change(screen.getByLabelText('Name of the base class'), { target: { value: 'Base2' } });
        fireEvent.click(screen.getByLabelText(/The same file/));
        fireEvent.click(screen.getByRole('button', { name: 'Extract' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'extractSuperclass', baseName: 'Base2', memberIds: ['other'], abstractIds: [], newFile: false } });
    });

    it('picks what a dependency uses in turn', () => {
        const sent: RefactorRequest[] = [];
        render(<App api={{ postMessage: request => sent.push(request) }} />);
        const chain: ExtractSuperclassForm = { ...form, members: [
            { id: 'a', kind: 'field', signature: 'private int _a' },
            { id: 'b', kind: 'method', signature: 'private void B()', deps: ['a'] },
            { id: 'c', kind: 'method', signature: 'public void C()', deps: ['b'] },
        ] };
        act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'form', title: 'x', form: chain } })); });
        fireEvent.click(screen.getByRole('checkbox', { name: /public void C/ }));
        fireEvent.click(screen.getByRole('button', { name: /Move it too/ }));
        expect(screen.queryByRole('alert')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Extract' }));
        expect(sent[sent.length - 1]).toMatchObject({ type: 'submit', choice: { memberIds: ['c', 'b', 'a'].sort() } });
    });
});
