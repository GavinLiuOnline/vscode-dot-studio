import React, { useState } from 'react';
import { ExtractSuperclassChoice, ExtractSuperclassForm, MemberInfo, SyntaxPalette } from '../../types/refactoring';
import { FileTargets } from './FileTargets';
import { foldedSignature, MembersForm } from './MembersForm';
import { UseBaseTypeOption } from './UseBaseTypeOption';
import { t } from '../shared/i18n';

/** The member as the base class will have it: the abstract declaration when it is made abstract, else as it is written */
export function superclassLine(member: MemberInfo, isAbstract: boolean): string {
    return isAbstract && member.abstractSignature ? member.abstractSignature : foldedSignature(member);
}

/** The base class as it will be written (the bodies are folded) */
export function superclassPreview(name: string, lines: readonly string[], anyAbstract: boolean): string {
    return [`${anyAbstract ? 'abstract ' : ''}class ${name}`, '{', ...lines.map(line => `    ${line}`), '}'].join('\n');
}

/** Extract Superclass: the members that go to a new base class, which of them only as abstract declarations, and where the class goes */
export const ExtractSuperclassFormView: React.FC<{
    form: ExtractSuperclassForm;
    palette?: SyntaxPalette;
    onSubmit: (choice: ExtractSuperclassChoice) => void;
    onCancel: () => void;
}> = ({ form, palette, onSubmit, onCancel }) => {
    const [newFile, setNewFile] = useState(true);
    const [useBaseType, setUseBaseType] = useState(false);
    const [abstractIds, setAbstractIds] = useState<ReadonlySet<string>>(new Set());
    const byId = new Map(form.members.map(member => [member.id, member]));
    const toggleAbstract = (id: string) => setAbstractIds(current => {
        const next = new Set(current);
        if (!next.delete(id)) {
            next.add(id);
        }
        return next;
    });
    // what a member that goes to the base class uses must go too (a member kept as abstract stays with its body and needs nothing)
    const unmet = (checked: ReadonlySet<string>) => [...checked].flatMap(id => {
        const member = byId.get(id);
        if (!member || abstractIds.has(id)) { return []; }
        const missing = (member.deps ?? []).filter(dep => !checked.has(dep));
        return missing.length > 0 ? [{ member, missing }] : [];
    });
    /** The members and everything they use in turn (a member that is kept abstract needs nothing) */
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
            title={t('Extract Superclass')}
            typeName={form.typeName}
            nameLabel={t('Name of the base class')}
            initialName={form.baseName}
            targets={name => (
                <>
                    <FileTargets newFile={newFile} onChange={setNewFile} fileName={`${name}.cs`} typeName={form.typeName} />
                    <UseBaseTypeOption checked={useBaseType} onChange={setUseBaseType} typeName={form.typeName} newName={name} />
                </>
            )}
            membersLabel={t('Members to move up')}
            members={form.members}
            initiallyChecked={[]}
            disabledReason={member => member.blocked}
            memberExtra={member => member.canBeAbstract && (
                <label className="extra" title={t('The base class declares it abstract; the class keeps the body as an override')}>
                    <input type="checkbox" checked={abstractIds.has(member.id)} onChange={() => toggleAbstract(member.id)} /> {t('abstract')}
                </label>
            )}
            notice={(checked, check) => {
                const problems = unmet(checked);
                if (problems.length === 0) { return null; }
                return (
                    <div className="notice" role="alert">
                        {t('These members use members that stay in {0}, which the base class cannot reach:', form.typeName)}
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
            previewOf={(name, chosen) => superclassPreview(name, chosen.map(member => superclassLine(member, abstractIds.has(member.id))), chosen.some(member => abstractIds.has(member.id)))}
            palette={palette}
            confirmLabel={t('Extract')}
            onSubmit={(name, memberIds) => onSubmit({ kind: 'extractSuperclass', baseName: name, memberIds, abstractIds: memberIds.filter(id => abstractIds.has(id)), newFile, ...(useBaseType ? { useBaseType } : {}) })}
            onCancel={onCancel}
        />
    );
};
