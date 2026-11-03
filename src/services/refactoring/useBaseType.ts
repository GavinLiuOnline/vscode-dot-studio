import { UseBaseTypeForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';

export const USE_BASE_TYPE_COMMAND = 'shinobi.refactor.useBaseType';

/**
 * Use Base Type Where Possible (Rider's): parameters, local variables and private fields of a type name one of its base types or
 * interfaces instead, where only what that has is used. The result is compiled before it is applied; what would not compile stays.
 */
export const USE_BASE_TYPE: TypeRefactoringSpec<UseBaseTypeForm> = {
    command: USE_BASE_TYPE_COMMAND,
    actionTitle: 'Use base type where possible...',
    handler: 'Shinobi.Refactorings.UseBaseType',
    detailsHandler: 'Shinobi.Refactorings.UseBaseTypeCountsHandler',
    detailsProgress: 'Looking for uses of the type...',
    kind: 'useBaseType',
    notOnTypeMessage: 'Put the cursor on the name of a class, struct, record or interface to use its base type where possible.',
    hideWhenRefused: true,
    formOf: info => ({ title: `Use Base Type for ${info.typeName}`, form: { kind: 'useBaseType', ...info } }),
};
