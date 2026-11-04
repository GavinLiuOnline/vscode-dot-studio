import React from 'react';
import { t } from '../shared/i18n';

/** "Use the new type where possible": the checkbox of Extract Interface and Extract Superclass */
export const UseBaseTypeOption: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; typeName: string; newName: string }> = ({ checked, onChange, typeName, newName }) => (
    <section>
        <h2>{t('Uses of {0}', typeName)}</h2>
        <label className={`target${checked ? ' on' : ''}`} style={{ display: 'flex' }}>
            <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
            <span>
                <div className="what">{t('Use {0} instead of {1} where possible', newName, typeName)}</div>
                <div className="where">
                    {t('In parameters, local variables and private fields that only use what {0} has. The result is compiled first; what would not compile stays as it is.', newName)}
                </div>
            </span>
        </label>
    </section>
);
