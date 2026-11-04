import React, { useState } from 'react';
import { UseBaseTypeChoice, UseBaseTypeForm, UseBaseTypeTarget } from '../../types/refactoring';
import { FORM_STYLE } from './MembersForm';
import { t } from '../shared/i18n';

/** How many declarations a target would be used in, as the form says it */
export function countText(target: UseBaseTypeTarget): string {
    if (target.count < 0) { return ''; }
    if (target.count === 0) { return t('nothing to change: everything uses more than it has'); }
    const places = t(target.count === 1 ? '{0} place' : '{0} places', target.count);
    return target.publicCount > 0 ? t('{0}, {1} in the parameters of public methods', places, target.publicCount) : places;
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
            <h1>{t('Use Base Type')}</h1>
            <p className="subtitle">{t('for the uses of')} <strong>{form.typeName}</strong></p>
            <section>
                <h2>{t('Use instead')}</h2>
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
                {t('Parameters, local variables and private fields of type {0} name the base type where everything done with them exists there.', form.typeName)}{' '}
                {t('Values that are cast, tested with is, passed by ref, returned or passed on to something that needs {0} keep it.', form.typeName)}{' '}
                {t('The result is compiled before it is applied; changes that would not compile are left out.')}
            </p>
            <div className="footer">
                <button type="button" className="action" onClick={onCancel}>{t('Cancel')}</button>
                <button type="submit" className="action primary" disabled={!target || !usable(target)}>{t('Use')}</button>
            </div>
            <div className="hint">{t('Enter applies, Esc cancels')}</div>
        </form>
    );
};
