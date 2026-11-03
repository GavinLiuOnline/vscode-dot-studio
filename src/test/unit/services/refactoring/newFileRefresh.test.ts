import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { projectFileOf, refreshProjectForNewFile } from '../../../../services/refactoring/newFileRefresh';

describe('refreshProjectForNewFile', () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'newfile-'));
        fs.mkdirSync(path.join(dir, 'Orders'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    const project = (xml: string) => {
        const file = path.join(dir, 'Shop.csproj');
        fs.writeFileSync(file, xml);
        fs.utimesSync(file, new Date(2020, 0, 1), new Date(2020, 0, 1));
        return file;
    };

    it('finds the project above the file', () => {
        const file = project('<Project/>');
        expect(projectFileOf(path.join(dir, 'Orders', 'IOrder.cs'))).toBe(file);
    });

    it('touches the project file of a multi-targeted project', () => {
        const file = project('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFrameworks>net10.0;net8.0</TargetFrameworks></PropertyGroup></Project>');
        expect(refreshProjectForNewFile(path.join(dir, 'Orders', 'IOrder.cs'))).toBe(true);
        expect(fs.statSync(file).mtime.getFullYear()).toBeGreaterThan(2020);
    });

    it('leaves a single-framework project alone', () => {
        const file = project('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>');
        expect(refreshProjectForNewFile(path.join(dir, 'Orders', 'IOrder.cs'))).toBe(false);
        expect(fs.statSync(file).mtime.getFullYear()).toBe(2020);
    });
});
