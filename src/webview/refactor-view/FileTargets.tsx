import React from 'react';
import { t } from '../shared/i18n';

/** "Generate into": a new file next to the type, or the same file above it */
export const FileTargets: React.FC<{ newFile: boolean; onChange: (newFile: boolean) => void; fileName: string; typeName: string }> = ({ newFile, onChange, fileName, typeName }) => (
    <section>
        <h2>{t('Generate into')}</h2>
        <div className="targets">
            <label className={`target${newFile ? ' on' : ''}`}>
                <input type="radio" name="target" checked={newFile} onChange={() => onChange(true)} />
                <span><div className="what">{t('New file')}</div><div className="where">{t('{0}, next to {1}', fileName, typeName)}</div></span>
            </label>
            <label className={`target${newFile ? '' : ' on'}`}>
                <input type="radio" name="target" checked={!newFile} onChange={() => onChange(false)} />
                <span><div className="what">{t('The same file')}</div><div className="where">{t('Above {0}', typeName)}</div></span>
            </label>
        </div>
    </section>
);
