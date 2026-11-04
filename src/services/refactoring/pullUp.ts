import { PullUpForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';
import { t } from '../../core/i18n';

export const PULL_UP_COMMAND = 'shinobi.refactor.pullUp';

/**
 * Pull Members Up (Visual Studio's): members of a class move to a base class or are declared abstract there, or are added to an
 * interface it implements; the targets are the types of this solution's source. The result is compiled before it is applied.
 */
export const PULL_UP: TypeRefactoringSpec<PullUpForm> = {
    command: PULL_UP_COMMAND,
    actionTitle: t('Pull members up...'),
    handler: 'Shinobi.Refactorings.PullUp',
    kind: 'pullUp',
    notOnTypeMessage: t('Put the cursor on the name of a class or one of its members to pull members up.'),
    onMembers: true,
    hideWhenRefused: true,
    formOf: info => ({ title: t('Pull Members Up from {0}', info.typeName), form: { kind: 'pullUp', ...info } }),
};
