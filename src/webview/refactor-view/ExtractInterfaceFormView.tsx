import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExtractInterfaceChoice, ExtractInterfaceForm } from '../../types/refactoring';

/** A C# identifier; the server would reject anything else */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The interface as it will be written; the type parameters of the type are not known here */
export function previewOf(name: string, signatures: readonly string[]): string {
    return [`public interface ${name}`, '{', ...signatures.map(signature => `    ${signature}`), '}'].join('\n');
}

/** Visual Studio's Extract Interface dialog: the name, the file, the members to put into the interface */
export const ExtractInterfaceFormView: React.FC<{
    form: ExtractInterfaceForm;
    onSubmit: (choice: ExtractInterfaceChoice) => void;
    onCancel: () => void;
}> = ({ form, onSubmit, onCancel }) => {
    const [name, setName] = useState(form.interfaceName);
    const [newFile, setNewFile] = useState(true);
    const [selected, setSelected] = useState(() => new Set(form.members.map(member => member.id)));
    const nameInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        nameInput.current?.focus();
        nameInput.current?.select();
    }, []);

    const chosen = useMemo(() => form.members.filter(member => selected.has(member.id)), [form.members, selected]);
    const valid = IDENTIFIER.test(name) && chosen.length > 0;
    const toggle = (id: string) => setSelected(current => {
        const next = new Set(current);
        if (!next.delete(id)) {
            next.add(id);
        }
        return next;
    });
    const submit = () => valid && onSubmit({ kind: 'extractInterface', interfaceName: name, memberIds: chosen.map(member => member.id), newFile });

    return (
        <form onSubmit={event => { event.preventDefault(); submit(); }}>
            <h1>Extract Interface from {form.typeName}</h1>
            <div className="field">
                <label htmlFor="interface-name">New interface name</label>
                <input id="interface-name" ref={nameInput} type="text" value={name} onChange={event => setName(event.target.value)} aria-invalid={!IDENTIFIER.test(name)} />
                {!IDENTIFIER.test(name) && <div className="hint">Not a valid C# identifier.</div>}
            </div>
            <div className="field">
                <span>Generate into</span>
                <span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}><input type="radio" style={{ margin: 0 }} name="target" checked={newFile} onChange={() => setNewFile(true)} /> New file ({name}.cs, next to the type)</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}><input type="radio" style={{ margin: 0 }} name="target" checked={!newFile} onChange={() => setNewFile(false)} /> The same file, above the type</label>
                </span>
            </div>
            <h2>Select public members to form interface</h2>
            <div className="toolbar">
                <button type="button" className="action" onClick={() => setSelected(new Set(form.members.map(member => member.id)))}>Select All</button>
                <button type="button" className="action" onClick={() => setSelected(new Set())}>Deselect All</button>
            </div>
            <div className="layout">
                <div role="group" aria-label="Members" style={{ flex: '1 1 55%', minWidth: 0 }}>
                    {form.members.map(member => (
                        <label key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer' }}>
                            <input type="checkbox" style={{ margin: 0, flex: 'none' }} checked={selected.has(member.id)} onChange={() => toggle(member.id)} />
                            <span style={{ fontFamily: 'var(--vscode-editor-font-family)', overflowWrap: 'anywhere' }}>{member.signature}</span>
                        </label>
                    ))}
                    {form.members.length === 0 && <div className="empty">The type has no public instance members.</div>}
                </div>
                <pre aria-label="Preview" style={{ flex: '1 1 45%', minWidth: 0, margin: 0, padding: '4px 8px', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'var(--vscode-editor-font-family)', background: 'var(--vscode-editor-background)', border: '1px solid var(--vscode-panel-border)' }}>{previewOf(name, chosen.map(member => member.signature))}</pre>
            </div>
            <div className="buttons">
                <button type="submit" className="action primary" disabled={!valid}>OK</button>
                <button type="button" className="action" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
};
