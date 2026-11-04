import { ExtractClassForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';
import { t } from '../../core/i18n';

export const EXTRACT_CLASS_COMMAND = 'shinobi.refactor.extractClass';

/**
 * Extract Class (Rider's): the chosen members move to a new class; the class keeps a field of it, uses of the moved members inside the
 * class go through the field, and what others could reach stays as a forwarding member, so no caller changes. The result is compiled
 * before it is applied; what it cannot do is refused with the reason.
 */
export const EXTRACT_CLASS: TypeRefactoringSpec<ExtractClassForm> = {
    command: EXTRACT_CLASS_COMMAND,
    actionTitle: t('Extract class (choose members)...'),
    handler: 'Shinobi.Refactorings.ExtractClass',
    kind: 'extractClass',
    notOnTypeMessage: t('Put the cursor on the name of a class to extract a class from it.'),
    formOf: info => ({ title: t('Extract Class from {0}', info.typeName), form: { kind: 'extractClass', ...info } }),
};
