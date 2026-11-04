import { ExtractSuperclassForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';
import { t } from '../../core/i18n';

export const EXTRACT_SUPERCLASS_COMMAND = 'shinobi.refactor.extractSuperclass';

/**
 * Extract Superclass: a new base class takes members of the class (or declares them abstract), the class derives from it. The C#
 * server's own "Extract base class..." stays in the menu; it breaks on partial classes and the like, this one compiles the
 * result before it is applied and refuses what it cannot do.
 */
export const EXTRACT_SUPERCLASS: TypeRefactoringSpec<ExtractSuperclassForm> = {
    command: EXTRACT_SUPERCLASS_COMMAND,
    actionTitle: t('Extract superclass (choose members)...'),
    handler: 'Shinobi.Refactorings.ExtractSuperclass',
    kind: 'extractSuperclass',
    notOnTypeMessage: t('Put the cursor on the name of a class to extract a superclass.'),
    formOf: info => ({ title: t('Extract Superclass from {0}', info.typeName), form: { kind: 'extractSuperclass', ...info } }),
};
