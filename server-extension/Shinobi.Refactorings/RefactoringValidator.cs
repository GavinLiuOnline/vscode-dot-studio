using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Text;

namespace Shinobi.Refactorings;

/// <summary>
/// What every refactoring of ours does before its edits are handed out: apply them to a copy of the solution, compile, and
/// compare the errors with those before. An edit that adds errors is not applied (the extension shows them): the Roslyn server's
/// own refactorings can produce code that does not compile, ours must not.
/// </summary>
public static class RefactoringValidator
{
    /// <summary>The result with the errors the edits would add (none: <c>Errors</c> stays null).</summary>
    public static async Task<ExtractInterfaceResult> CheckAsync(Document document, ExtractInterfaceResult result, CancellationToken ct)
    {
        var errors = await NewErrorsAsync(document, result, ct).ConfigureAwait(false);
        return errors.Count == 0 ? result : result with { Errors = errors };
    }

    public static async Task<IReadOnlyList<string>> NewErrorsAsync(Document document, ExtractInterfaceResult result, CancellationToken ct)
        => (await NewDiagnosticsAsync(document, result, ct).ConfigureAwait(false)).Added.Select(Describe).ToList();

    /// <summary>The document with the result applied (in its forked solution) and the errors the result adds to the project.</summary>
    public static async Task<(Document? After, IReadOnlyList<Diagnostic> Added)> NewDiagnosticsAsync(Document document, ExtractInterfaceResult result, CancellationToken ct)
    {
        var project = document.Project;
        var before = await project.GetCompilationAsync(ct).ConfigureAwait(false);
        if (before is null) { return (null, []); }

        var text = await document.GetTextAsync(ct).ConfigureAwait(false);
        var changes = result.Edits
            .Select(e => new TextChange(TextSpan.FromBounds(text.Lines[e.StartLine].Start + e.StartCharacter, text.Lines[e.EndLine].Start + e.EndCharacter), e.NewText))
            .OrderBy(c => c.Span.Start)
            .ToList();
        var solution = project.Solution.WithDocumentText(document.Id, text.WithChanges(changes));
        if (result.NewFilePath is { } path && result.NewFileContent is { } content && project.Documents.All(d => !string.Equals(d.FilePath, path, StringComparison.OrdinalIgnoreCase)))
        {
            solution = solution.AddDocument(DocumentId.CreateNewId(project.Id), Path.GetFileName(path), SourceText.From(content), filePath: path);
        }
        var after = await solution.GetProject(project.Id)!.GetCompilationAsync(ct).ConfigureAwait(false);
        if (after is null) { return (null, []); }

        var known = Errors(before).GroupBy(Key).ToDictionary(g => g.Key, g => g.Count());
        var added = new List<Diagnostic>();
        foreach (var diagnostic in Errors(after))
        {
            var key = Key(diagnostic);
            if (known.TryGetValue(key, out var left) && left > 0) { known[key] = left - 1; continue; }
            added.Add(diagnostic);
        }
        return (solution.GetDocument(document.Id), added);
    }

    public static string Describe(Diagnostic diagnostic)
    {
        var span = diagnostic.Location.GetLineSpan();
        return $"{Path.GetFileName(span.Path)}({span.StartLinePosition.Line + 1},{span.StartLinePosition.Character + 1}): {diagnostic.Id}: {diagnostic.GetMessage()}";
    }

    private static IEnumerable<Diagnostic> Errors(Compilation compilation)
        => compilation.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error);

    // positions move with the edits: an error is the same one when it has the same code, message and file
    private static string Key(Diagnostic d) => $"{d.Id}|{Path.GetFileName(d.Location.GetLineSpan().Path)}|{d.GetMessage()}";
}
