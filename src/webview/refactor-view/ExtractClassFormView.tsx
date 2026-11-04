import React, { useState } from 'react';
import { ExtractClassChoice, ExtractClassForm, SyntaxPalette } from '../../types/refactoring';
import { FileTargets } from './FileTargets';
import { foldedSignature, MembersForm } from './MembersForm';
import { t } from '../shared/i18n';

/** The new class as it will be written (the bodies are folded) */
export function classPreview(name: string, lines: readonly string[]): string {
    return [`class ${name}`, '{', ...lines.map(line => `    ${line}`), '}'].join('\n');
}

/** Extract Class: the members that go to a new class, and where the class goes */
export const ExtractClassFormView: React.FC<{
    form: ExtractClassForm;
    palette?: SyntaxPalette;
    onSubmit: (choice: ExtractClassChoice) => void;
    onCancel: () => void;
}> = ({ form, palette, onSubmit, onCancel }) => {
    const [newFile, setNewFile] = useState(true);
    const byId = new Map(form.members.map(member => [member.id, member]));
    // what a member that moves uses and the new class could not reach (private, protected) must move too
    const unmet = (checked: ReadonlySet<string>) => [...checked].flatMap(id => {
        const member = byId.get(id);
        const missing = (member?.deps ?? []).filter(dep => !checked.has(dep));
        return member && missing.length > 0 ? [{ member, missing }] : [];
    });
    /** The members and everything they use in turn */
    const withDependencies = (ids: readonly string[]): string[] => {
        const all = new Set<string>();
        const visit = (id: string) => {
            if (all.has(id)) { return; }
            all.add(id);
            (byId.get(id)?.deps ?? []).forEach(visit);
        };
        ids.forEach(visit);
        return [...all];
    };
    return (
        <MembersForm
            title={t('Extract Class')}
            typeName={form.typeName}
            nameLabel={t('Name of the new class')}
            initialName={form.className}
            targets={name => <FileTargets newFile={newFile} onChange={setNewFile} fileName={`${name}.cs`} typeName={form.typeName} />}
            membersLabel={t('Members to move')}
            members={form.members}
            initiallyChecked={[]}
            disabledReason={member => member.blocked}
            notice={(checked, check) => {
                const problems = unmet(checked);
                if (problems.length === 0) { return null; }
                return (
                    <div className="notice" role="alert">
                        {t('These members use members that stay in {0}, which the new class cannot reach:', form.typeName)}
                        <ul>
                            {problems.map(({ member, missing }) => (
                                <li key={member.id}>
                                    <code>{member.signature}</code> {t('uses')} {missing.map(id => byId.get(id)?.signature ?? id).join(', ')}
                                    <button type="button" className="link" onClick={() => check(withDependencies(missing))}>{t(missing.length === 1 ? 'Move it too' : 'Move them too')}</button>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            }}
            canSubmit={checked => unmet(checked).length === 0}
            previewOf={(name, chosen) => classPreview(name, chosen.map(foldedSignature))}
            palette={palette}
            confirmLabel={t('Extract')}
            onSubmit={(name, memberIds) => onSubmit({ kind: 'extractClass', className: name, memberIds, newFile })}
            onCancel={onCancel}
        />
    );
};
