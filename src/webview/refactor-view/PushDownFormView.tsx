import React, { useState } from 'react';
import { MemberInfo, PushDownChoice, PushDownForm, SyntaxPalette } from '../../types/refactoring';
import { foldedSignature, MembersForm } from './MembersForm';

/** What the derived classes get (and the class keeps), as it will be written; the bodies are folded */
export function pushDownPreview(derived: readonly string[], lines: readonly string[], abstractLines: readonly string[], typeName: string): string {
    const part = (header: string, body: readonly string[]) => [header, '{', ...body.map(line => `    ${line}`), '}'].join('\n');
    const derivedText = part(derived.length > 0 ? `class ${derived.join(', ')}` : 'class (no derived class chosen)', lines);
    return abstractLines.length > 0 ? `${part(`abstract class ${typeName}`, abstractLines)}\n\n${derivedText}` : derivedText;
}

/** Push Members Down: members leave the class for the derived classes, or stay as abstract declarations */
export const PushDownFormView: React.FC<{
    form: PushDownForm;
    palette?: SyntaxPalette;
    onSubmit: (choice: PushDownChoice) => void;
    onCancel: () => void;
}> = ({ form, palette, onSubmit, onCancel }) => {
    const [derivedIds, setDerivedIds] = useState<ReadonlySet<string>>(new Set(form.derived.map(derived => derived.id)));
    const [leaveAbstract, setLeaveAbstract] = useState(false);
    const byId = new Map(form.members.map(member => [member.id, member]));
    const toggleDerived = (id: string) => setDerivedIds(current => {
        const next = new Set(current);
        if (!next.delete(id)) {
            next.add(id);
        }
        return next;
    });
    // a member that leaves and is used by one that stays: the user cannot reach it (an abstract declaration stays, so it is no problem)
    const staysAsAbstract = (member: MemberInfo) => leaveAbstract && !!member.canBeAbstract;
    const unmet = (checked: ReadonlySet<string>) => [...checked].flatMap(id => {
        const member = byId.get(id);
        if (!member || staysAsAbstract(member)) { return []; }
        const users = (member.usedBy ?? []).filter(user => !checked.has(user));
        return users.length > 0 ? [{ member, users }] : [];
    });
    const withUsers = (ids: readonly string[]): string[] => {
        const all = new Set<string>();
        const visit = (id: string) => {
            if (all.has(id)) { return; }
            all.add(id);
            const member = byId.get(id);
            if (member && !staysAsAbstract(member)) { (member.usedBy ?? []).forEach(visit); }
        };
        ids.forEach(visit);
        return [...all];
    };
    const chosenNames = form.derived.filter(derived => derivedIds.has(derived.id)).map(derived => derived.name);
    return (
        <MembersForm
            title="Push Members Down"
            typeName={form.typeName}
            targets={() => (
                <>
                    <section>
                        <h2>Push down to</h2>
                        <div style={{ display: 'grid', gap: 6 }}>
                            {form.derived.map(derived => (
                                <label key={derived.id} className={`target${derivedIds.has(derived.id) ? ' on' : ''}`}>
                                    <input type="checkbox" checked={derivedIds.has(derived.id)} onChange={() => toggleDerived(derived.id)} />
                                    <span><div className="what">{derived.name}</div><div className="where">{derived.where}</div></span>
                                </label>
                            ))}
                        </div>
                    </section>
                    <section>
                        <label className={`target${leaveAbstract ? ' on' : ''}`} style={{ display: 'flex' }}>
                            <input type="checkbox" checked={leaveAbstract} onChange={event => setLeaveAbstract(event.target.checked)} />
                            <span>
                                <div className="what">Leave an abstract declaration in {form.typeName}</div>
                                <div className="where">Methods and properties stay declared (abstract) and the chosen classes get the body as an override; {form.typeName} becomes abstract. Fields and nested types always move.</div>
                            </span>
                        </label>
                    </section>
                </>
            )}
            membersLabel="Members to push down"
            members={form.members}
            initiallyChecked={form.selected}
            disabledReason={member => member.blocked}
            notice={(checked, check) => {
                const problems = unmet(checked);
                if (problems.length === 0) { return null; }
                return (
                    <div className="notice" role="alert">
                        These members are used by members that stay in {form.typeName}, which could not reach them in a derived class:
                        <ul>
                            {problems.map(({ member, users }) => (
                                <li key={member.id}>
                                    <code>{member.signature}</code> is used by {users.map(id => byId.get(id)?.signature ?? id).join(', ')}
                                    <button type="button" className="link" onClick={() => check(withUsers(users))}>Push {users.length === 1 ? 'it' : 'them'} down too</button>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            }}
            canSubmit={checked => derivedIds.size > 0 && unmet(checked).length === 0}
            previewOf={(_name, chosen) => pushDownPreview(
                chosenNames,
                chosen.map(member => staysAsAbstract(member) && member.abstractSignature ? member.abstractSignature.replace(/\babstract /, 'override ').replace(/;$/, ' { ... }') : foldedSignature(member)),
                chosen.filter(staysAsAbstract).map(member => member.abstractSignature ?? member.signature),
                form.typeName,
            )}
            palette={palette}
            confirmLabel="Push down"
            onSubmit={(_name, memberIds) => onSubmit({ kind: 'pushDown', derivedIds: [...derivedIds], memberIds, leaveAbstract })}
            onCancel={onCancel}
        />
    );
};
