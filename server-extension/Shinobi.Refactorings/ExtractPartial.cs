using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Extensions;
using Microsoft.CodeAnalysis.Text;

namespace Shinobi.Refactorings;

public sealed record PartialMember(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("kind")] string Kind,
    [property: JsonPropertyName("signature")] string Signature);

public sealed record ExtractPartialInfo(
    [property: JsonPropertyName("typeName")] string TypeName,
    [property: JsonPropertyName("partName")] string PartName,
    [property: JsonPropertyName("members")] IReadOnlyList<PartialMember> Members);

public sealed record ExtractPartialRequest(
    [property: JsonPropertyName("position")] Position Position,
    [property: JsonPropertyName("partName")] string PartName,
    [property: JsonPropertyName("memberIds")] IReadOnlyList<string> MemberIds);

/// <summary>The members of the type under the cursor that can move into another part of it.</summary>
public sealed class ExtractPartialInfoHandler : IExtensionDocumentMessageHandler<TypeAt, ExtractPartialInfo?>
{
    public async Task<ExtractPartialInfo?> ExecuteAsync(TypeAt message, ExtensionMessageContext context, Document document, CancellationToken cancellationToken)
    {
        var found = await ExtractInterfaceSupport.FindTypeAsync(document, message.Position, cancellationToken).ConfigureAwait(false);
        if (found is null) { return null; }
        var (declaration, symbol) = found.Value;
        var members = declaration.Members.Select((m, i) => new PartialMember(PartialSupport.IdOf(m, i), PartialSupport.KindOf(m), PartialSupport.HeaderOf(m))).ToList();
        return new ExtractPartialInfo(symbol.Name, "Part", members);
    }
}

/// <summary>Moves the chosen members to a new file that holds another part of the type; the type (and the types around it) become partial.</summary>
public sealed class ExtractPartialHandler : IExtensionDocumentMessageHandler<ExtractPartialRequest, ExtractInterfaceResult?>
{
    public async Task<ExtractInterfaceResult?> ExecuteAsync(ExtractPartialRequest message, ExtensionMessageContext context, Document document, CancellationToken cancellationToken)
    {
        var found = await ExtractInterfaceSupport.FindTypeAsync(document, message.Position, cancellationToken).ConfigureAwait(false);
        if (found is null || document.FilePath is not { } path) { return null; }
        var (declaration, symbol) = found.Value;
        var root = (CompilationUnitSyntax)(await document.GetSyntaxRootAsync(cancellationToken).ConfigureAwait(false))!;
        var model = (await document.GetSemanticModelAsync(cancellationToken).ConfigureAwait(false))!;
        var text = await document.GetTextAsync(cancellationToken).ConfigureAwait(false);

        var chosen = new HashSet<string>(message.MemberIds);
        var moved = declaration.Members.Where((m, i) => chosen.Contains(PartialSupport.IdOf(m, i))).ToList();
        if (moved.Count != chosen.Count)
        {
            throw new InvalidOperationException("The file changed since the members were listed; try again.");
        }
        if (moved.Count == 0) { return null; }

        var eol = text.ToString().Contains("\r\n") ? "\r\n" : "\n";
        var edits = new List<TextEdit>();

        // the type and every type around it become partial
        var types = declaration.AncestorsAndSelf().OfType<TypeDeclarationSyntax>().Reverse().ToList();
        foreach (var type in types.Where(t => !t.Modifiers.Any(SyntaxKind.PartialKeyword)))
        {
            edits.Add(PartialSupport.Insert(text, type.Keyword.SpanStart, "partial "));
        }

        // the members leave their lines (with the comments above them)
        foreach (var merged in PartialSupport.Merge(moved.Select(m => PartialSupport.LinesOf(text, m))))
        {
            var span = merged;
            // what is left of the type ends at its closing brace: no blank line before it
            if (span.End < text.Length && text.Lines.GetLineFromPosition(span.End).ToString().TrimStart().StartsWith('}'))
            {
                var first = text.Lines.GetLineFromPosition(span.Start).LineNumber;
                if (first > 0 && text.Lines[first - 1].ToString().Trim().Length == 0) { span = TextSpan.FromBounds(text.Lines[first - 1].Start, span.End); }
            }
            var start = text.Lines.GetLinePosition(span.Start);
            var end = text.Lines.GetLinePosition(span.End);
            edits.Add(new TextEdit(start.Line, start.Character, end.Line, end.Character, ""));
        }

        var body = new StringBuilder();
        for (var i = 0; i < moved.Count; i++)
        {
            if (i > 0) { body.Append(eol); }
            body.Append(PartialSupport.TextOf(text, moved[i], eol));
        }

        var usings = PartialSupport.NeededUsings(root, model, moved, cancellationToken);
        var content = PartialSupport.NewFile(root, types, usings, body.ToString(), eol);
        var newPath = Path.Combine(Path.GetDirectoryName(path)!, $"{Path.GetFileNameWithoutExtension(path)}.{message.PartName}.cs");
        return new ExtractInterfaceResult(edits, newPath, content);
    }
}

internal static class PartialSupport
{
    /// <summary>The member's place in the type plus a hash of its text: a changed file does not move the wrong member.</summary>
    public static string IdOf(MemberDeclarationSyntax member, int index)
        => $"{index}:{Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(member.ToString())))[..8]}";

    public static string KindOf(MemberDeclarationSyntax member) => member switch
    {
        MethodDeclarationSyntax or OperatorDeclarationSyntax or ConversionOperatorDeclarationSyntax or DestructorDeclarationSyntax => "method",
        ConstructorDeclarationSyntax => "constructor",
        PropertyDeclarationSyntax or IndexerDeclarationSyntax => "property",
        EventDeclarationSyntax or EventFieldDeclarationSyntax => "event",
        FieldDeclarationSyntax => "field",
        _ => "type",
    };

    /// <summary>The declaration up to its body: attributes and the bodies are left out, one line.</summary>
    public static string HeaderOf(MemberDeclarationSyntax member)
    {
        if (member is BaseFieldDeclarationSyntax field)
        {
            var names = field.Declaration.Variables.Select(v => v.Identifier.Text);
            var prefix = string.Join(" ", field.Modifiers.Select(m => m.Text));
            var evt = field is EventFieldDeclarationSyntax ? "event " : "";
            return $"{(prefix.Length > 0 ? prefix + " " : "")}{evt}{field.Declaration.Type} {string.Join(", ", names)}";
        }
        var attributes = member.ChildNodes().OfType<AttributeListSyntax>().ToList();
        var copy = (attributes.Count > 0 ? member.RemoveNodes(attributes, SyntaxRemoveOptions.KeepNoTrivia)! : member).WithoutTrivia();
        var end = copy.Span.End;
        foreach (var node in copy.ChildNodes())
        {
            if (node is BlockSyntax or ArrowExpressionClauseSyntax or AccessorListSyntax or EqualsValueClauseSyntax)
            {
                end = Math.Min(end, node.SpanStart);
            }
        }
        if (copy is BaseTypeDeclarationSyntax type) { end = Math.Min(end, type.OpenBraceToken.SpanStart); }
        var header = copy.ToString()[..(end - copy.SpanStart)];
        return string.Join(" ", header.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).TrimEnd(';').Trim();
    }

    /// <summary>The lines the member takes, with its doc comment and the line break after it.</summary>
    public static TextSpan LinesOf(SourceText text, MemberDeclarationSyntax member)
    {
        var start = ExtractInterfaceSupport.LineStartBefore(text, member);
        var last = text.Lines.GetLineFromPosition(member.Span.End - 1);
        var end = last.EndIncludingLineBreak;
        var isLast = member.Parent is TypeDeclarationSyntax type && type.Members.Last() == member;
        if (isLast)
        {
            // the blank line before it goes, not the one after (there is none: the type's closing brace follows)
            var first = text.Lines.GetLineFromPosition(start);
            if (first.LineNumber > 0 && text.Lines[first.LineNumber - 1].ToString().Trim().Length == 0) { start = text.Lines[first.LineNumber - 1].Start; }
        }
        else if (end < text.Length && text.Lines.GetLineFromPosition(end).ToString().Trim().Length == 0)
        {
            // a blank line after it goes too, so no double blank line is left behind
            end = text.Lines.GetLineFromPosition(end).EndIncludingLineBreak;
        }
        return TextSpan.FromBounds(start, end);
    }

    /// <summary>Overlapping or touching spans as one, in order: two neighbours that both leave must not make edits that overlap.</summary>
    public static IEnumerable<TextSpan> Merge(IEnumerable<TextSpan> spans)
    {
        TextSpan? current = null;
        foreach (var span in spans.OrderBy(s => s.Start))
        {
            if (current is { } c && span.Start <= c.End) { current = TextSpan.FromBounds(c.Start, Math.Max(c.End, span.End)); }
            else
            {
                if (current is { } done) { yield return done; }
                current = span;
            }
        }
        if (current is { } last) { yield return last; }
    }

    /// <summary>The member as it stands in the file, its comments and the indentation of its first line dropped to the part's body indent.</summary>
    public static string TextOf(SourceText text, MemberDeclarationSyntax member, string eol)
    {
        var span = TextSpan.FromBounds(ExtractInterfaceSupport.LineStartBefore(text, member), text.Lines.GetLineFromPosition(member.Span.End - 1).End);
        return text.ToString(span) + eol;
    }

    public static TextEdit Insert(SourceText text, int position, string newText)
    {
        var p = text.Lines.GetLinePosition(position);
        return new TextEdit(p.Line, p.Character, p.Line, p.Character, newText);
    }

    /// <summary>The usings of the original file that the moved members use.</summary>
    public static List<UsingDirectiveSyntax> NeededUsings(CompilationUnitSyntax root, SemanticModel model, IEnumerable<MemberDeclarationSyntax> moved, CancellationToken ct)
    {
        var namespaces = new HashSet<string>();
        var aliases = new HashSet<string>();
        foreach (var node in moved.SelectMany(m => m.DescendantNodesAndSelf()).OfType<SimpleNameSyntax>())
        {
            var info = model.GetSymbolInfo(node, ct);
            foreach (var symbol in info.Symbol is null ? info.CandidateSymbols : [info.Symbol])
            {
                // a name that is a type, or an extension method (`x.Sum()` needs System.Linq); other members are reached through their type
                var type = symbol as INamedTypeSymbol ?? (symbol is IMethodSymbol { IsExtensionMethod: true } ? symbol.ContainingType : null);
                while (type?.ContainingType is not null) { type = type.ContainingType; }
                if (type?.ContainingNamespace is { IsGlobalNamespace: false } ns) { namespaces.Add(ns.ToDisplayString()); }
            }
            aliases.Add(node.Identifier.Text);
        }
        return root.Usings.Where(u =>
            u.StaticKeyword == default
            && (u.Alias is { } alias ? aliases.Contains(alias.Name.Identifier.Text) : u.Name is not null && namespaces.Contains(u.Name.ToString()))).ToList();
    }

    /// <summary>A file with the usings, the namespace as the original writes it, the types around the type and the moved members.</summary>
    public static string NewFile(CompilationUnitSyntax root, IReadOnlyList<TypeDeclarationSyntax> types, List<UsingDirectiveSyntax> usings, string members, string eol)
    {
        var sb = new StringBuilder();
        foreach (var u in usings) { sb.Append(u.ToString()).Append(eol); }
        if (usings.Count > 0) { sb.Append(eol); }

        var ns = types[0].Ancestors().OfType<BaseNamespaceDeclarationSyntax>().FirstOrDefault();
        var blockNamespace = ns is NamespaceDeclarationSyntax;
        if (ns is not null)
        {
            sb.Append("namespace ").Append(ns.Name).Append(blockNamespace ? eol + "{" : ";").Append(eol);
            if (!blockNamespace) { sb.Append(eol); }
        }

        var depth = blockNamespace ? 1 : 0;
        foreach (var type in types)
        {
            var indent = new string(' ', depth * 4);
            var keyword = type is RecordDeclarationSyntax { ClassOrStructKeyword.RawKind: not 0 } record
                ? $"{record.Keyword.Text} {record.ClassOrStructKeyword.Text}" : type.Keyword.Text;
            sb.Append(indent).Append("partial ").Append(keyword).Append(' ').Append(type.Identifier.Text).Append(type.TypeParameterList?.ToString() ?? "").Append(eol);
            sb.Append(indent).Append('{').Append(eol);
            depth++;
        }

        // the members come with the indentation they had; the type's own indentation is what they should have
        var memberIndent = new string(' ', depth * 4);
        var lines = members.Replace("\r\n", "\n").TrimEnd('\n').Split('\n');
        var common = lines.Where(l => l.Trim().Length > 0).Select(l => l.Length - l.TrimStart().Length).DefaultIfEmpty(0).Min();
        foreach (var line in lines)
        {
            sb.Append(line.Trim().Length == 0 ? "" : memberIndent + line[Math.Min(common, line.Length)..]).Append(eol);
        }

        for (var i = types.Count - 1; i >= 0; i--)
        {
            depth--;
            sb.Append(new string(' ', depth * 4)).Append('}').Append(eol);
        }
        if (blockNamespace) { sb.Append('}').Append(eol); }
        return sb.ToString();
    }
}
