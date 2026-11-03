using System.Composition;
using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CodeActions;
using Microsoft.CodeAnalysis.CodeRefactorings;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;

namespace Shinobi.Refactorings;

/// <summary>Spike: "Extract interface (all public members)" on the name of a class, appended to the same file.</summary>
[ExportCodeRefactoringProvider(LanguageNames.CSharp, Name = nameof(ExtractInterfaceAllProvider)), Shared]
internal sealed class ExtractInterfaceAllProvider : CodeRefactoringProvider
{
    [ImportingConstructor]
    [Obsolete("This exported object must be obtained through the MEF export provider.", error: true)]
    public ExtractInterfaceAllProvider() { }

    public override async Task ComputeRefactoringsAsync(CodeRefactoringContext context)
    {
        var root = await context.Document.GetSyntaxRootAsync(context.CancellationToken).ConfigureAwait(false);
        var token = root?.FindToken(context.Span.Start);
        if (token?.Parent is not ClassDeclarationSyntax cls || cls.Identifier != token)
        {
            return;
        }
        context.RegisterRefactoring(CodeAction.Create(
            $"Shinobi: Extract interface I{cls.Identifier.Text} (all public members)",
            ct => ExtractAsync(context.Document, cls, ct),
            nameof(ExtractInterfaceAllProvider)));
    }

    private static async Task<Document> ExtractAsync(Document document, ClassDeclarationSyntax cls, CancellationToken ct)
    {
        var model = await document.GetSemanticModelAsync(ct).ConfigureAwait(false);
        var symbol = model!.GetDeclaredSymbol(cls, ct)!;
        var name = "I" + symbol.Name;
        var body = new StringBuilder();
        foreach (var member in symbol.GetMembers())
        {
            if (member.DeclaredAccessibility != Accessibility.Public || member.IsStatic || member.IsImplicitlyDeclared) { continue; }
            switch (member)
            {
                case IMethodSymbol { MethodKind: MethodKind.Ordinary } method:
                    body.AppendLine($"    {method.ReturnType.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat)} {method.Name}({string.Join(", ", method.Parameters.Select(p => $"{p.Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat)} {p.Name}"))});");
                    break;
                case IPropertySymbol { IsIndexer: false } property:
                    body.AppendLine($"    {property.Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat)} {property.Name} {{ {(property.GetMethod is not null ? "get; " : "")}{(property.SetMethod is not null ? "set; " : "")}}}");
                    break;
            }
        }
        var interfaceText = $"\npublic interface {name}\n{{\n{body}}}\n";
        var text = await document.GetTextAsync(ct).ConfigureAwait(false);
        var newText = text.Replace(new TextSpan(cls.Span.End, 0), interfaceText);
        return document.WithText(newText);
    }
}
