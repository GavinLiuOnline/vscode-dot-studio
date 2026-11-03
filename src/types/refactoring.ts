/** Messages of the refactoring picker tab (a form in the main editor area); browser-safe (no vscode, no Node imports) */

/** A member of the type that a refactoring can take along */
export interface MemberInfo {
    /** Identifies the member to the server; opaque to the form */
    id: string;
    kind: 'method' | 'property' | 'event' | 'field' | 'constructor' | 'type';
    /** The member as it is written (its declaration up to the body) */
    signature: string;
    /** Extract Superclass: the base class can declare the member abstract, with this declaration (the type keeps its body as an override) */
    canBeAbstract?: boolean;
    abstractSignature?: string;
    /** Extract Superclass: the ids of the members this one uses by their plain name; they have to come along */
    deps?: string[];
    /** Extract Superclass: why the member cannot move */
    blocked?: string;
    /** Pull Members Up: the declaration an interface gets for the member; missing when an interface cannot have it */
    interfaceSignature?: string;
    /** Push Members Down: the ids of the members of the class that use this one; when it leaves and they stay they cannot reach it */
    usedBy?: string[];
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
    /** Name the interface instead of the type where only its members are used (in parameters, locals and private fields) */
    useBaseType?: boolean;
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

/** What Extract Superclass asks: the name of the base class, where it goes and the members that move to it (or are declared abstract in it) */
export interface ExtractSuperclassForm {
    kind: 'extractSuperclass';
    typeName: string;
    baseName: string;
    members: MemberInfo[];
}

export interface ExtractSuperclassChoice {
    kind: 'extractSuperclass';
    baseName: string;
    /** Every member that goes along: moved, or declared abstract in the base class */
    memberIds: string[];
    /** The members of `memberIds` that stay in the type as overrides of an abstract declaration */
    abstractIds: string[];
    newFile: boolean;
    /** Name the base class instead of the type where only what it has is used */
    useBaseType?: boolean;
}

/** A base class or interface of the solution's source that members can be pulled up to */
export interface PullUpTarget {
    id: string;
    name: string;
    kind: 'class' | 'interface';
    /** "Animal.cs (Shop.Core)" */
    where: string;
    isAbstract: boolean;
}

/** What Pull Members Up asks: where to, and which members; the members in `selected` (the one under the cursor) are checked at the start */
export interface PullUpForm {
    kind: 'pullUp';
    typeName: string;
    targets: PullUpTarget[];
    members: MemberInfo[];
    selected: string[];
}

export interface PullUpChoice {
    kind: 'pullUp';
    targetId: string;
    memberIds: string[];
    /** The members of `memberIds` that the target only declares abstract (the class keeps its body as an override) */
    abstractIds: string[];
}

/** A class derived from the one members are pushed down from */
export interface PushDownDerived {
    id: string;
    name: string;
    /** "Dog.cs (Zoo)" */
    where: string;
}

/** What Push Members Down asks: which members, and to which derived classes */
export interface PushDownForm {
    kind: 'pushDown';
    typeName: string;
    derived: PushDownDerived[];
    members: MemberInfo[];
    selected: string[];
}

export interface PushDownChoice {
    kind: 'pushDown';
    derivedIds: string[];
    memberIds: string[];
    /** The class keeps an abstract declaration of what can be abstract; the chosen derived classes get an override */
    leaveAbstract: boolean;
}

/** A base class or interface a type's uses could name instead */
export interface UseBaseTypeTarget {
    id: string;
    name: string;
    kind: 'class' | 'interface';
    where: string;
    /** How many declarations (parameters, locals, private fields) would name it; -1 when not counted */
    count: number;
    /** ... of them parameters of methods other code can call */
    publicCount: number;
}

/** What Use Base Type Where Possible asks: which base type to use instead of the type */
export interface UseBaseTypeForm {
    kind: 'useBaseType';
    typeName: string;
    targets: UseBaseTypeTarget[];
}

export interface UseBaseTypeChoice {
    kind: 'useBaseType';
    targetId: string;
}

/** The forms the tab can show; every refactoring that needs choices adds one */
export type RefactorForm = ExtractInterfaceForm | ExtractPartialForm | ExtractSuperclassForm | PullUpForm | UseBaseTypeForm | PushDownForm;
export type RefactorChoice = ExtractInterfaceChoice | ExtractPartialChoice | ExtractSuperclassChoice | PullUpChoice | UseBaseTypeChoice | PushDownChoice;

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
