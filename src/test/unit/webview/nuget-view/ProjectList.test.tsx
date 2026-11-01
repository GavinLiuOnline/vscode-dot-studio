jest.mock('vscrui', () => ({ Checkbox: ({ checked, onChange }: { checked: boolean; onChange(): void }) => <input type="checkbox" checked={checked} onChange={onChange} /> }));

import { render, screen } from '@testing-library/react';
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
});
