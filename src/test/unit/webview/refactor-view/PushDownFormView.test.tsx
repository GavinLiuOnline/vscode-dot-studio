import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../../../webview/refactor-view/App';
import { PushDownForm, RefactorRequest } from '../../../../types/refactoring';

const form: PushDownForm = {
    kind: 'pushDown',
    typeName: 'Animal',
    derived: [
        { id: 'Cat', name: 'Cat', where: 'Cat.cs (Zoo)' },
        { id: 'Dog', name: 'Dog', where: 'Dog.cs (Zoo)' },
    ],
    members: [
        { id: 'energy', kind: 'field', signature: 'private int _energy', usedBy: ['rest', 'report'] },
        { id: 'rest', kind: 'method', signature: 'public void Rest()', canBeAbstract: true, abstractSignature: 'public abstract void Rest();', usedBy: [] },
        { id: 'report', kind: 'method', signature: 'public void Report()', canBeAbstract: true, abstractSignature: 'public abstract void Report();', usedBy: [] },
        { id: 'part', kind: 'method', signature: 'public void Elsewhere()', blocked: 'it uses Z, which is declared elsewhere in Animal', usedBy: [] },
    ],
    selected: ['rest'],
};

function setup() {
    const sent: RefactorRequest[] = [];
    render(<App api={{ postMessage: request => sent.push(request) }} />);
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'form', title: 'x', form } })); });
    return sent;
}

const box = (name: RegExp) => screen.getByRole('checkbox', { name });

describe('refactoring form: Push Members Down', () => {
    it('lists the derived classes (all checked) and starts with the member under the cursor', () => {
        setup();
        expect(box(/^Cat/)).toBeChecked();
        expect(box(/^Dog/)).toBeChecked();
        expect(box(/public void Rest/)).toBeChecked();
        expect(box(/public void Report/)).not.toBeChecked();
        expect(screen.getByLabelText('Preview').textContent).toContain('class Cat, Dog');
        expect(screen.getByRole('button', { name: 'Push down' })).toBeEnabled();
    });

    it('submits the chosen derived classes and members', () => {
        const sent = setup();
        fireEvent.click(box(/^Cat/));
        fireEvent.click(screen.getByRole('button', { name: 'Push down' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'pushDown', derivedIds: ['Dog'], memberIds: ['rest'], leaveAbstract: false } });
    });

    it('needs a derived class', () => {
        setup();
        fireEvent.click(box(/^Cat/));
        fireEvent.click(box(/^Dog/));
        expect(screen.getByRole('button', { name: 'Push down' })).toBeDisabled();
    });

    it('warns when a member that stays uses one that leaves, and pushes the users on request', () => {
        const sent = setup();
        fireEvent.click(box(/private int _energy/));
        expect(screen.getByRole('alert').textContent).toContain('public void Report()');
        expect(screen.getByRole('button', { name: 'Push down' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /Push it down too/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Push down' }));
        expect(sent[sent.length - 1]).toMatchObject({ choice: { memberIds: expect.arrayContaining(['energy', 'rest', 'report']) } });
    });

    it('leaves an abstract declaration, which needs nobody to stay without the member', () => {
        const sent = setup();
        fireEvent.click(screen.getByRole('checkbox', { name: /Leave an abstract declaration in Animal/ }));
        fireEvent.click(box(/public void Report/));
        expect(screen.getByLabelText('Preview').textContent).toContain('abstract class Animal');
        expect(screen.getByLabelText('Preview').textContent).toContain('public override void Rest() { ... }');
        fireEvent.click(screen.getByRole('button', { name: 'Push down' }));
        expect(sent[sent.length - 1]).toMatchObject({ choice: { leaveAbstract: true, memberIds: ['rest', 'report'] } });
    });

    it('keeps a member that cannot move off the list', () => {
        setup();
        expect(box(/public void Elsewhere/)).toBeDisabled();
    });
});
