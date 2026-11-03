import React from 'react';

/** "Generate into": a new file next to the type, or the same file above it */
export const FileTargets: React.FC<{ newFile: boolean; onChange: (newFile: boolean) => void; fileName: string; typeName: string }> = ({ newFile, onChange, fileName, typeName }) => (
    <section>
        <h2>Generate into</h2>
        <div className="targets">
            <label className={`target${newFile ? ' on' : ''}`}>
                <input type="radio" name="target" checked={newFile} onChange={() => onChange(true)} />
                <span><div className="what">New file</div><div className="where">{fileName}, next to {typeName}</div></span>
            </label>
            <label className={`target${newFile ? '' : ' on'}`}>
                <input type="radio" name="target" checked={!newFile} onChange={() => onChange(false)} />
                <span><div className="what">The same file</div><div className="where">Above {typeName}</div></span>
            </label>
        </div>
    </section>
);
