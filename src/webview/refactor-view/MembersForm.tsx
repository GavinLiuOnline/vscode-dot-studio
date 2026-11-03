import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MemberInfo, SyntaxPalette } from '../../types/refactoring';
import { Highlighted } from './csharpHighlight';

/** A C# identifier; the server would reject anything else */
export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

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

/** What the form of a refactoring that picks members puts in: the rest (name, members, preview) is the same for all of them */
export interface MembersFormProps {
    title: string;
    /** "from Order" */
    typeName: string;
    nameLabel: string;
    initialName: string;
    /** Shown while the name is no identifier */
    nameError?: string;
    /** The choices between the name and the members (where the code goes); it gets the current name */
    targets?: (name: string) => React.ReactNode;
    membersLabel: string;
    members: readonly MemberInfo[];
    /** The code the choice will write, from the name and the checked members */
    previewOf: (name: string, chosen: readonly MemberInfo[]) => string;
    palette?: SyntaxPalette;
    confirmLabel: string;
    onSubmit: (name: string, memberIds: string[]) => void;
    onCancel: () => void;
}

/** One-line view of a member in a preview: its declaration, with the body folded */
export function foldedSignature(member: MemberInfo): string {
    return member.kind === 'field' || member.kind === 'event' ? `${member.signature};` : `${member.signature} { ... }`;
}

/** The dialog of the refactorings that take members along: a name, where the code goes, the members to pick and a preview of the result */
export const MembersForm: React.FC<MembersFormProps> = props => {
    const { members, palette, onSubmit, onCancel } = props;
    const [name, setName] = useState(props.initialName);
    const [selected, setSelected] = useState(() => new Set(members.map(member => member.id)));
    const nameInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        nameInput.current?.focus();
        nameInput.current?.select();
    }, []);

    const chosen = useMemo(() => members.filter(member => selected.has(member.id)), [members, selected]);
    const nameValid = IDENTIFIER.test(name);
    const valid = nameValid && chosen.length > 0;
    const toggle = (id: string) => setSelected(current => {
        const next = new Set(current);
        if (!next.delete(id)) {
            next.add(id);
        }
        return next;
    });
    const submit = () => valid && onSubmit(name, chosen.map(member => member.id));

    return (
        <form className="rf" onSubmit={event => { event.preventDefault(); submit(); }}>
            <style>{STYLE}</style>
            <h1>{props.title}</h1>
            <p className="subtitle">from <strong>{props.typeName}</strong></p>

            <section>
                <h2><label htmlFor="rf-name">{props.nameLabel}</label></h2>
                <input id="rf-name" ref={nameInput} type="text" value={name} onChange={event => setName(event.target.value)} aria-invalid={!nameValid} spellCheck={false} />
                {!nameValid && <div className="error-text">{props.nameError ?? 'Not a valid C# identifier.'}</div>}
            </section>

            {props.targets?.(name)}

            <section>
                <div className="members-head">
                    <h2>{props.membersLabel} ({chosen.length} of {members.length})</h2>
                    <span className="links">
                        <button type="button" className="link" onClick={() => setSelected(new Set(members.map(member => member.id)))}>Select all</button>
                        <button type="button" className="link" onClick={() => setSelected(new Set())}>Deselect all</button>
                    </span>
                </div>
                <div className="members" role="group" aria-label="Members">
                    {members.map(member => (
                        <label key={member.id} className={`member${selected.has(member.id) ? '' : ' off'}`}>
                            <input type="checkbox" checked={selected.has(member.id)} onChange={() => toggle(member.id)} />
                            <span className="sig"><Highlighted palette={palette} code={member.signature} /></span>
                            <span className="kind">{member.kind}</span>
                        </label>
                    ))}
                    {members.length === 0 && <div className="member">The type has no members to take along.</div>}
                </div>
            </section>

            <section>
                <h2>Preview</h2>
                <pre aria-label="Preview"><Highlighted palette={palette} code={props.previewOf(name, chosen)} /></pre>
            </section>

            <div className="footer">
                <button type="button" className="action" onClick={onCancel}>Cancel</button>
                <button type="submit" className="action primary" disabled={!valid}>{props.confirmLabel}</button>
            </div>
            <div className="hint">Enter confirms, Esc cancels</div>
        </form>
    );
};
