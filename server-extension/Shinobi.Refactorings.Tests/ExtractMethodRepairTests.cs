using Microsoft.CodeAnalysis.Text;

namespace Shinobi.Refactorings.Tests;

/// <summary>
/// The language server's Extract method edits are not available here, so each test writes what the server writes (found with the
/// server of the C# extension on these sources) and lets the repair check it.
/// </summary>
public class ExtractMethodRepairTests
{
    /// <summary>Edits that replace the first occurrence of each old text by the new one, the way the server's edits do.</summary>
    private static List<TextEdit> Edits(string source, params (string Old, string New)[] changes)
    {
        var text = SourceText.From(source);
        return changes.Select(change =>
        {
            var start = source.IndexOf(change.Old, StringComparison.Ordinal);
            Assert.True(start >= 0, $"'{change.Old}' is not in the source");
            var from = text.Lines.GetLinePosition(start);
            var to = text.Lines.GetLinePosition(start + change.Old.Length);
            return new TextEdit(from.Line, from.Character, to.Line, to.Character, change.New);
        }).ToList();
    }

    private static async Task<(ExtractInterfaceResult Result, string Text)> Check(string source, params (string Old, string New)[] changes)
    {
        var h = new Harness(("A.cs", source));
        var result = await ExtractMethodRepair.RunAsync(h.Document("A.cs"), Edits(source, changes), default);
        return (result, Harness.Lf(Harness.Apply(source, result)));
    }

    private const string UserCase = """
        using System.Collections.Generic;

        namespace App;

        public class Translation { public string Value { get; set; } }

        public class Manager
        {
            private readonly Dictionary<string, Dictionary<string, Translation>> map = new();

            public bool TryTranslate(string name, string langKey, out string translation)
            {
                translation = name;
                if (this.map.TryGetValue(name, out var forId)
                    && forId != null
                    && forId.TryGetValue(langKey ?? string.Empty, out var item))
                {
                    translation = item?.Value;
                    return true;
                }

                return false;
            }
            // END
        }
        """;

    private const string UserCall = """
        if (this.map.TryGetValue(name, out var forId)
                    && forId != null
                    && forId.TryGetValue(langKey ?? string.Empty, out var item))
        """;

    [Fact]
    public async Task Assigns_the_out_parameter_the_server_leaves_unassigned_on_the_short_circuit_path()
    {
        var (result, text) = await Check(UserCase,
            (UserCall, "Translation item;\n        if (NewMethod(name, langKey, out item))"),
            ("    // END", """
                private bool NewMethod(string name, string langKey, out Translation item)
                {
                    return this.map.TryGetValue(name, out var forId)
                                && forId != null
                                && forId.TryGetValue(langKey ?? string.Empty, out item);
                }
            """));
        Assert.Null(result.Errors);
        Assert.Contains("{\n        item = default;\n        return this.map", text);
        var h = new Harness(("A.cs", UserCase));
        Assert.Empty(await h.ErrorsAfter(h.Document("A.cs"), result));
    }

    [Fact]
    public async Task Repairs_an_out_var_behind_a_null_check()
    {
        const string source = """
            namespace App;

            public class P
            {
                public int Run(string text)
                {
                    if (text != null && int.TryParse(text, out var n))
                    {
                        return n;
                    }

                    return -1;
                }
                // END
            }
            """;
        var (result, text) = await Check(source,
            ("if (text != null && int.TryParse(text, out var n))", "int n;\n        if (NewMethod(text, out n))"),
            ("    // END", "    private bool NewMethod(string text, out int n)\n    {\n        return text != null && int.TryParse(text, out n);\n    }"));
        Assert.Null(result.Errors);
        Assert.Contains("private bool NewMethod(string text, out int n)\n    {\n        n = default;\n        return text != null", text);
    }

    [Fact]
    public async Task Repairs_every_out_parameter_that_needs_it_in_one_go()
    {
        const string source = """
            namespace App;

            public class P
            {
                public bool Run(string a, string b)
                {
                    if (a != null && int.TryParse(a, out var x) && int.TryParse(b, out var y))
                    {
                        return x < y;
                    }

                    return false;
                }
                // END
            }
            """;
        var (result, text) = await Check(source,
            ("if (a != null && int.TryParse(a, out var x) && int.TryParse(b, out var y))", "int x;\n        int y;\n        if (NewMethod(a, b, out x, out y))"),
            ("    // END", "    private bool NewMethod(string a, string b, out int x, out int y)\n    {\n        return a != null && int.TryParse(a, out x) && int.TryParse(b, out y);\n    }"));
        Assert.Null(result.Errors);
        Assert.Contains("{\n        x = default;\n        y = default;\n        return a != null", text);
    }

    [Fact]
    public async Task Repairs_a_local_function_the_same_way()
    {
        const string source = """
            namespace App;

            public class P
            {
                public bool Run(string text)
                {
                    if (text != null && int.TryParse(text, out var n))
                    {
                        return n > 0;
                    }

                    return false;
                }
            }
            """;
        var (result, text) = await Check(source,
            ("if (text != null && int.TryParse(text, out var n))", "int n;\n        if (NewMethod(text, out n))"),
            ("        return false;\n", "        return false;\n\n        bool NewMethod(string text, out int n)\n        {\n            return text != null && int.TryParse(text, out n);\n        }\n"));
        Assert.Null(result.Errors);
        Assert.Contains("bool NewMethod(string text, out int n)\n        {\n            n = default;\n", text);
    }

    [Fact]
    public async Task Leaves_a_correct_extraction_as_the_server_wrote_it()
    {
        const string source = """
            namespace App;

            public class P
            {
                public bool Run(string text)
                {
                    if (int.TryParse(text, out var n) && n > 0)
                    {
                        return true;
                    }

                    return false;
                }
                // END
            }
            """;
        var edits = new[]
        {
            ("if (int.TryParse(text, out var n) && n > 0)", "int n;\n        if (NewMethod(text, out n))"),
            ("    // END", "    private bool NewMethod(string text, out int n)\n    {\n        return int.TryParse(text, out n) && n > 0;\n    }"),
        };
        var (result, text) = await Check(source, edits);
        Assert.Null(result.Errors);
        Assert.DoesNotContain("default", text);
        Assert.Equal(Edits(source, edits).Select(e => e.NewText), result.Edits.Select(e => e.NewText));
    }

    [Fact]
    public async Task Refuses_what_it_cannot_repair_out_in_an_async_method()
    {
        const string source = """
            using System.Threading.Tasks;

            namespace App;

            public class P
            {
                public async Task<int> Run(string s)
                {
                    int x;
                    x = s.Length;
                    await Task.Delay(1);
                    return x;
                }
                // END
            }
            """;
        var (result, _) = await Check(source,
            ("x = s.Length;\n        await Task.Delay(1);", "await NewMethod(s, out x);"),
            ("    // END", "    private async Task NewMethod(string s, out int x)\n    {\n        x = s.Length;\n        await Task.Delay(1);\n    }"));
        Assert.NotNull(result.Errors);
        Assert.Contains(result.Errors!, e => e.Contains("CS1988"));
    }
}
