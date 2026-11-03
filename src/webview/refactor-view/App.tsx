import React, { useEffect, useState } from 'react';
import { RefactorChoice, RefactorForm, SyntaxPalette, RefactorMessage, RefactorRequest } from '../../types/refactoring';
import { ExtractInterfaceFormView } from './ExtractInterfaceFormView';
import { ExtractPartialFormView } from './ExtractPartialFormView';
import { ExtractSuperclassFormView } from './ExtractSuperclassFormView';
import { PullUpFormView } from './PullUpFormView';
import { UseBaseTypeFormView } from './UseBaseTypeFormView';
import { PushDownFormView } from './PushDownFormView';

export interface RefactorApi {
    postMessage(message: RefactorRequest): void;
}

/** The form of a refactoring that needs choices; OK or Enter applies them, Cancel or ESC drops the refactoring */
export const App: React.FC<{ api: RefactorApi }> = ({ api }) => {
    const [form, setForm] = useState<RefactorForm>();
    const [palette, setPalette] = useState<SyntaxPalette>();

    useEffect(() => {
        const onMessage = (event: MessageEvent<RefactorMessage>) => {
            if (event.data?.type === 'form') {
                setForm(event.data.form);
                setPalette(event.data.palette);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                api.postMessage({ type: 'cancel' });
            }
        };
        window.addEventListener('message', onMessage);
        window.addEventListener('keydown', onKey);
        api.postMessage({ type: 'ready' });
        return () => {
            window.removeEventListener('message', onMessage);
            window.removeEventListener('keydown', onKey);
        };
    }, [api]);

    if (!form) {
        return <div className="empty">Loading...</div>;
    }
    const submit = (choice: RefactorChoice) => api.postMessage({ type: 'submit', choice });
    const cancel = () => api.postMessage({ type: 'cancel' });
    switch (form.kind) {
        case 'extractInterface': return <ExtractInterfaceFormView form={form} palette={palette} onSubmit={submit} onCancel={cancel} />;
        case 'extractPartial': return <ExtractPartialFormView form={form} palette={palette} onSubmit={submit} onCancel={cancel} />;
        case 'extractSuperclass': return <ExtractSuperclassFormView form={form} palette={palette} onSubmit={submit} onCancel={cancel} />;
        case 'pullUp': return <PullUpFormView form={form} palette={palette} onSubmit={submit} onCancel={cancel} />;
        case 'pushDown': return <PushDownFormView form={form} palette={palette} onSubmit={submit} onCancel={cancel} />;
        case 'useBaseType': return <UseBaseTypeFormView form={form} onSubmit={submit} onCancel={cancel} />;
    }
};
