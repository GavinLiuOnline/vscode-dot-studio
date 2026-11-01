jest.mock('vscrui', () => ({ Checkbox: ({ checked, onChange }: { checked: boolean; onChange(): void }) => <input type="checkbox" checked={checked} onChange={onChange} /> }));

import { act, fireEvent, render, screen } from '@testing-library/react';

const mockSent: unknown[] = [];
jest.mock('../../../../webview/nuget-view/shared', () => ({
    ...jest.requireActual('../../../../webview/nuget-view/shared'),
    sendToBackend: (message: unknown) => { mockSent.push(message); },
}));
import ProjectList from '../../../../webview/nuget-view/components/ProjectList';

const pkg = (id: string, extra = {}) => ({ id, currentVersion: '10.0.14', versions: ['10.0.14'], ...extra });
const project = (name: string, packages: { id: string; currentVersion: string }[] = []) => ({ name, path: `/repo/${name}/${name}.csproj`, framework: 'net10.0', packages: packages as never });

describe('ProjectList: the version each project uses', () => {
    const projects = [
        project('Direct', [{ id: 'System.Security.Cryptography.Pkcs', currentVersion: '10.0.14' }]),
        project('Through'),
        project('Neither'),
    ];
    const transitive = [pkg('System.Security.Cryptography.Pkcs', { projectVersions: { '/repo/Through/Through.csproj': ['9.0.11'] } })];

    it('shows the version a project gets through other packages, for a top-level package', () => {
        render(<ProjectList selectedPackage={pkg('System.Security.Cryptography.Pkcs')} projects={projects} transitivePackages={transitive}
            selectedProjects={new Set()} setSelectedProjects={() => { }} />);
        expect(screen.getByText('9.0.11 (transitive)')).toBeTruthy();
        expect(screen.getAllByText('Not installed')).toHaveLength(1);
    });

    it('shows it for the transitive package itself', () => {
        render(<ProjectList selectedPackage={transitive[0]} projects={projects}
            selectedProjects={new Set()} setSelectedProjects={() => { }} />);
        expect(screen.getByText('9.0.11 (transitive)')).toBeTruthy();
    });

    it('lists several versions when the frameworks of a project differ', () => {
        const several = [pkg('X', { projectVersions: { '/repo/Through/Through.csproj': ['4.5.0', '9.0.11'] } })];
        render(<ProjectList selectedPackage={several[0]} projects={projects} selectedProjects={new Set()} setSelectedProjects={() => { }} />);
        expect(screen.getByText('4.5.0, 9.0.11 (transitive)')).toBeTruthy();
    });

    describe('the hover over a transitive version', () => {
        beforeEach(() => { mockSent.length = 0; });
        const open = () => render(<ProjectList selectedPackage={transitive[0]} projects={projects} selectedProjects={new Set()} setSelectedProjects={() => { }} />);

        it('asks how the project gets the package and shows every hop', () => {
            open();
            fireEvent.mouseEnter(screen.getByText('9.0.11 (transitive)'));
            expect(mockSent).toEqual([{ type: 'getDependencyPaths', payload: { projectPath: '/repo/Through/Through.csproj', packageId: 'System.Security.Cryptography.Pkcs' } }]);
            expect(screen.getByRole('tooltip').textContent).toContain('Loading...');

            act(() => {
                window.dispatchEvent(new MessageEvent('message', { data: { type: 'dependencyPaths', payload: {
                    projectPath: '/repo/Through/Through.csproj', packageId: 'System.Security.Cryptography.Pkcs',
                    paths: [{ framework: 'net10.0', hops: ['Cirrus.Core.Localisation (project)', 'Microsoft.Data.SqlClient 6.1.4', 'System.Security.Cryptography.Pkcs 9.0.11'] }],
                } } }));
            });

            const text = screen.getByRole('tooltip').textContent!;
            expect(text).toContain('net10.0');
            expect(text).toContain('Through');
            expect(text).toContain('Cirrus.Core.Localisation (project)');
            expect(text).toContain('Microsoft.Data.SqlClient 6.1.4');
            expect(text).toContain('System.Security.Cryptography.Pkcs 9.0.11');
            fireEvent.mouseLeave(screen.getByText('9.0.11 (transitive)'));
            expect(screen.queryByRole('tooltip')).toBeNull();
        });

        it('asks once per project, and not for a project that has the package itself or does not have it', () => {
            open();
            const label = screen.getByText('9.0.11 (transitive)');
            fireEvent.mouseEnter(label);
            fireEvent.mouseLeave(label);
            act(() => {
                window.dispatchEvent(new MessageEvent('message', { data: { type: 'dependencyPaths', payload: { projectPath: '/repo/Through/Through.csproj', packageId: 'System.Security.Cryptography.Pkcs', paths: [] } } }));
            });
            fireEvent.mouseEnter(label);
            expect(mockSent).toHaveLength(1);

            fireEvent.mouseEnter(screen.getByText('Not installed'));
            expect(mockSent).toHaveLength(1);
            expect(screen.queryByText('Cirrus')).toBeNull();
        });
    });
});
