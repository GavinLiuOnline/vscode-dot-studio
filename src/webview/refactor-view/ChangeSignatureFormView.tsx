import React, { useEffect, useRef, useState } from 'react';
import { ChangeSignatureChoice, ChangeSignatureForm, SignatureParameterChoice } from '../../types/refactoring';
import { FORM_STYLE, IDENTIFIER } from './MembersForm';
import { t } from '../shared/i18n';

const STYLE = `
.rf .sig-row { display: grid; grid-template-columns: auto minmax(90px, 1fr) minmax(110px, 1.4fr) minmax(70px, 1fr) minmax(70px, 1fr) auto; gap: 6px; align-items: center; padding: 4px 0; }
.rf .sig-row.removed input { text-decoration: line-through; opacity: 0.5; }
.rf .sig-row input[type=text] { font-size: 1em; padding: 3px 6px; min-width: 0; }
.rf .sig-head { font-size: 0.75em; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; }
.rf .sig-move { display: flex; flex-direction: column; }
.rf .sig-move button { padding: 0 6px; line-height: 1.1; border: none; border-radius: 2px; cursor: pointer;
    background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.rf .sig-move button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
.rf .sig-move button:disabled { opacity: 0.35; cursor: default; }
.rf .sig-fixed { opacity: 0.7; font-family: var(--vscode-editor-font-family); }
`;

interface Row {
    key: number;
    oldIndex: number | null;
    name: string;
    type: string;
    modifier: string;
    /** An existing parameter: its default value as declared. A new one: the value it gets */
    defaultValue: string;
    callSiteValue: string;
    removed: boolean;
}

/** Change Signature: the parameter list of the method, edited in place (order, names, types, new and removed parameters) */
export const ChangeSignatureFormView: React.FC<{
    form: ChangeSignatureForm;
    onSubmit: (choice: ChangeSignatureChoice) => void;
    onCancel: () => void;
}> = ({ form, onSubmit, onCancel }) => {
    const [rows, setRows] = useState<Row[]>(() => form.parameters.map((parameter, index) => ({
        key: index, oldIndex: index, name: parameter.name, type: parameter.type, modifier: parameter.modifier,
        defaultValue: parameter.defaultValue ?? '', callSiteValue: '', removed: false,
    })));
    const [nextKey, setNextKey] = useState(form.parameters.length);
    const first = useRef<HTMLInputElement>(null);
    useEffect(() => { first.current?.focus(); }, []);

    const update = (key: number, change: Partial<Row>) => setRows(current => current.map(row => row.key === key ? { ...row, ...change } : row));
    const move = (index: number, by: number) => setRows(current => {
        const target = index + by;
        // the this parameter of an extension method stays first
        if (target < 0 || target >= current.length || current[index].modifier === 'this' || current[target].modifier === 'this') { return current; }
        const copy = [...current];
        [copy[index], copy[target]] = [copy[target], copy[index]];
        return copy;
    });
    const add = () => {
        setRows(current => [...current, { key: nextKey, oldIndex: null, name: '', type: '', modifier: '', defaultValue: '', callSiteValue: '', removed: false }]);
        setNextKey(nextKey + 1);
    };

    const active = rows.filter(row => !row.removed);
    const problem = (row: Row, position: number): string | undefined => {
        if (!IDENTIFIER.test(row.name.trim())) { return t('Not a valid C# identifier.'); }
        if (active.some(other => other !== row && other.name.trim() === row.name.trim())) { return t('Two parameters have this name.'); }
        if (row.type.trim() === '') { return t('A parameter needs a type.'); }
        if (row.oldIndex === null && row.defaultValue.trim() === '' && row.callSiteValue.trim() === '') { return t('Say what the calls pass, or give it a default value.'); }
        if (row.modifier.includes('params') && position !== active.length - 1) { return t('A params parameter must be the last one.'); }
        const optional = (other: Row) => other.defaultValue.trim() !== '';
        if (!optional(row) && !row.modifier.includes('params') && active.slice(0, position).some(optional)) { return t('A parameter without a default value cannot follow one with a default value.'); }
        return undefined;
    };
    const problems = active.map((row, position) => problem(row, position));
    const unchanged = active.length === form.parameters.length
        && active.every((row, i) => row.oldIndex === i && row.name.trim() === form.parameters[i].name && row.type.trim() === form.parameters[i].type);
    const valid = problems.every(p => p === undefined) && !unchanged;

    const submit = () => {
        if (!valid) { return; }
        const parameters: SignatureParameterChoice[] = active.map(row => row.oldIndex === null
            ? { oldIndex: null, name: row.name.trim(), type: row.type.trim(), defaultValue: row.defaultValue.trim(), callSiteValue: row.callSiteValue.trim() }
            : { oldIndex: row.oldIndex, name: row.name.trim(), type: row.type.trim() });
        onSubmit({ kind: 'changeSignature', parameters });
    };

    const preview = `${form.returnType ? form.returnType + ' ' : ''}${form.methodName}(${active.map(row =>
        `${row.modifier ? row.modifier + ' ' : ''}${row.type.trim() || '?'} ${row.name.trim() || '?'}${row.defaultValue.trim() ? ' = ' + row.defaultValue.trim() : ''}`).join(', ')})`;

    return (
        <form className="rf" onSubmit={event => { event.preventDefault(); submit(); }}>
            <style>{FORM_STYLE}{STYLE}</style>
            <h1>{t('Change Signature')}</h1>
            <p className="subtitle">{t('of')} <strong>{form.typeName}.{form.methodName}</strong></p>
            {form.related.length > 0 && (
                <div className="notice">
                    {t('These change along, their signatures must stay equal:')}
                    <ul>{form.related.map(name => <li key={name}>{name}</li>)}</ul>
                </div>
            )}
            <section>
                <h2>{t('Parameters')}</h2>
                {rows.length > 0 && (
                    <div className="sig-row sig-head" aria-hidden="true">
                        <span /><span>{t('Name')}</span><span>{t('Type')}</span><span>{t('Default value')}</span><span>{t('The calls pass')}</span><span />
                    </div>
                )}
                {rows.map((row, index) => {
                    const position = active.indexOf(row);
                    const error = row.removed ? undefined : problems[position];
                    const isNew = row.oldIndex === null;
                    const pinned = row.modifier === 'this';
                    return (
                        <div key={row.key}>
                            <div className={`sig-row${row.removed ? ' removed' : ''}`} role="group" aria-label={row.name || t('New parameter')}>
                                <span className="sig-move">
                                    <button type="button" aria-label={t('Move up')} disabled={index === 0 || pinned || rows[index - 1].modifier === 'this'} onClick={() => move(index, -1)}>▲</button>
                                    <button type="button" aria-label={t('Move down')} disabled={index === rows.length - 1 || pinned || rows[index + 1].modifier === 'this'} onClick={() => move(index, 1)}>▼</button>
                                </span>
                                <input ref={index === 0 ? first : undefined} type="text" aria-label={t('Name')} value={row.name} disabled={row.removed}
                                    aria-invalid={!!error} spellCheck={false} onChange={event => update(row.key, { name: event.target.value })} />
                                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    {row.modifier && <span className="sig-fixed">{row.modifier}</span>}
                                    <input type="text" aria-label={t('Type')} value={row.type} disabled={row.removed} spellCheck={false}
                                        onChange={event => update(row.key, { type: event.target.value })} />
                                </span>
                                {isNew
                                    ? <input type="text" aria-label={t('Default value')} value={row.defaultValue} disabled={row.removed} spellCheck={false}
                                        onChange={event => update(row.key, { defaultValue: event.target.value })} />
                                    : <span className="sig-fixed">{row.defaultValue}</span>}
                                {isNew
                                    ? <input type="text" aria-label={t('The calls pass')} value={row.callSiteValue} disabled={row.removed} spellCheck={false}
                                        onChange={event => update(row.key, { callSiteValue: event.target.value })} />
                                    : <span />}
                                {row.removed
                                    ? <button type="button" className="link" onClick={() => update(row.key, { removed: false })}>{t('Restore')}</button>
                                    : <button type="button" className="link" disabled={pinned} onClick={() => isNew ? setRows(current => current.filter(other => other.key !== row.key)) : update(row.key, { removed: true })}>{t('Remove')}</button>}
                            </div>
                            {error && <div className="error-text">{error}</div>}
                        </div>
                    );
                })}
                <p><button type="button" className="link" onClick={add}>{t('Add parameter')}</button></p>
            </section>
            <section>
                <h2>{t('Preview')}</h2>
                <pre aria-label={t('Preview')}>{preview}</pre>
            </section>
            <p style={{ opacity: 0.7 }}>
                {t('The arguments of every call follow: reordered, removed, new ones get the value the calls pass, and are named where a parameter is left out. The parameter tags of the documentation follow as well.')}{' '}
                {t('The result is compiled before it is applied; if it would not compile nothing is changed and the errors are listed.')}
            </p>
            <div className="footer">
                <button type="button" className="action" onClick={onCancel}>{t('Cancel')}</button>
                <button type="submit" className="action primary" disabled={!valid}>{t('Change Signature')}</button>
            </div>
            <div className="hint">{t('Enter applies, Esc cancels')}</div>
        </form>
    );
};
