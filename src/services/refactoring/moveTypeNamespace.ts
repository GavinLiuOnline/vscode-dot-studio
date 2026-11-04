import { MoveTypeNamespaceForm } from '../../types/refactoring';
import { TypeRefactoringSpec } from './typeRefactoring';
import { t } from '../../core/i18n';

export const MOVE_TYPE_NAMESPACE_COMMAND = 'shinobi.refactor.moveTypeNamespace';

/**
 * Move Type to Namespace: the type's namespace changes to one of your choice (the C# server's own "Change namespace" cannot take one),
 * every place that used the type gets the using it needs or a new qualifier, and the type keeps the usings of what it used from its
 * old namespace. The file stays where it is. The result is compiled before it is applied.
 */
export const MOVE_TYPE_NAMESPACE: TypeRefactoringSpec<MoveTypeNamespaceForm> = {
    command: MOVE_TYPE_NAMESPACE_COMMAND,
    actionTitle: t('Move type to namespace...'),
    handler: 'Shinobi.Refactorings.MoveTypeNamespace',
    detailsHandler: 'Shinobi.Refactorings.MoveTypeNamespaceNamesHandler',
    detailsProgress: t('Looking for the namespaces of the solution...'),
    declarationPattern: /\b(class|struct|record|interface|enum)\s+[A-Za-z_]\w*/,
    kind: 'moveTypeNamespace',
    notOnTypeMessage: t('Put the cursor on the name of a type to move it to another namespace.'),
    formOf: info => ({ title: t('Move {0} to Namespace', info.typeName), form: { kind: 'moveTypeNamespace', ...info } }),
};
