import React, { useEffect, useState } from 'react';
import { FolderSettings, PublishInit, PublishMessage, PublishProfileView, PublishRequest } from '../../types/publish';
import { Select } from '../shared/Select';
import { t } from '../shared/i18n';

export interface PublishApi {
    postMessage(message: PublishRequest): void;
}

type Status = { readonly kind: 'publishing' } | { readonly kind: 'published'; readonly succeeded: boolean };

/** Keeps the settings consistent like Visual Studio's dialog: what needs a runtime or self-contained goes without them */
export function normalize(settings: FolderSettings, hostRuntime: string): FolderSettings {
    const runtimeIdentifier = settings.selfContained && !settings.runtimeIdentifier ? hostRuntime : settings.runtimeIdentifier;
    const hasRuntime = !!runtimeIdentifier;
    const selfContained = settings.selfContained && hasRuntime;
    return {
        ...settings,
        runtimeIdentifier,
        selfContained,
        singleFile: settings.singleFile && hasRuntime,
        readyToRun: settings.readyToRun && hasRuntime,
        trimmed: settings.trimmed && selfContained,
    };
}

const fileOptions = (settings: FolderSettings) => [
    settings.deleteExistingFiles && t('Delete existing files'),
    settings.singleFile && t('Single file'),
    settings.readyToRun && t('ReadyToRun'),
    settings.trimmed && t('Trimmed'),
].filter(Boolean).join(', ') || t('None');

const FolderField: React.FC<{ id: string; label: string; value: string; onChange(value: string): void; onBrowse(): void }> = ({ id, label, value, onChange, onBrowse }) => (
    <div className="field">
        <label htmlFor={id}>{label}</label>
        <div className="toolbar">
            <input id={id} type="text" value={value} onChange={e => onChange(e.target.value)} />
            <button className="action" onClick={onBrowse}>{t('Browse...')}</button>
        </div>
    </div>
);

const SelectField: React.FC<{ id: string; label: string; value: string; options: [string, string][]; onChange(value: string): void }> = ({ id, label, value, options, onChange }) => (
    <div className="field">
        <label htmlFor={id}>{label}</label>
        <Select id={id} value={value} onChange={onChange} options={options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel }))} />
    </div>
);

const Check: React.FC<{ id: string; label: string; checked: boolean; disabled?: boolean; onChange(checked: boolean): void }> = ({ id, label, checked, disabled, onChange }) => (
    <div className="check">
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
        <label htmlFor={id}>{label}</label>
    </div>
);

/** Visual Studio's profile settings dialog for Folder profiles */
const SettingsForm: React.FC<{
    init: PublishInit;
    initial: FolderSettings;
    pickedFolder?: string;
    onBrowse(current: string): void;
    onSave(settings: FolderSettings): void;
    onCancel(): void;
}> = ({ init, initial, pickedFolder, onBrowse, onSave, onCancel }) => {
    const [settings, setSettings] = useState(initial);
    const update = (changes: Partial<FolderSettings>) => setSettings(current => normalize({ ...current, ...changes }, init.hostRuntime));
    useEffect(() => {
        if (pickedFolder !== undefined) {
            setSettings(current => normalize({ ...current, publishDir: pickedFolder }, init.hostRuntime));
        }
    }, [pickedFolder, init.hostRuntime]);
    const frameworks = settings.targetFramework && !init.frameworks.includes(settings.targetFramework)
        ? [settings.targetFramework, ...init.frameworks] : init.frameworks;
    const configurations = init.configurations.includes(settings.configuration) ? init.configurations : [settings.configuration, ...init.configurations];

    return (
        <section>
            <h2>{t('Profile settings')}</h2>
            <SelectField id="configuration" label={t('Configuration')} value={settings.configuration}
                options={configurations.map(c => [c, c])} onChange={configuration => update({ configuration })} />
            <SelectField id="framework" label={t('Target framework')} value={settings.targetFramework ?? ''}
                options={frameworks.map(f => [f, f])} onChange={targetFramework => update({ targetFramework })} />
            <SelectField id="deployment" label={t('Deployment mode')} value={settings.selfContained ? 'self-contained' : 'framework-dependent'}
                options={[['framework-dependent', t('Framework-dependent')], ['self-contained', t('Self-contained')]]}
                onChange={mode => update({ selfContained: mode === 'self-contained' })} />
            <SelectField id="runtime" label={t('Target runtime')} value={settings.runtimeIdentifier ?? ''}
                options={[['', t('Portable')], ...init.runtimes.map((r): [string, string] => [r, r])]}
                onChange={runtime => update({ runtimeIdentifier: runtime || undefined, ...(runtime ? {} : { selfContained: false }) })} />
            <FolderField id="location" label={t('Target location')} value={settings.publishDir}
                onChange={publishDir => update({ publishDir })} onBrowse={() => onBrowse(settings.publishDir)} />
            <h2>{t('File publish options')}</h2>
            <Check id="delete-existing" label={t('Delete all existing files prior to publish')} checked={settings.deleteExistingFiles}
                onChange={deleteExistingFiles => update({ deleteExistingFiles })} />
            <Check id="single-file" label={t('Produce single file')} checked={settings.singleFile} disabled={!settings.runtimeIdentifier}
                onChange={singleFile => update({ singleFile })} />
            <Check id="ready-to-run" label={t('Enable ReadyToRun compilation')} checked={settings.readyToRun} disabled={!settings.runtimeIdentifier}
                onChange={readyToRun => update({ readyToRun })} />
            <Check id="trim" label={t('Trim unused code')} checked={settings.trimmed} disabled={!settings.selfContained}
                onChange={trimmed => update({ trimmed })} />
            <div className="buttons">
                <button className="action" onClick={onCancel}>{t('Cancel')}</button>
                <button className="action primary" disabled={!settings.publishDir.trim()} onClick={() => onSave(settings)}>{t('Save')}</button>
            </div>
        </section>
    );
};

/** The first step of a new profile: Visual Studio's Folder target asks for the location */
const NewProfile: React.FC<{ init: PublishInit; pickedFolder?: string; onBrowse(current: string): void; onFinish(publishDir: string): void; onCancel?: () => void }> = (
    { init, pickedFolder, onBrowse, onFinish, onCancel }) => {
    const [location, setLocation] = useState(init.newProfile.publishDir);
    useEffect(() => {
        if (pickedFolder !== undefined) {
            setLocation(pickedFolder);
        }
    }, [pickedFolder]);
    return (
        <section>
            <h2>{t('Publish to a folder')}</h2>
            <p className="note">{t('Publishes the app to a local folder or file share, for copying to a server or a container. Other targets (Azure, container registries, FTP, IIS) come later.')}</p>
            <FolderField id="new-location" label={t('Folder location')} value={location} onChange={setLocation} onBrowse={() => onBrowse(location)} />
            <div className="buttons">
                {onCancel && <button className="action" onClick={onCancel}>{t('Cancel')}</button>}
                <button className="action primary" disabled={!location.trim()} onClick={() => onFinish(location.trim())}>{t('Finish')}</button>
            </div>
        </section>
    );
};

const Summary: React.FC<{ profile: PublishProfileView; status?: Status; api: PublishApi }> = ({ profile, status, api }) => {
    if (profile.target !== 'Folder') {
        return (
            <p className="note">
                {t('This profile publishes with {0} (Azure, a container registry, FTP or IIS), which is not supported yet; it is planned.', profile.target)}{' '}
                {t('Visual Studio can publish it.')} <a className="link" onClick={() => api.postMessage({ type: 'openProfile', profile: profile.name })}>{t('Open .pubxml')}</a>
            </p>
        );
    }
    const { settings } = profile;
    return (
        <>
            {status?.kind === 'publishing' && <div className="status">{t('Publishing... the output is in the terminal.')}</div>}
            {status?.kind === 'published' && (status.succeeded
                ? <div className="status ok">{t('Published.')} <a className="link" onClick={() => api.postMessage({ type: 'openFolder', profile: profile.name })}>{t('Open folder')}</a></div>
                : <div className="status failed">{t('Publish failed. See the terminal and the Error List.')}</div>)}
            {!status && <div className="status">{profile.lastPublished ? t('Last published {0}.', new Date(profile.lastPublished).toLocaleString()) : t('Ready to publish.')}</div>}
            <dl className="summary">
                <dt>{t('Target')}</dt><dd>{t('Folder')}</dd>
                <dt>{t('Target location')}</dt><dd>{profile.publishFolder}</dd>
                <dt>{t('Configuration')}</dt><dd>{settings.configuration}</dd>
                <dt>{t('Target framework')}</dt><dd>{settings.targetFramework ?? t('Default')}</dd>
                <dt>{t('Deployment mode')}</dt><dd>{settings.selfContained ? t('Self-contained') : t('Framework-dependent')}</dd>
                <dt>{t('Target runtime')}</dt><dd>{settings.runtimeIdentifier ?? t('Portable')}</dd>
                <dt>{t('File publish options')}</dt><dd>{fileOptions(settings)}</dd>
            </dl>
        </>
    );
};

export const App: React.FC<{ api: PublishApi }> = ({ api }) => {
    const [init, setInit] = useState<PublishInit>();
    const [selected, setSelected] = useState<string>();
    const [mode, setMode] = useState<'summary' | 'settings' | 'new'>('summary');
    const [status, setStatus] = useState<Record<string, Status>>({});
    const [pickedFolder, setPickedFolder] = useState<string>();
    const [error, setError] = useState<string>();

    useEffect(() => {
        const onMessage = (event: MessageEvent<PublishMessage>) => {
            const message = event.data;
            switch (message.type) {
                case 'init':
                    setInit(message.payload);
                    setSelected(current => message.payload.selected
                        ?? (message.payload.profiles.some(p => p.name === current) ? current : message.payload.profiles[0]?.name));
                    setMode('summary');
                    setPickedFolder(undefined);
                    setError(undefined);
                    break;
                case 'publishing':
                    setStatus(current => ({ ...current, [message.profile]: { kind: 'publishing' } }));
                    break;
                case 'published':
                    setStatus(current => ({ ...current, [message.profile]: { kind: 'published', succeeded: message.succeeded } }));
                    break;
                case 'folderPicked':
                    setPickedFolder(message.path);
                    break;
                case 'error':
                    setError(message.message);
                    break;
            }
        };
        window.addEventListener('message', onMessage);
        api.postMessage({ type: 'ready' });
        return () => window.removeEventListener('message', onMessage);
    }, [api]);

    if (!init) {
        return <h1>{t('Publish')}</h1>;
    }
    const profile = init.profiles.find(p => p.name === selected);
    const browse = (current: string) => {
        setPickedFolder(undefined);
        api.postMessage({ type: 'browseFolder', current });
    };
    const publishing = profile && status[profile.name]?.kind === 'publishing';

    return (
        <>
            <h1>{t('Publish {0}', init.projectName)}</h1>
            {error && <div className="error">{error}</div>}
            {!profile || mode === 'new' ? (
                <NewProfile init={init} pickedFolder={pickedFolder} onBrowse={browse}
                    onFinish={publishDir => api.postMessage({ type: 'createProfile', publishDir })}
                    onCancel={profile ? () => setMode('summary') : undefined} />
            ) : mode === 'settings' ? (
                <SettingsForm key={profile.name} init={init} initial={profile.settings} pickedFolder={pickedFolder} onBrowse={browse}
                    onSave={settings => api.postMessage({ type: 'saveSettings', profile: profile.name, settings })}
                    onCancel={() => setMode('summary')} />
            ) : (
                <section>
                    <div className="toolbar">
                        <Select aria-label={t('Publish profile')} value={profile.name} onChange={setSelected}
                            options={init.profiles.map(p => ({ value: p.name, label: p.name }))} />
                        <button className="action primary" disabled={publishing || profile.target !== 'Folder'}
                            onClick={() => api.postMessage({ type: 'publish', profile: profile.name })}>
                            {publishing ? t('Publishing...') : t('Publish')}
                        </button>
                        <button className="action" onClick={() => setMode('new')}>{t('New profile')}</button>
                    </div>
                    <div className="toolbar">
                        <a className="link" onClick={() => api.postMessage({ type: 'renameProfile', profile: profile.name })}>{t('Rename')}</a>
                        <a className="link" onClick={() => api.postMessage({ type: 'deleteProfile', profile: profile.name })}>{t('Delete')}</a>
                        <a className="link" onClick={() => api.postMessage({ type: 'openProfile', profile: profile.name })}>{t('Open .pubxml')}</a>
                    </div>
                    <Summary profile={profile} status={status[profile.name]} api={api} />
                    {profile.target === 'Folder' && (
                        <button className="action" onClick={() => { setPickedFolder(undefined); setMode('settings'); }}>{t('Show all settings')}</button>
                    )}
                </section>
            )}
        </>
    );
};
