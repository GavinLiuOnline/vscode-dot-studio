import { ExtractPartialForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';

export const EXTRACT_PARTIAL_COMMAND = 'shinobi.refactor.extractPartial';

/** Moves members into another part of the type, in a file of its own: `Order.cs` keeps `partial class Order`, `Order.<name>.cs` gets the members */
export const EXTRACT_PARTIAL: TypeRefactoringSpec<ExtractPartialForm> = {
    command: EXTRACT_PARTIAL_COMMAND,
    actionTitle: 'Extract members to partial class...',
    handler: 'Shinobi.Refactorings.ExtractPartial',
    kind: 'extractPartial',
    notOnTypeMessage: 'Put the cursor on the name of a class, struct or record to move members into a partial class.',
    formOf: info => ({ title: `Extract Members from ${info.typeName}`, form: { kind: 'extractPartial', ...info } }),
};
