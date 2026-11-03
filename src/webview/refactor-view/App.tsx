import React, { useEffect, useState } from 'react';
import { RefactorForm, RefactorMessage, RefactorRequest } from '../../types/refactoring';
import { ExtractInterfaceFormView } from './ExtractInterfaceFormView';

export interface RefactorApi {
    postMessage(message: RefactorRequest): void;
}

/** The form of a refactoring that needs choices; OK or Enter applies them, Cancel or ESC drops the refactoring */
export const App: React.FC<{ api: RefactorApi }> = ({ api }) => {
    const [form, setForm] = useState<RefactorForm>();

    useEffect(() => {
        const onMessage = (event: MessageEvent<RefactorMessage>) => {
            if (event.data?.type === 'form') {
                setForm(event.data.form);
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
    return <ExtractInterfaceFormView form={form} onSubmit={choice => api.postMessage({ type: 'submit', choice })} onCancel={() => api.postMessage({ type: 'cancel' })} />;
};
