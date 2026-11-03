using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Text;

namespace Shinobi.Refactorings.Tests;

/// <summary>A solution in memory with one project of the given files, and the means to apply a refactoring's result and look at it.</summary>
internal sealed class Harness
{
    private static readonly Lazy<IReadOnlyList<MetadataReference>> References = new(() =>
        ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator)
            .Where(p => Path.GetFileName(p) is { } n && (n.StartsWith("System.") || n is "netstandard.dll" or "mscorlib.dll"))
            .Select(p => (MetadataReference)MetadataReference.CreateFromFile(p)).ToList());

    private const string Folder = "/proj";
    private readonly AdhocWorkspace workspace = new();
    public Project Project { get; private set; }

    public Harness(params (string Name, string Text)[] files)
    {
        var project = workspace.AddProject(ProjectInfo.Create(ProjectId.CreateNewId(), VersionStamp.Create(), "P", "P", LanguageNames.CSharp,
            compilationOptions: new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary),
            parseOptions: new CSharpParseOptions(LanguageVersion.Latest),
            metadataReferences: References.Value));
        foreach (var (name, text) in files)
        {
            project = project.AddDocument(name, SourceText.From(text), filePath: Path.Combine(Folder, name)).Project;
        }
        workspace.TryApplyChanges(project.Solution);
        Project = workspace.CurrentSolution.GetProject(project.Id)!;
    }

    public Document Document(string name) => Project.Documents.Single(d => d.Name == name);

    /// <summary>The position of the identifier `name` in the declaration `class Name`/`struct Name`...: the cursor of the refactoring.</summary>
    public static Position At(string text, string declaration, string name)
    {
        var index = text.IndexOf(declaration, StringComparison.Ordinal);
        Assert.True(index >= 0, $"'{declaration}' is not in the source");
        var offset = index + declaration.IndexOf(name, StringComparison.Ordinal);
        var before = text[..offset].Split('\n');
        return new Position(before.Length - 1, before[^1].Length);
    }

    /// <summary>The text of the file with the result's edits applied.</summary>
    public static string Apply(string original, ExtractInterfaceResult result)
    {
        var text = SourceText.From(original);
        var changes = result.Edits
            .Select(e => new TextChange(TextSpan.FromBounds(text.Lines[e.StartLine].Start + e.StartCharacter, text.Lines[e.EndLine].Start + e.EndCharacter), e.NewText))
            .OrderBy(c => c.Span.Start).ToList();
        return text.WithChanges(changes).ToString();
    }

    /// <summary>The errors of the project with the result applied (original file and the new one); empty when it compiles.</summary>
    public async Task<IReadOnlyList<string>> ErrorsAfter(Document document, ExtractInterfaceResult result)
    {
        var solution = Project.Solution.WithDocumentText(document.Id, SourceText.From(Apply((await document.GetTextAsync()).ToString(), result)));
        if (result.NewFilePath is { } path)
        {
            solution = solution.AddDocument(DocumentId.CreateNewId(Project.Id), Path.GetFileName(path), SourceText.From(result.NewFileContent!), filePath: path);
        }
        foreach (var other in result.Others ?? [])
        {
            var target = Project.Documents.Single(d => d.FilePath == other.Path);
            solution = solution.WithDocumentText(target.Id, SourceText.From(Apply((await target.GetTextAsync()).ToString(), new ExtractInterfaceResult(other.Edits, null, null))));
        }
        var compilation = (await solution.GetProject(Project.Id)!.GetCompilationAsync())!;
        return compilation.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).Select(d => d.ToString()).ToList();
    }

    /// <summary>The same source as a string with its line endings made `\n`, for comparisons.</summary>
    public static string Lf(string text) => text.Replace("\r\n", "\n");
}
