import React, { useState } from 'react';
import { ConvertTypeChoice, ConvertTypeForm } from '../../types/refactoring';
import { FORM_STYLE } from './MembersForm';
import { t } from '../shared/i18n';

/** What the conversion rewrites, in the words of the form */
export function implementersText(form: ConvertTypeForm): string {
    const derives = form.direction === 'toInterface';
    const count = form.implementers.length;
    if (count === 0) { return t(derives ? "No class in this solution's source derives from {0}." : "No class in this solution's source implements {0}.", form.typeName); }
    if (count === 1) { return t(derives ? '1 class that derives from {0} is rewritten:' : '1 class that implements {0} is rewritten:', form.typeName); }
    return t(derives ? '{0} classes that derive from {1} are rewritten:' : '{0} classes that implement {1} are rewritten:', count, form.typeName);
}

/** Convert Abstract Class to Interface and back: what changes, and for members with a body the choice to keep them as default interface members */
export const ConvertTypeFormView: React.FC<{
    form: ConvertTypeForm;
    onSubmit: (choice: ConvertTypeChoice) => void;
    onCancel: () => void;
}> = ({ form, onSubmit, onCancel }) => {
    const toInterface = form.direction === 'toInterface';
    const hasBodies = toInterface && form.bodies.length > 0;
    const [defaultMembers, setDefaultMembers] = useState(false);
    const ready = !hasBodies || defaultMembers;
    const submit = () => ready && onSubmit({ kind: 'convertType', defaultMembers: hasBodies && defaultMembers });
    return (
        <form className="rf" onSubmit={event => { event.preventDefault(); submit(); }}>
            <style>{FORM_STYLE}</style>
            <h1>{toInterface ? t('Convert to Interface') : t('Convert to Abstract Class')}</h1>
            <p className="subtitle"><strong>{form.typeName}</strong> {toInterface ? t('becomes an interface') : t('becomes an abstract class')}</p>
            <section>
                <h2>{t('What changes')}</h2>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                    {toInterface ? (
                        <>
                            <li>{t('The declaration becomes interface {0}; public, abstract and virtual leave the members.', form.typeName)}</li>
                            <li>{t('The classes that derive from it lose override on what implements its members.')}</li>
                        </>
                    ) : (
                        <>
                            <li>{t('The declaration becomes abstract class {0}; the members become public abstract (public virtual with a body).', form.typeName)}</li>
                            <li>{t('The classes that implement it get override on what implemented its members and name it first in their base list.')}</li>
                        </>
                    )}
                    <li>{t('The type keeps its name; rename it (F2) to follow your naming. Every use of it stays valid.')}</li>
                </ul>
            </section>
            {hasBodies && (
                <section>
                    <h2>{t('Members with a body')}</h2>
                    <label className={`target${defaultMembers ? ' on' : ''}`} style={{ display: 'flex' }}>
                        <input type="checkbox" checked={defaultMembers} onChange={event => setDefaultMembers(event.target.checked)} />
                        <span>
                            <div className="what">{t('Keep them as default interface members (C# 8)')}</div>
                            <div className="where">{form.bodies.map(body => <div key={body}><code>{body}</code></div>)}</div>
                        </span>
                    </label>
                </section>
            )}
            <section>
                <h2>{t('Classes')}</h2>
                <p style={{ margin: '0 0 6px' }}>{implementersText(form)}</p>
                {form.implementers.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {form.implementers.map(implementer => <li key={`${implementer.name}${implementer.where}`}><strong>{implementer.name}</strong> <span style={{ opacity: 0.7 }}>{implementer.where}</span></li>)}
                    </ul>
                )}
            </section>
            <p style={{ opacity: 0.7 }}>{t('The result is compiled before it is applied; if it would not compile nothing is changed and the errors are listed.')}</p>
            <div className="footer">
                <button type="button" className="action" onClick={onCancel}>{t('Cancel')}</button>
                <button type="submit" className="action primary" disabled={!ready}>{t('Convert')}</button>
            </div>
            <div className="hint">{t('Enter converts, Esc cancels')}</div>
        </form>
    );
};
