import { PushDownForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';
import { t } from '../../core/i18n';

export const PUSH_DOWN_COMMAND = 'shinobi.refactor.pushDown';

/**
 * Push Members Down (Rider's): members of a class move into the classes derived from it (the ones of this solution's source), or the
 * class keeps an abstract declaration and they get the body as an override. The result is compiled before it is applied.
 */
export const PUSH_DOWN: TypeRefactoringSpec<PushDownForm> = {
    command: PUSH_DOWN_COMMAND,
    actionTitle: t('Push members down...'),
    handler: 'Shinobi.Refactorings.PushDown',
    actionKind: 'move',
    kind: 'pushDown',
    notOnTypeMessage: t('Put the cursor on the name of a class or one of its members to push members down.'),
    onMembers: true,
    hideWhenRefused: true,
    formOf: info => ({ title: t('Push Members Down from {0}', info.typeName), form: { kind: 'pushDown', ...info } }),
};
