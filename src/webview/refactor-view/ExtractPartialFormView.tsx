import React from 'react';
import { ExtractPartialChoice, ExtractPartialForm, SyntaxPalette } from '../../types/refactoring';
import { foldedSignature, MembersForm } from './MembersForm';

/** The new part of the type as it will be written (the bodies are folded) */
export function partialPreview(typeName: string, lines: readonly string[]): string {
    return [`partial class ${typeName}`, '{', ...lines.map(line => `    ${line}`), '}'].join('\n');
}

/** Extract Members to Partial: which members move to another part of the type, and the name of that part (its file) */
export const ExtractPartialFormView: React.FC<{
    form: ExtractPartialForm;
    palette?: SyntaxPalette;
    onSubmit: (choice: ExtractPartialChoice) => void;
    onCancel: () => void;
}> = ({ form, palette, onSubmit, onCancel }) => (
    <MembersForm
        title="Extract Members to Partial Class"
        typeName={form.typeName}
        nameLabel="Name of the part"
        initialName={form.partName}
        targets={name => (
            <section>
                <h2>New file</h2>
                <div className="target on" style={{ cursor: 'default' }}>
                    <span><div className="what">{form.typeName}.{name}.cs</div><div className="where">Next to {form.typeName}, same namespace; the type is made partial</div></span>
                </div>
            </section>
        )}
        membersLabel="Members to move"
        members={form.members}
        previewOf={(_name, chosen) => partialPreview(form.typeName, chosen.map(foldedSignature))}
        palette={palette}
        confirmLabel="Move"
        onSubmit={(name, memberIds) => onSubmit({ kind: 'extractPartial', partName: name, memberIds })}
        onCancel={onCancel}
    />
);
