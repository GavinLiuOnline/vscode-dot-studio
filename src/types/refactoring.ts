/** Messages of the refactoring picker tab (a form in the main editor area); browser-safe (no vscode, no Node imports) */

/** A member of the type that a refactoring can take along */
export interface MemberInfo {
    /** Identifies the member to the server; opaque to the form */
    id: string;
    kind: 'method' | 'property' | 'event' | 'field' | 'constructor' | 'type';
    /** The member as it is written (its declaration up to the body) */
    signature: string;
}

/** What Extract Interface asks: the members of the type and a name for the interface */
export interface ExtractInterfaceForm {
    kind: 'extractInterface';
    typeName: string;
    interfaceName: string;
    members: MemberInfo[];
}

export interface ExtractInterfaceChoice {
    kind: 'extractInterface';
    interfaceName: string;
    memberIds: string[];
    /** The interface goes into its own file next to the type (otherwise above the type) */
    newFile: boolean;
}

/** What Extract Members to Partial asks: the members that go to another part of the type, and the name of that part (its file `Type.<name>.cs`) */
export interface ExtractPartialForm {
    kind: 'extractPartial';
    typeName: string;
    partName: string;
    members: MemberInfo[];
}

export interface ExtractPartialChoice {
    kind: 'extractPartial';
    partName: string;
    memberIds: string[];
}

/** The forms the tab can show; every refactoring that needs choices adds one */
export type RefactorForm = ExtractInterfaceForm | ExtractPartialForm;
export type RefactorChoice = ExtractInterfaceChoice | ExtractPartialChoice;

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
