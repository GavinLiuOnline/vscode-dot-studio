import { ExtractInterfaceForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';
import { t } from '../../core/i18n';

export const EXTRACT_INTERFACE_COMMAND = 'shinobi.refactor.extractInterface';

/** Extract Interface with Visual Studio's choices: the members, the name, a new file */
export const EXTRACT_INTERFACE: TypeRefactoringSpec<ExtractInterfaceForm> = {
    command: EXTRACT_INTERFACE_COMMAND,
    actionTitle: t('Extract interface (choose members)...'),
    handler: 'Shinobi.Refactorings.ExtractInterface',
    kind: 'extractInterface',
    notOnTypeMessage: t('Put the cursor on the name of a class, struct or record to extract an interface.'),
    formOf: info => ({ title: t('Extract Interface from {0}', info.typeName), form: { kind: 'extractInterface', ...info } }),
};
