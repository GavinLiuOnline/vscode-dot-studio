import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../../../webview/refactor-view/App';
import { PullUpForm, RefactorRequest } from '../../../../types/refactoring';

const form: PullUpForm = {
    kind: 'pullUp',
    typeName: 'Dog',
    targets: [
        { id: 'Animal', name: 'Animal', kind: 'class', where: 'Animal.cs (Zoo)', isAbstract: false },
        { id: 'IPet', name: 'IPet', kind: 'interface', where: 'IPet.cs (Zoo)', isAbstract: false },
    ],
    members: [
        { id: 'barks', kind: 'field', signature: 'private int _barks' },
        { id: 'bark', kind: 'method', signature: 'public void Bark()', canBeAbstract: true, abstractSignature: 'public abstract void Bark();', deps: ['barks'], interfaceSignature: 'void Bark();' },
        { id: 'fetch', kind: 'method', signature: 'public void Fetch()', canBeAbstract: true, abstractSignature: 'public abstract void Fetch();', deps: [], interfaceSignature: 'void Fetch();' },
        { id: 'part', kind: 'method', signature: 'public void Elsewhere()', blocked: 'it uses Z, which is declared elsewhere in Dog' },
    ],
    selected: ['fetch'],
};

function setup() {
    const sent: RefactorRequest[] = [];
    render(<App api={{ postMessage: request => sent.push(request) }} />);
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'form', title: 'x', form } })); });
    return sent;
}

const box = (name: RegExp) => screen.getByRole('checkbox', { name });

describe('refactoring form: Pull Members Up', () => {
    it('asks no name, offers the targets and starts with the member under the cursor', () => {
        setup();
        expect(screen.queryByLabelText(/name/i)).toBeNull();
        expect(screen.getByLabelText('Pull up to')).toHaveValue('Animal');
        expect(box(/public void Fetch/)).toBeChecked();
        expect(box(/public void Bark/)).not.toBeChecked();
        expect(screen.getByRole('button', { name: 'Pull up' })).toBeEnabled();
    });

    it('warns when a picked member uses one that stays, and pulls it up on request', () => {
        const sent = setup();
        fireEvent.click(box(/public void Bark/));
        expect(screen.getByRole('alert').textContent).toContain('private int _barks');
        expect(screen.getByRole('button', { name: 'Pull up' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: /Pull it up too/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Pull up' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'pullUp', targetId: 'Animal', memberIds: expect.arrayContaining(['fetch', 'bark', 'barks']), abstractIds: [] } });
    });

    it('declares a member abstract, says the target becomes abstract, and previews the declaration', () => {
        const sent = setup();
        fireEvent.click(screen.getByRole('checkbox', { name: 'abstract' }));
        expect(screen.getByRole('status').textContent).toContain('Animal becomes abstract');
        expect(screen.getByLabelText('Preview').textContent).toContain('abstract class Animal');
        expect(screen.getByLabelText('Preview').textContent).toContain('public abstract void Fetch();');
        fireEvent.click(screen.getByRole('button', { name: 'Pull up' }));
        expect(sent[sent.length - 1]).toMatchObject({ choice: { memberIds: ['fetch'], abstractIds: ['fetch'] } });
    });

    it('turns to interface signatures for an interface: members that cannot be in one are off, nothing is abstract', () => {
        const sent = setup();
        fireEvent.change(screen.getByLabelText('Pull up to'), { target: { value: 'IPet' } });
        expect(box(/private int _barks/)).toBeDisabled();
        expect(screen.getAllByText('an interface cannot have it', { selector: '.why' })).toHaveLength(2);
        expect(screen.queryByRole('checkbox', { name: 'abstract' })).toBeNull();
        expect(screen.getByLabelText('Preview').textContent).toContain('void Fetch();');
        // Bark uses _barks, which stays in the class: no problem for an interface
        fireEvent.click(box(/public void Bark/));
        expect(screen.queryByRole('alert')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Pull up' }));
        expect(sent[sent.length - 1]).toEqual({ type: 'submit', choice: { kind: 'pullUp', targetId: 'IPet', memberIds: ['bark', 'fetch'], abstractIds: [] } });
    });

    it('cancels with Esc', () => {
        const sent = setup();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(sent[sent.length - 1]).toEqual({ type: 'cancel' });
    });
});
