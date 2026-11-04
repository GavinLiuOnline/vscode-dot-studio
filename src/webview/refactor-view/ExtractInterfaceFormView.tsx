import React, { useState } from 'react';
import { ExtractInterfaceChoice, ExtractInterfaceForm, MemberInfo, SyntaxPalette } from '../../types/refactoring';
import { FileTargets } from './FileTargets';
import { MembersForm } from './MembersForm';
import { UseBaseTypeOption } from './UseBaseTypeOption';
import { t } from '../shared/i18n';

/** The interface as it will be written; the type parameters of the type are not known here */
export function previewOf(name: string, signatures: readonly string[]): string {
    return [`public interface ${name}`, '{', ...signatures.map(signature => `    ${signature}`), '}'].join('\n');
}

/** What an interface member looks like: methods end in `;`, properties already carry their accessors */
const interfaceLine = (member: MemberInfo): string => member.signature;

/** Visual Studio's Extract Interface dialog: the name, the file, the members to put into the interface */
export const ExtractInterfaceFormView: React.FC<{
    form: ExtractInterfaceForm;
    palette?: SyntaxPalette;
    onSubmit: (choice: ExtractInterfaceChoice) => void;
    onCancel: () => void;
}> = ({ form, palette, onSubmit, onCancel }) => {
    const [newFile, setNewFile] = useState(true);
    const [useBaseType, setUseBaseType] = useState(false);
    return (
        <MembersForm
            title={t('Extract Interface')}
            typeName={form.typeName}
            nameLabel={t('Interface name')}
            initialName={form.interfaceName}
            targets={name => (
                <>
                    <FileTargets newFile={newFile} onChange={setNewFile} fileName={`${name}.cs`} typeName={form.typeName} />
                    <UseBaseTypeOption checked={useBaseType} onChange={setUseBaseType} typeName={form.typeName} newName={name} />
                </>
            )}
            membersLabel={t('Members')}
            members={form.members}
            previewOf={(name, chosen) => previewOf(name, chosen.map(interfaceLine))}
            palette={palette}
            confirmLabel={t('Extract')}
            onSubmit={(name, memberIds) => onSubmit({ kind: 'extractInterface', interfaceName: name, memberIds, newFile, ...(useBaseType ? { useBaseType } : {}) })}
            onCancel={onCancel}
        />
    );
};
