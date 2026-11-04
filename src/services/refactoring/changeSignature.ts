import { ChangeSignatureForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';
import { t } from '../../core/i18n';

export const CHANGE_SIGNATURE_COMMAND = 'shinobi.refactor.changeSignature';

/**
 * Change Signature: the parameters of a method or constructor are reordered, removed, added, renamed or given another type. The
 * declaration, the methods it overrides or implements and those that override or implement it, the arguments of every call, the
 * references to a renamed parameter and the parameter tags of the documentation change together. The result is compiled before it is applied.
 */
export const CHANGE_SIGNATURE: TypeRefactoringSpec<ChangeSignatureForm> = {
    command: CHANGE_SIGNATURE_COMMAND,
    actionTitle: t('Change signature...'),
    handler: 'Shinobi.Refactorings.ChangeSignature',
    detailsHandler: 'Shinobi.Refactorings.ChangeSignatureDetailsHandler',
    detailsProgress: t('Looking for the methods that change along...'),
    // a declaration or a call: the server decides whether the cursor is on the name of a method or constructor of the solution's source
    declarationPattern: /[A-Za-z_]\w*\s*(<[^>]*>)?\s*\(/,
    actionKind: 'rewrite',
    hideWhenRefused: true,
    kind: 'changeSignature',
    notOnTypeMessage: t('Put the cursor on the name of a method or constructor to change its signature.'),
    formOf: info => ({ title: t('Change Signature of {0}', info.methodName), form: { kind: 'changeSignature', ...info } }),
};
