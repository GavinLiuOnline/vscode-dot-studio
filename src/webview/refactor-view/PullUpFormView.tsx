import React, { useState } from 'react';
import { MemberInfo, PullUpChoice, PullUpForm, PullUpTarget, SyntaxPalette } from '../../types/refactoring';
import { foldedSignature, MembersForm } from './MembersForm';

/** The member as the target will have it: the interface's declaration, the abstract declaration when it is made abstract, else as it is written */
export function pullUpLine(member: MemberInfo, target: PullUpTarget, isAbstract: boolean): string {
    if (target.kind === 'interface') { return member.interfaceSignature ?? member.signature; }
    return isAbstract && member.abstractSignature ? member.abstractSignature : foldedSignature(member);
}

/** What the target gets, as it will be written (the bodies are folded) */
export function pullUpPreview(target: PullUpTarget, lines: readonly string[], anyAbstract: boolean): string {
    const keyword = target.kind === 'interface' ? 'interface' : `${anyAbstract || target.isAbstract ? 'abstract ' : ''}class`;
    return [`${keyword} ${target.name}`, '{', '    // ...', ...lines.map(line => `    ${line}`), '}'].join('\n');
}

/** Pull Members Up: members of the class go to a base class (moved or as abstract declarations) or are added to an interface it implements */
export const PullUpFormView: React.FC<{
    form: PullUpForm;
    palette?: SyntaxPalette;
    onSubmit: (choice: PullUpChoice) => void;
    onCancel: () => void;
}> = ({ form, palette, onSubmit, onCancel }) => {
    const [targetId, setTargetId] = useState(form.targets[0]?.id ?? '');
    const [abstractIds, setAbstractIds] = useState<ReadonlySet<string>>(new Set());
    const target = form.targets.find(candidate => candidate.id === targetId) ?? form.targets[0];
    const toClass = target?.kind === 'class';
    const byId = new Map(form.members.map(member => [member.id, member]));
    const toggleAbstract = (id: string) => setAbstractIds(current => {
        const next = new Set(current);
        if (!next.delete(id)) {
            next.add(id);
        }
        return next;
    });
    const isAbstract = (id: string) => toClass && abstractIds.has(id);
    // a member that moves to a class can only use members that move with it; an interface takes a signature and the class keeps everything
    const unmet = (checked: ReadonlySet<string>) => !toClass ? [] : [...checked].flatMap(id => {
        const member = byId.get(id);
        if (!member || isAbstract(id)) { return []; }
        const missing = (member.deps ?? []).filter(dep => !checked.has(dep));
        return missing.length > 0 ? [{ member, missing }] : [];
    });
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
            title="Pull Members Up"
            typeName={form.typeName}
            targets={() => (
                <section>
                    <h2><label htmlFor="rf-target">Pull up to</label></h2>
                    <select id="rf-target" value={targetId} onChange={event => setTargetId(event.target.value)} style={{ width: '100%', padding: '6px 8px', font: 'inherit' }}>
                        {form.targets.map(candidate => (
                            <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.kind}{candidate.where ? `, ${candidate.where}` : ''})</option>
                        ))}
                    </select>
                </section>
            )}
            membersLabel="Members to pull up"
            members={form.members}
            initiallyChecked={form.selected}
            disabledReason={member => member.blocked && toClass ? member.blocked : !toClass && !member.interfaceSignature ? 'an interface cannot have it' : undefined}
            memberExtra={member => toClass && member.canBeAbstract && (
                <label className="extra" title="The base class only declares it abstract; the class keeps the body as an override">
                    <input type="checkbox" checked={abstractIds.has(member.id)} onChange={() => toggleAbstract(member.id)} /> abstract
                </label>
            )}
            notice={(checked, check) => {
                const problems = unmet(checked);
                const makesAbstract = toClass && !target.isAbstract && [...checked].some(id => abstractIds.has(id));
                if (problems.length === 0 && !makesAbstract) { return null; }
                return (
                    <>
                        {makesAbstract && (
                            <div className="notice" role="status">{target.name} becomes abstract; where it is created with <code>new</code> the result would not compile and nothing is applied.</div>
                        )}
                        {problems.length > 0 && (
                            <div className="notice" role="alert">
                                These members use members that stay in {form.typeName}, which {target.name} cannot reach:
                                <ul>
                                    {problems.map(({ member, missing }) => (
                                        <li key={member.id}>
                                            <code>{member.signature}</code> uses {missing.map(id => byId.get(id)?.signature ?? id).join(', ')}
                                            <button type="button" className="link" onClick={() => check(withDependencies(missing))}>Pull {missing.length === 1 ? 'it' : 'them'} up too</button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                );
            }}
            canSubmit={checked => !!target && unmet(checked).length === 0}
            previewOf={(_name, chosen) => target ? pullUpPreview(target, chosen.map(member => pullUpLine(member, target, isAbstract(member.id))), chosen.some(member => isAbstract(member.id))) : ''}
            palette={palette}
            confirmLabel="Pull up"
            onSubmit={(_name, memberIds) => onSubmit({ kind: 'pullUp', targetId, memberIds, abstractIds: memberIds.filter(isAbstract) })}
            onCancel={onCancel}
        />
    );
};
