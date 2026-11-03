import React from 'react';

/** "Use the new type where possible": the checkbox of Extract Interface and Extract Superclass */
export const UseBaseTypeOption: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; typeName: string; newName: string }> = ({ checked, onChange, typeName, newName }) => (
    <section>
        <h2>Uses of {typeName}</h2>
        <label className={`target${checked ? ' on' : ''}`} style={{ display: 'flex' }}>
            <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
            <span>
                <div className="what">Use {newName} instead of {typeName} where possible</div>
                <div className="where">
                    In parameters, local variables and private fields that only use what {newName} has. The result is compiled first; what would not compile stays as it is.
                </div>
            </span>
        </label>
    </section>
);
