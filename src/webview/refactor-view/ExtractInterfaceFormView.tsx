import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Highlighted } from './csharpHighlight';
import { ExtractInterfaceChoice, ExtractInterfaceForm, SyntaxPalette } from '../../types/refactoring';

/** A C# identifier; the server would reject anything else */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The interface as it will be written; the type parameters of the type are not known here */
export function previewOf(name: string, signatures: readonly string[]): string {
    return [`public interface ${name}`, '{', ...signatures.map(signature => `    ${signature}`), '}'].join('\n');
}

const STYLE = `
.rf { max-width: 760px; margin: 24px auto 0; }
.rf h1 { font-size: 1.5em; font-weight: 600; margin: 0 0 2px; }
.rf .subtitle { opacity: 0.7; margin: 0 0 20px; }
.rf section { margin: 0 0 20px; }
.rf h2 { font-size: 0.8em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.7; margin: 0 0 8px; }
.rf input[type=text] { width: 100%; font-size: 1.05em; padding: 6px 8px; }
.rf input[aria-invalid=true] { outline: 1px solid var(--vscode-inputValidation-errorBorder); }
.rf .error-text { color: var(--vscode-errorForeground); margin-top: 4px; }
.rf .targets { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rf .target { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; cursor: pointer; }
.rf .target:hover { background: var(--vscode-list-hoverBackground); }
.rf .target.on { border-color: var(--vscode-focusBorder); background: var(--vscode-list-hoverBackground); }
.rf .target input { margin: 3px 0 0; flex: none; }
.rf .target .what { font-weight: 600; }
.rf .target .where { opacity: 0.7; font-size: 0.9em; margin-top: 2px; overflow-wrap: anywhere; }
.rf .members-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.rf .members-head h2 { margin: 0; }
.rf .links { display: flex; gap: 14px; }
.rf .link { background: none; border: none; padding: 0; color: var(--vscode-textLink-foreground); font: inherit; cursor: pointer; }
.rf .link:hover { text-decoration: underline; }
.rf .members { border: 1px solid var(--vscode-panel-border); border-radius: 4px; max-height: 280px; overflow-y: auto; }
.rf .member { display: flex; align-items: center; gap: 10px; padding: 5px 10px; cursor: pointer; }
.rf .member + .member { border-top: 1px solid var(--vscode-panel-border); }
.rf .member:hover { background: var(--vscode-list-hoverBackground); }
.rf .member input { margin: 0; flex: none; }
.rf .member .sig { font-family: var(--vscode-editor-font-family); overflow-wrap: anywhere; flex: 1; min-width: 0; }
.rf .member .kind { flex: none; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.05em; padding: 1px 6px; border-radius: 8px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); opacity: 0.85; }
.rf .member.off .sig { opacity: 0.5; }
.rf pre { margin: 0; padding: 10px 12px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
    font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; overflow-wrap: anywhere; }
.rf .footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
.rf .hint { opacity: 0.6; font-size: 0.85em; margin-top: 10px; text-align: right; }
`;

/** Visual Studio's Extract Interface dialog: the name, the file, the members to put into the interface */
export const ExtractInterfaceFormView: React.FC<{
    form: ExtractInterfaceForm;
    palette?: SyntaxPalette;
    onSubmit: (choice: ExtractInterfaceChoice) => void;
    onCancel: () => void;
}> = ({ form, palette, onSubmit, onCancel }) => {
    const [name, setName] = useState(form.interfaceName);
    const [newFile, setNewFile] = useState(true);
    const [selected, setSelected] = useState(() => new Set(form.members.map(member => member.id)));
    const nameInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        nameInput.current?.focus();
        nameInput.current?.select();
    }, []);

    const chosen = useMemo(() => form.members.filter(member => selected.has(member.id)), [form.members, selected]);
    const nameValid = IDENTIFIER.test(name);
    const valid = nameValid && chosen.length > 0;
    const toggle = (id: string) => setSelected(current => {
        const next = new Set(current);
        if (!next.delete(id)) {
            next.add(id);
        }
        return next;
    });
    const submit = () => valid && onSubmit({ kind: 'extractInterface', interfaceName: name, memberIds: chosen.map(member => member.id), newFile });

    return (
        <form className="rf" onSubmit={event => { event.preventDefault(); submit(); }}>
            <style>{STYLE}</style>
            <h1>Extract Interface</h1>
            <p className="subtitle">from <strong>{form.typeName}</strong></p>

            <section>
                <h2><label htmlFor="interface-name">Interface name</label></h2>
                <input id="interface-name" ref={nameInput} type="text" value={name} onChange={event => setName(event.target.value)} aria-invalid={!nameValid} spellCheck={false} />
                {!nameValid && <div className="error-text">Not a valid C# identifier.</div>}
            </section>

            <section>
                <h2>Generate into</h2>
                <div className="targets">
                    <label className={`target${newFile ? ' on' : ''}`}>
                        <input type="radio" name="target" checked={newFile} onChange={() => setNewFile(true)} />
                        <span><div className="what">New file</div><div className="where">{name}.cs, next to {form.typeName}</div></span>
                    </label>
                    <label className={`target${newFile ? '' : ' on'}`}>
                        <input type="radio" name="target" checked={!newFile} onChange={() => setNewFile(false)} />
                        <span><div className="what">The same file</div><div className="where">Above {form.typeName}</div></span>
                    </label>
                </div>
            </section>

            <section>
                <div className="members-head">
                    <h2>Members ({chosen.length} of {form.members.length})</h2>
                    <span className="links">
                        <button type="button" className="link" onClick={() => setSelected(new Set(form.members.map(member => member.id)))}>Select all</button>
                        <button type="button" className="link" onClick={() => setSelected(new Set())}>Deselect all</button>
                    </span>
                </div>
                <div className="members" role="group" aria-label="Members">
                    {form.members.map(member => (
                        <label key={member.id} className={`member${selected.has(member.id) ? '' : ' off'}`}>
                            <input type="checkbox" checked={selected.has(member.id)} onChange={() => toggle(member.id)} />
                            <span className="sig"><Highlighted palette={palette} code={member.signature} /></span>
                            <span className="kind">{member.kind}</span>
                        </label>
                    ))}
                    {form.members.length === 0 && <div className="member">The type has no public instance members.</div>}
                </div>
            </section>

            <section>
                <h2>Preview</h2>
                <pre aria-label="Preview"><Highlighted palette={palette} code={previewOf(name, chosen.map(member => member.signature))} /></pre>
            </section>

            <div className="footer">
                <button type="button" className="action" onClick={onCancel}>Cancel</button>
                <button type="submit" className="action primary" disabled={!valid}>Extract</button>
            </div>
            <div className="hint">Enter extracts, Esc cancels</div>
        </form>
    );
};
