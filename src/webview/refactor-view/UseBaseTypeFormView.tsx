import React, { useState } from 'react';
import { UseBaseTypeChoice, UseBaseTypeForm, UseBaseTypeTarget } from '../../types/refactoring';
import { FORM_STYLE } from './MembersForm';

/** How many declarations a target would be used in, as the form says it */
export function countText(target: UseBaseTypeTarget): string {
    if (target.count < 0) { return ''; }
    if (target.count === 0) { return 'nothing to change: everything uses more than it has'; }
    const places = `${target.count} place${target.count === 1 ? '' : 's'}`;
    return target.publicCount > 0 ? `${places}, ${target.publicCount} in the parameters of public methods` : places;
}

/** Use Base Type Where Possible: which base type or interface the uses of the type name instead */
export const UseBaseTypeFormView: React.FC<{
    form: UseBaseTypeForm;
    onSubmit: (choice: UseBaseTypeChoice) => void;
    onCancel: () => void;
}> = ({ form, onSubmit, onCancel }) => {
    const usable = (target: UseBaseTypeTarget) => target.count !== 0;
    const [targetId, setTargetId] = useState(form.targets.find(usable)?.id ?? '');
    const target = form.targets.find(candidate => candidate.id === targetId);
    const submit = () => target && usable(target) && onSubmit({ kind: 'useBaseType', targetId: target.id });
    return (
        <form className="rf" onSubmit={event => { event.preventDefault(); submit(); }}>
            <style>{FORM_STYLE}</style>
            <h1>Use Base Type</h1>
            <p className="subtitle">for the uses of <strong>{form.typeName}</strong></p>
            <section>
                <h2>Use instead</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                    {form.targets.map(candidate => (
                        <label key={candidate.id} className={`target${candidate.id === targetId ? ' on' : ''}`} style={usable(candidate) ? undefined : { opacity: 0.6, cursor: 'default' }}>
                            <input type="radio" name="use-target" checked={candidate.id === targetId} disabled={!usable(candidate)} onChange={() => setTargetId(candidate.id)} />
                            <span>
                                <div className="what">{candidate.name} <span style={{ opacity: 0.7, fontWeight: 400 }}>({candidate.kind}{candidate.where ? `, ${candidate.where}` : ''})</span></div>
                                <div className="where">{countText(candidate)}</div>
                            </span>
                        </label>
                    ))}
                </div>
            </section>
            <p style={{ opacity: 0.7 }}>
                Parameters, local variables and private fields of type {form.typeName} name the base type where everything done with them exists there.
                Values that are cast, tested with <code>is</code>, passed by <code>ref</code>, returned or passed on to something that needs {form.typeName} keep it.
                The result is compiled before it is applied; changes that would not compile are left out.
            </p>
            <div className="footer">
                <button type="button" className="action" onClick={onCancel}>Cancel</button>
                <button type="submit" className="action primary" disabled={!target || !usable(target)}>Use</button>
            </div>
            <div className="hint">Enter applies, Esc cancels</div>
        </form>
    );
};
