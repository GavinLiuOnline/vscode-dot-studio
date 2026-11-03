# Enhanced refactorings

The C# extension's language server offers most refactorings in the lightbulb menu (Ctrl+.): rename, extract method, generate constructor and many more. This extension adds the ones Visual Studio has and the server lacks. They appear in the same menu, next to the server's own.

Refactorings that need choices ask them in a form in the editor area, like a dialog: it opens as a tab in front of your file. **Extract** (or Enter) applies, **Cancel**, **Esc** or closing the tab drops the refactoring and changes nothing.

## What is added, what is planned

| Refactoring | Visual Studio | Here |
|---|---|---|
| Extract Interface with a dialog (members, name, new file) | Yes | ✅ [Added](#extract-interface) |
| Rename, Extract Method, Extract Base Class, Generate Constructor, Encapsulate Field, Use file-scoped namespace, Use primary constructor, Move Type to File, ... | Yes | ➖ The C# server offers them in Ctrl+. already; not repeated here |
| Move Type to Namespace (pick the namespace) | Yes | 🔜 Planned, the next one: a small form |
| Change Signature (add, remove, reorder parameters and update the callers) | Yes | 🔜 Planned: a form with the parameter list |
| Pull Members Up / Push Members Down (pick members and the base type) | Yes | 🔜 Planned |
| Extract Interface: generic constraints of the type | Yes | 🔜 Planned, a gap of the first version |

Every refactoring here follows the same pattern: the lightbulb entry opens the form, OK applies, Cancel or Esc changes nothing. A refactoring the C# server gets itself later is dropped from here. Ideas go to the [roadmap](roadmap.md) (Phase 45).

## Extract Interface

Put the cursor on the name of a class, struct or record and press Ctrl+. > **Extract interface (choose members)...** (the server's own *Extract interface...* next to it takes every public member without asking).

The form has:
- **New interface name:** `I` plus the type's name; it must be a C# identifier.
- **Generate into:** a **new file** next to the type (`IOrder.cs`, with the usings and the namespace of the type's file; the default, like Visual Studio) or **the same file**, above the type.
- **Select public members to form interface:** the type's public instance methods, properties (indexers too) and events, all checked; **Select all** and **Deselect all**. A preview shows the interface as it will be written, in the colours of your colour theme.

On Extract the interface is created and the type gets it as a base type (`public class Order : IOrder`). Both files are saved (the edited one only when it had no other unsaved changes), so a build sees the new file at once; Ctrl+Z in the type's editor undoes the base type. The new file only holds the usings the interface needs. If the new file already exists you are told and nothing changes. In a project with several target frameworks (`<TargetFrameworks>`) the C# server does not notice new files by itself (the types that use them keep "could not be found" until a reload); the extension touches the project file so the server reads the project again.

Not covered yet: the interface does not get the type's generic constraints, and members with explicit interface implementations or `internal` visibility are not listed.

## Needs

A C# extension that has the language server (`ms-dotnettools.csharp` or `muhammad-sammy.csharp`, with its Roslyn server, not OmniSharp). The refactorings are a small .NET assembly (`out/server-extension/Shinobi.Refactorings.dll`, built with the extension) that the C# extension hands to its server; nothing else is installed.
