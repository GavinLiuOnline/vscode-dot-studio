import { ConvertTypeForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';
import { t } from '../../core/i18n';

export const CONVERT_TYPE_COMMAND = 'shinobi.refactor.convertType';

/**
 * Convert Abstract Class to Interface and back (Rider's): the type keeps its name, the classes that derive from it or implement it
 * lose or gain `override` and get their base list put right. What cannot be done is refused with the reasons; the result is compiled
 * before it is applied.
 */
export const CONVERT_TYPE: TypeRefactoringSpec<ConvertTypeForm> = {
    command: CONVERT_TYPE_COMMAND,
    actionTitle: t('Convert abstract class to interface...'),
    actionTitleOf: info => info.direction === 'toClass' ? t('Convert interface to abstract class...') : t('Convert abstract class to interface...'),
    declarationPattern: /\b(class|interface)\s+[A-Za-z_]\w*/,
    handler: 'Shinobi.Refactorings.ConvertType',
    actionKind: 'rewrite',
    kind: 'convertType',
    notOnTypeMessage: t('Put the cursor on the name of an abstract class or an interface to convert it.'),
    formOf: info => ({
        title: info.direction === 'toClass' ? t('Convert {0} to an Abstract Class', info.typeName) : t('Convert {0} to an Interface', info.typeName),
        form: { kind: 'convertType', ...info },
    }),
};
