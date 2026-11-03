import { ExtractSuperclassForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';

export const EXTRACT_SUPERCLASS_COMMAND = 'shinobi.refactor.extractSuperclass';

/**
 * Extract Superclass: a new base class takes members of the class (or declares them abstract), the class derives from it. The C#
 * server's own "Extract base class..." stays in the menu; it breaks on partial classes and the like, this one compiles the
 * result before it is applied and refuses what it cannot do.
 */
export const EXTRACT_SUPERCLASS: TypeRefactoringSpec<ExtractSuperclassForm> = {
    command: EXTRACT_SUPERCLASS_COMMAND,
    actionTitle: 'Extract superclass (choose members)...',
    handler: 'Shinobi.Refactorings.ExtractSuperclass',
    kind: 'extractSuperclass',
    notOnTypeMessage: 'Put the cursor on the name of a class to extract a superclass.',
    formOf: info => ({ title: `Extract Superclass from ${info.typeName}`, form: { kind: 'extractSuperclass', ...info } }),
};
