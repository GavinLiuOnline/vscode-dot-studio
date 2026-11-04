import React, { useEffect, useRef, useState } from 'react';
import { MoveTypeNamespaceChoice, MoveTypeNamespaceForm } from '../../types/refactoring';
import { FORM_STYLE } from './MembersForm';
import { t } from '../shared/i18n';

const NAMESPACE = /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/;

/** Move Type to Namespace: the namespace to move the type to (the ones of the solution are suggested) */
export const MoveTypeNamespaceFormView: React.FC<{
    form: MoveTypeNamespaceForm;
    onSubmit: (choice: MoveTypeNamespaceChoice) => void;
    onCancel: () => void;
}> = ({ form, onSubmit, onCancel }) => {
    const [namespace, setNamespace] = useState(form.namespace);
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => {
        input.current?.focus();
        input.current?.select();
    }, []);
    const trimmed = namespace.trim();
    const valid = NAMESPACE.test(trimmed);
    const changed = trimmed !== form.namespace;
    const submit = () => valid && changed && onSubmit({ kind: 'moveTypeNamespace', namespace: trimmed });
    return (
        <form className="rf" onSubmit={event => { event.preventDefault(); submit(); }}>
            <style>{FORM_STYLE}</style>
            <h1>{t('Move Type to Namespace')}</h1>
            <p className="subtitle"><strong>{form.typeName}</strong> {t('is in')} <strong>{form.namespace || t('the global namespace')}</strong></p>
            <section>
                <h2><label htmlFor="rf-namespace">{t('Move to namespace')}</label></h2>
                <input id="rf-namespace" ref={input} type="text" list="rf-namespaces" value={namespace} onChange={event => setNamespace(event.target.value)} aria-invalid={!valid} spellCheck={false} />
                <datalist id="rf-namespaces">
                    {form.namespaces.map(name => <option key={name} value={name} />)}
                </datalist>
                {!valid && <div className="error-text">{t('Not a valid namespace.')}</div>}
            </section>
            <p style={{ opacity: 0.7 }}>
                {t('Every place that uses the type gets the using it needs, and the type keeps the usings of what it used from its old namespace. The file stays where it is.')}{' '}
                {t('The result is compiled before it is applied; if it would not compile nothing is changed and the errors are listed.')}
            </p>
            <div className="footer">
                <button type="button" className="action" onClick={onCancel}>{t('Cancel')}</button>
                <button type="submit" className="action primary" disabled={!valid || !changed}>{t('Move')}</button>
            </div>
            <div className="hint">{t('Enter applies, Esc cancels')}</div>
        </form>
    );
};
