import { SolutionService } from '../solution/solutionService';
import { FrameworkOption } from '../../types/framework';
import { DebugConfigService } from './debugConfigService';
import { logger } from '../../core/logger';
import { Solution } from '../../core/Solution';
import { FrameworkChoice } from '../project/frameworkChoice';

const log = logger('FrameworkDropdownService');

/**
 * Pure framework selection service that handles .NET framework selection logic
 * without VS Code UI dependencies. Provides core functionality for:
 * - Getting available framework options
 * - Setting/getting active framework
 * - Saving/loading framework preferences
 * - Framework validation and selection logic
 */
export class FrameworkDropdownService {
    private solution?: Solution;

    public setSolution(solution: Solution): void {
        this.solution = solution;
    }

    public getActiveFramework(): string | undefined {
        return this.solution?.getActiveFramework() ?? undefined;
    }

    public getFrameworkOptions(): FrameworkOption[] {
        try {
            // Every framework any loaded project targets: the choice is the solution's, not the startup project's
            let frameworks: string[] = [...new Set([...(this.solution?.projects.values() ?? [])].flatMap(project => project.frameworks))];
            // Fallback: no project has been read yet, the solution file's list
            if (frameworks.length === 0 && this.solution?.solutionFile) {
                frameworks = SolutionService.getAllFrameworks(this.solution.solutionFile);
            }

            if (frameworks.length === 0) {
                return [];
            }

            // Sort frameworks by support status
            const sortedFrameworks = frameworks.sort((a, b) => {
                const aSupported = SolutionService.isFrameworkSupported(a);
                const bSupported = SolutionService.isFrameworkSupported(b);

                if (aSupported && !bSupported) return -1;
                if (!aSupported && bSupported) return 1;

                return b.localeCompare(a, undefined, { numeric: true });
            });

            // Create framework options
            const options: FrameworkOption[] = [
                {
                    label: 'Auto',
                    description: 'Automatically select the best framework for debugging',
                    detail: 'Auto-selection mode',
                    isSupported: true,
                    value: undefined
                },
                ...sortedFrameworks.map(framework => {
                    const displayName = SolutionService.getFrameworkDisplayName(framework);
                    const isSupported = SolutionService.isFrameworkSupported(framework);

                    return {
                        label: framework,
                        description: displayName,
                        detail: isSupported ? 'Supported framework' : 'Legacy framework',
                        isSupported: isSupported,
                        value: framework
                    };
                })
            ];

            return options;

        } catch (error) {
            log.error('Failed to get framework options:', error);
            return [];
        }
    }

    /**
     * The solution's framework: remembered for the solution (the Dependencies tree and the C# language context of every project that
     * targets it follow), and F5 uses it when the startup project targets it. Auto (undefined) forgets the choice.
     */
    public async setActiveFramework(framework?: string): Promise<void> {
        const currentStartupProject = this.solution?.getStartupProject();
        log.info(`Framework changed to: ${framework ?? 'Auto'}, current startup project: ${currentStartupProject}`);
        if (this.solution?.solutionPath) {
            await FrameworkChoice.set(this.solution.solutionPath, framework);
        }
        if (!currentStartupProject) {
            return;
        }
        // A startup project that does not target the framework keeps its own (the F5 of a net10.0 web app stays when net472 is chosen for a library)
        const targets = this.solution?.projects.get(currentStartupProject)?.frameworks ?? [];
        if (framework && !targets.includes(framework)) {
            return;
        }
        try {
            await DebugConfigService.updateStartupConfiguration(currentStartupProject, framework);
        } catch (error) {
            log.error('Error updating startup configuration after framework change:', error);
        }
    }

    /**
     * Gets the display name for a framework.
     */
    public getFrameworkDisplayName(framework: string): string {
        return SolutionService.getFrameworkDisplayName(framework);
    }
}