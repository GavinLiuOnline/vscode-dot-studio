import { ExtractInterfaceForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';

export const EXTRACT_INTERFACE_COMMAND = 'shinobi.refactor.extractInterface';

/** Extract Interface with Visual Studio's choices: the members, the name, a new file */
export const EXTRACT_INTERFACE: TypeRefactoringSpec<ExtractInterfaceForm> = {
    command: EXTRACT_INTERFACE_COMMAND,
    actionTitle: 'Extract interface (choose members)...',
    handler: 'Shinobi.Refactorings.ExtractInterface',
    kind: 'extractInterface',
    notOnTypeMessage: 'Put the cursor on the name of a class, struct or record to extract an interface.',
    formOf: info => ({ title: `Extract Interface from ${info.typeName}`, form: { kind: 'extractInterface', ...info } }),
};
