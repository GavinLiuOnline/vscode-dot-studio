# Enhanced refactorings

The C# extension's language server offers most refactorings in the lightbulb menu (Ctrl+.): rename, extract method, generate constructor and many more. This extension adds the ones Visual Studio has and the server lacks. They appear in the same menu, next to the server's own.

Refactorings that need choices ask them in a form in the editor area, like a dialog: it opens as a tab in front of your file. **Extract** (or Enter) applies, **Cancel**, **Esc** or closing the tab drops the refactoring and changes nothing.

## What is added, what is planned

| Refactoring | Visual Studio | Here |
|---|---|---|
| Extract Interface with a dialog (members, name, new file) | Yes | ✅ [Added](#extract-interface) |
| Extract Members to Partial Class (pick members, they move to `Type.<Name>.cs`) | No (Rider) | ✅ [Added](#extract-members-to-partial-class) |
| Extract Superclass (pick members, per member "make abstract"; the result is compiled before it is applied) | Yes (Extract Base Class) | ✅ [Added](#extract-superclass) |
| Extract Method / Extract Local Function with the compiler's check (the server's own makes uncompilable `out` parameters) | Yes | ✅ [Added](#extract-method-checked) |
| Rename, Generate Constructor, Encapsulate Field, Use file-scoped namespace, Use primary constructor, Move Type to File, ... | Yes | ➖ The C# server offers them in Ctrl+. already; not repeated here |
| Pull Members Up (pick members and the base class or interface, with a warning for members that use what stays) | Yes | 🔜 Planned |
| Use Base Type Where Possible (a checkbox of Extract Interface and Extract Superclass) | No (Rider) | 🔜 Planned |
| Push Members Down (pick members and the derived types) | No (Rider) | 🔜 Planned |
| Convert Abstract Class ↔ Interface | No (Rider) | 🔜 Planned |
| Extract Class (members go to a new class the type delegates to) | No (Rider) | 🔜 Planned, last: it rewrites references |
| Move Type to Namespace (pick the namespace) | Yes | 🔜 Planned: a small form |
| Change Signature (add, remove, reorder parameters and update the callers) | Yes | 🔜 Planned: a form with the parameter list |
| Extract Interface: generic constraints of the type | Yes | 🔜 Planned, a gap of the first version |

The order is by cost, cheapest first (Phase 45 in the [roadmap](roadmap.md)). Every refactoring here follows the same pattern: the lightbulb entry opens the form, the confirm button applies, Cancel or Esc changes nothing. A refactoring the C# server gets itself later is dropped from here. Ideas go to the [roadmap](roadmap.md) (Phase 45).

## Extract Interface

Put the cursor on the name of a class, struct or record and press Ctrl+. > **Extract interface (choose members)...** (the server's own *Extract interface...* next to it takes every public member without asking).

The form has:
- **New interface name:** `I` plus the type's name; it must be a C# identifier.
- **Generate into:** a **new file** next to the type (`IOrder.cs`, with the usings and the namespace of the type's file; the default, like Visual Studio) or **the same file**, above the type.
- **Select public members to form interface:** the type's public instance methods, properties (indexers too) and events, all checked; **Select all** and **Deselect all**. A preview shows the interface as it will be written, in the colours of your colour theme.

On Extract the interface is created and the type gets it as a base type (`public class Order : IOrder`). Both files are saved (the edited one only when it had no other unsaved changes), so a build sees the new file at once; Ctrl+Z in the type's editor undoes the base type. The new file only holds the usings the interface needs. If the new file already exists you are told and nothing changes. In a project with several target frameworks (`<TargetFrameworks>`) the C# server does not notice new files by itself (the types that use them keep "could not be found" until a reload); the extension touches the project file so the server reads the project again.

Not covered yet: the interface does not get the type's generic constraints, and members with explicit interface implementations or `internal` visibility are not listed.

## Extract Members to Partial Class

Put the cursor on the name of a class, struct or record and press Ctrl+. > **Extract members to partial class...** to split a big type into files without changing it.

The form has the **name of the part** (`Part` by default; the file is `Order.Part.cs`, next to the type, in the same namespace and namespace style), the members to move (fields, constructors, methods, properties, events and nested types, each with its kind; **Select all** and **Deselect all**), and a preview of the new part with the bodies folded.

**Move** makes the type `partial` (and the types around it when it is nested), takes the chosen members out of the file together with their comments and attributes, and writes them into the new file with the `using`s they need. Nothing else changes: no references are touched, the type is the same type. Both files are saved. The new part repeats `partial`, the keyword, the name and the type parameters of the type; accessibility, base types and constraints stay with the first part.

## Extract Superclass

Put the cursor on the name of a class and press Ctrl+. > **Extract superclass (choose members)...** The server's own *Extract base class...* stays in the menu; it takes no choices and can produce code that does not compile (on a partial class with an interface it rewrote a whole file with dozens of duplicate `using` lines). Prefer this one.

The form has the **name of the base class** (`<Type>Base`), **Generate into** (a new file next to the type, or the same file above it), and the members to move up (none are checked at first). Methods and properties have an **abstract** box: the base class then only declares the member abstract and the type keeps its body as an `override`. A preview shows the base class.

What it does:
- the base class takes the type's old base class (`Foo : Old` becomes `Foo : FooBase` and `FooBase : Old`), the type keeps its interfaces (`Foo : FooBase, IDisposable`), type parameters and their constraints are repeated, it is `abstract` when a member is declared abstract, and the usings it needs are copied;
- a **private** member that the type (or another part of it) still uses becomes `protected`, so do private accessors (`{ get; private set; }`); private members that only the moved members use stay private;
- a member that uses members that stay behind (`_count` in `Inc()`) cannot reach them from the base class: the form warns and **Move them too** checks what they use, also in turn; the confirm button stays off until that is settled.

What it refuses, with the reason, and never generates half of:
- structs, records and static classes are not offered; a **nested** class is refused (the base class would have to be nested too);
- a class that is **partial** works when no *other* part names a base class (the type keeps `: Base` on the part you extract from; members of this part only are listed, the other parts may use what moves, they are checked); otherwise the message names the part;
- a base class without a constructor without arguments, and constructors that call `base(...)` with arguments: the new base class would need constructors that pass them on, which is not supported yet;
- a member that uses something declared in another part of the type cannot move.

**The result is compiled first** (a fork of the solution in the language server: the changed file and the new one): when the edit would add compiler errors, nothing is applied and a dialog lists the first ones. The same check runs for Extract Interface and Extract Members to Partial. Both files are saved after a successful extraction, as for the other refactorings.

## Extract Method (checked)

Select statements or an expression and press Ctrl+. > **Extract method (checked)...** or **Extract local function (checked)...**, next to the server's own *Extract method* and *Extract local function*. It uses the server's own edit (name `NewMethod`, parameters, placement and the rename afterwards stay the server's) and checks it before it is applied.

Why: the server makes a variable that the selection assigns only on some paths an `out` parameter and does not assign it in the new method, so the result does not compile (CS0177). The typical selection is a condition with `out var` or a pattern variable behind `&&`:

```csharp
if (this.map.TryGetValue(name, out var forId)
    && forId != null
    && forId.TryGetValue(langKey ?? string.Empty, out var item))
```

becomes `NewMethod(name, langKey, out item)` whose body returns the condition and never assigns `item` when `forId` is null. The checked entry compiles the server's edit on a copy of the solution; for every CS0177 on an `out` parameter of the new method it adds `item = default;` as the first line of that method (`default(T)` in projects below C# 7.1), compiles again and applies the result only when it adds no compiler errors.

What it does not repair: `ref` and `out` in `async` methods, iterators and lambdas (CS1988 and friends), and anything else that does not compile. Nothing is applied then, and a dialog lists the first compiler errors; use the server's entry and fix the result by hand, or change the selection. The entries show where the server offers its own (a selection the server cannot extract gets none), and only for the server's English titles.

## Needs

A C# extension that has the language server (`ms-dotnettools.csharp` or `muhammad-sammy.csharp`, with its Roslyn server, not OmniSharp). The refactorings are a small .NET assembly (`out/server-extension/Shinobi.Refactorings.dll`, built with the extension) that the C# extension hands to its server; nothing else is installed.
