/** Messages of the refactoring picker tab (a form in the main editor area); browser-safe (no vscode, no Node imports) */

export interface InterfaceMemberInfo {
    /** Identifies the member to the server (its display string); opaque to the form */
    id: string;
    kind: 'method' | 'property' | 'event';
    /** The member as it is written in the interface */
    signature: string;
}

/** What Extract Interface asks: the members of the type and a name for the interface */
export interface ExtractInterfaceForm {
    kind: 'extractInterface';
    typeName: string;
    interfaceName: string;
    members: InterfaceMemberInfo[];
}

export interface ExtractInterfaceChoice {
    kind: 'extractInterface';
    interfaceName: string;
    memberIds: string[];
    /** The interface goes into its own file next to the type (otherwise above the type) */
    newFile: boolean;
}

/** The forms the tab can show; every refactoring that needs choices adds one */
export type RefactorForm = ExtractInterfaceForm;
export type RefactorChoice = ExtractInterfaceChoice;

/** What a token of the C# preview is; `plain` has no colour */
export type TokenKind = 'keyword' | 'interface' | 'class' | 'method' | 'property' | 'parameter' | 'plain';

/** The colours of the editor's theme for the kinds of tokens of the preview (CSS colours); a missing kind is the plain text colour */
export type SyntaxPalette = Partial<Record<Exclude<TokenKind, 'plain'>, string>>;

/** Webview → extension */
export type RefactorRequest =
    | { type: 'ready' }
    | { type: 'submit'; choice: RefactorChoice }
    | { type: 'cancel' };

/** Extension → webview */
export type RefactorMessage = { type: 'form'; title: string; form: RefactorForm; palette?: SyntaxPalette };
