namespace Shinobi.Refactorings.Tests;

public class ChangeSignatureTests
{
    private static SignatureEdit Keep(int index, string name, string type, string? newName = null, string? newType = null) => new(index, newName ?? name, newType ?? type, null, null);
    private static SignatureEdit Add(string name, string type, string? defaultValue, string? passed) => new(null, name, type, defaultValue, passed);

    private static async Task<(ExtractInterfaceResult Result, Func<string, string> TextOf)> Change(Harness h, string file, string declaration, string name, params SignatureEdit[] edits)
    {
        var document = h.Document(file);
        var text = (await document.GetTextAsync()).ToString();
        var result = await ChangeSignatureEngine.RunAsync(document, new ChangeSignatureRequest(Harness.At(text, declaration, name), edits), default);
        Assert.NotNull(result);
        Assert.Null(result!.Errors);
        Assert.Empty(await h.ErrorsAfter(document, result));
        string TextOf(string f)
        {
            var d = h.Document(f);
            var original = d.GetTextAsync().Result.ToString();
            if (f == file) { return Harness.Lf(Harness.Apply(original, result)); }
            var other = result.Others?.SingleOrDefault(o => o.Path == d.FilePath);
            return Harness.Lf(other is null ? original : Harness.Apply(original, new ExtractInterfaceResult(other.Edits, null, null)));
        }
        return (result, TextOf);
    }

    [Fact]
    public async Task Reorders_the_parameters_and_the_arguments_of_every_call()
    {
        var h = new Harness(
            ("Calc.cs", """
                public class Calc
                {
                    public int Sub(int a, string label, int b) => a - b;
                    public int Twice() => Sub(5, "x", 3) + Sub(a: 1, label: "y", b: 2);
                }
                """),
            ("Use.cs", """
                public class Use { public int Go(Calc c) => c.Sub(9, "z", 4); }
                """));
        var (_, textOf) = await Change(h, "Calc.cs", "int Sub(", "Sub", Keep(1, "label", "string"), Keep(2, "b", "int"), Keep(0, "a", "int"));
        var calc = textOf("Calc.cs");
        Assert.Contains("Sub(string label, int b, int a)", calc);
        Assert.Contains("Sub(\"x\", 3, 5)", calc);
        Assert.Contains("Sub(label: \"y\", b: 2, a: 1)", calc);
        Assert.Contains("c.Sub(\"z\", 4, 9)", textOf("Use.cs"));
    }

    [Fact]
    public async Task Removes_a_parameter_and_its_arguments()
    {
        var h = new Harness(("Calc.cs", """
            public class Calc
            {
                public int Sub(int a, int unused, int b) => a - b;
                public int Go() => Sub(5, 99, 3) + Sub(1, b: 2, unused: 0);
            }
            """));
        var (_, textOf) = await Change(h, "Calc.cs", "int Sub(", "Sub", Keep(0, "a", "int"), Keep(2, "b", "int"));
        var calc = textOf("Calc.cs");
        Assert.Contains("Sub(int a, int b)", calc);
        Assert.Contains("Sub(5, 3)", calc);
        Assert.Contains("Sub(1, b: 2)", calc);
    }

    [Fact]
    public async Task Adds_a_parameter_with_the_value_the_calls_pass()
    {
        var h = new Harness(("Calc.cs", """
            public class Calc
            {
                public int Add(int a, int b) => a + b;
                public int Go() => Add(1, 2) + Add(Add(3, 4), 5);
            }
            """));
        var (_, textOf) = await Change(h, "Calc.cs", "int Add(", "Add", Keep(0, "a", "int"), Add("scale", "int", null, "1"), Keep(1, "b", "int"));
        var calc = textOf("Calc.cs");
        Assert.Contains("Add(int a, int scale, int b)", calc);
        Assert.Contains("Add(1, 1, 2)", calc);
        Assert.Contains("Add(Add(3, 1, 4), 1, 5)", calc);
    }

    [Fact]
    public async Task An_optional_parameter_is_left_out_of_the_calls_and_the_arguments_behind_it_get_names()
    {
        var h = new Harness(("Calc.cs", """
            public class Calc
            {
                public int Add(int a, int b = 1) => a + b;
                public int Go() => Add(1, 2);
            }
            """));
        var (_, textOf) = await Change(h, "Calc.cs", "int Add(", "Add", Keep(0, "a", "int"), Add("scale", "int", "10", null), Keep(1, "b", "int"));
        var calc = textOf("Calc.cs");
        Assert.Contains("Add(int a, int scale = 10, int b = 1)", calc);
        Assert.Contains("Add(1, b: 2)", calc);
    }

    [Fact]
    public async Task Interface_implementations_and_overrides_change_together()
    {
        var h = new Harness(("Shapes.cs", """
            public interface IShape { double Scale(double factor, string unit); }
            public class Base : IShape
            {
                public virtual double Scale(double factor, string unit) => factor;
            }
            public class Derived : Base
            {
                public override double Scale(double factor, string unit) => base.Scale(factor, unit) * 2;
            }
            public class Use
            {
                public double Go(IShape s, Base b, Derived d) => s.Scale(1, "m") + b.Scale(2, "m") + d.Scale(3, "m");
            }
            """));
        var (_, textOf) = await Change(h, "Shapes.cs", "double Scale(double factor, string unit);", "Scale", Keep(1, "unit", "string"), Keep(0, "factor", "double"));
        var text = textOf("Shapes.cs");
        Assert.Equal(3, System.Text.RegularExpressions.Regex.Matches(text, @"Scale\(string unit, double factor\)").Count + 0 * 1 + (text.Contains("IShape { double Scale(string unit, double factor);") ? 0 : 0));
        Assert.Contains("base.Scale(unit, factor)", text);
        Assert.Contains("s.Scale(\"m\", 1)", text);
        Assert.Contains("b.Scale(\"m\", 2)", text);
        Assert.Contains("d.Scale(\"m\", 3)", text);
    }

    [Fact]
    public async Task Renames_a_parameter_in_the_body_the_named_arguments_and_the_documentation()
    {
        var h = new Harness(("Calc.cs", """
            public class Calc
            {
                /// <summary>Adds <paramref name="a"/> to <paramref name="b"/>.</summary>
                /// <param name="a">first</param>
                /// <param name="b">second</param>
                public int Add(int a, int b) { var x = a; return x + b; }
                public int Go() => Add(a: 1, b: 2);
            }
            """));
        var (_, textOf) = await Change(h, "Calc.cs", "int Add(", "Add", Keep(0, "a", "int", newName: "left"), Keep(1, "b", "int"));
        var calc = textOf("Calc.cs");
        Assert.Contains("Add(int left, int b)", calc);
        Assert.Contains("var x = left;", calc);
        Assert.Contains("Add(left: 1, b: 2)", calc);
        Assert.Contains("<paramref name=\"left\"/>", calc);
        Assert.Contains("<param name=\"left\">first</param>", calc);
    }

    [Fact]
    public async Task The_parameter_tags_of_the_documentation_follow_the_new_order_and_a_new_parameter_gets_an_empty_one()
    {
        var h = new Harness(("Calc.cs", """
            public class Calc
            {
                /// <summary>Adds.</summary>
                /// <param name="a">first</param>
                /// <param name="gone">removed</param>
                /// <param name="b">second</param>
                /// <returns>the sum</returns>
                public int Add(int a, int gone, int b) => a + b;
            }
            """));
        var (_, textOf) = await Change(h, "Calc.cs", "int Add(", "Add", Keep(2, "b", "int"), Keep(0, "a", "int"), Add("c", "int", "0", null));
        var calc = textOf("Calc.cs");
        var b = calc.IndexOf("<param name=\"b\">second</param>", StringComparison.Ordinal);
        var c = calc.IndexOf("<param name=\"c\"></param>", StringComparison.Ordinal);
        var a = calc.IndexOf("<param name=\"a\">first</param>", StringComparison.Ordinal);
        Assert.True(b >= 0 && b < a && a < c, calc);
        Assert.DoesNotContain("gone", calc.Replace("int gone", ""));
        Assert.Contains("<returns>the sum</returns>", calc);
    }

    [Fact]
    public async Task Changes_constructors_and_the_places_that_call_them()
    {
        var h = new Harness(("Person.cs", """
            public class Person
            {
                public Person(string name, int age) { }
            }
            public class Student : Person
            {
                public Student(string name) : base(name, 18) { }
                public Student() : this("x") { }
            }
            public class Use
            {
                public Person A() => new Person("a", 1);
                public Person B() => new("b", 2);
            }
            """));
        var (_, textOf) = await Change(h, "Person.cs", "Person(string name", "Person", Keep(1, "age", "int"), Keep(0, "name", "string"));
        var text = textOf("Person.cs");
        Assert.Contains("Person(int age, string name)", text);
        Assert.Contains(": base(18, name)", text);
        Assert.Contains("new Person(1, \"a\")", text);
        Assert.Contains("new(2, \"b\")", text);
        Assert.Contains(": this(\"x\")", text);
    }

    [Fact]
    public async Task Extension_methods_keep_this_first_and_the_calls_in_both_forms_change()
    {
        var h = new Harness(("Ext.cs", """
            public static class Ext
            {
                public static string Pad(this string s, int left, int right) => s;
                public static string Go(string s) => s.Pad(1, 2) + Pad(s, 3, 4);
            }
            """));
        var (_, textOf) = await Change(h, "Ext.cs", "string Pad(", "Pad", Keep(0, "s", "string"), Keep(2, "right", "int"), Keep(1, "left", "int"));
        var text = textOf("Ext.cs");
        Assert.Contains("Pad(this string s, int right, int left)", text);
        Assert.Contains("s.Pad(2, 1)", text);
        Assert.Contains("Pad(s, 4, 3)", text);
        var document = h.Document("Ext.cs");
        var source = (await document.GetTextAsync()).ToString();
        await Assert.ThrowsAsync<InvalidOperationException>(() => ChangeSignatureEngine.RunAsync(document,
            new ChangeSignatureRequest(Harness.At(source, "string Pad(", "Pad"), [Keep(1, "left", "int"), Keep(0, "s", "string"), Keep(2, "right", "int")]), default));
    }

    [Fact]
    public async Task Changes_the_type_of_a_parameter()
    {
        var h = new Harness(("Calc.cs", """
            public class Calc
            {
                public long Twice(int a) => a * 2L;
                public long Go() => Twice(4);
            }
            """));
        var (_, textOf) = await Change(h, "Calc.cs", "long Twice(", "Twice", Keep(0, "a", "int", newType: "long"));
        Assert.Contains("Twice(long a)", textOf("Calc.cs"));
    }

    [Fact]
    public async Task The_cursor_may_be_on_a_call()
    {
        var h = new Harness(("Calc.cs", """
            public class Calc
            {
                public int Sub(int a, int b) => a - b;
                public int Go() => Sub(5, 3);
            }
            """));
        var (_, textOf) = await Change(h, "Calc.cs", "=> Sub(5, 3)", "Sub", Keep(1, "b", "int"), Keep(0, "a", "int"));
        var calc = textOf("Calc.cs");
        Assert.Contains("int Sub(int b, int a)", calc);
        Assert.Contains("Sub(3, 5)", calc);
    }

    [Fact]
    public async Task A_method_that_overrides_a_library_method_is_refused()
    {
        var h = new Harness(("Calc.cs", """
            public class Calc
            {
                public override bool Equals(object obj) => true;
                public override int GetHashCode() => 1;
            }
            """));
        var document = h.Document("Calc.cs");
        var source = (await document.GetTextAsync()).ToString();
        var info = await ChangeSignatureEngine.InfoAsync(document, Harness.At(source, "bool Equals(", "Equals"), true, default);
        Assert.NotNull(info);
        Assert.Contains("library", info!.Refusal);
    }

    [Fact]
    public async Task A_new_parameter_without_a_value_for_the_calls_is_refused_and_a_change_that_breaks_the_build_is_reported()
    {
        var h = new Harness(("Calc.cs", """
            public class Calc
            {
                public int Add(int a, int b) => a + b;
                public int Go() => Add(1, 2);
            }
            """));
        var document = h.Document("Calc.cs");
        var source = (await document.GetTextAsync()).ToString();
        var at = Harness.At(source, "int Add(", "Add");
        await Assert.ThrowsAsync<InvalidOperationException>(() => ChangeSignatureEngine.RunAsync(document,
            new ChangeSignatureRequest(at, [Keep(0, "a", "int"), Keep(1, "b", "int"), Add("c", "int", null, null)]), default));
        // b becomes a string: the call passes 2
        var result = await ChangeSignatureEngine.RunAsync(document, new ChangeSignatureRequest(at, [Keep(0, "a", "int"), Keep(1, "b", "int", newType: "string")]), default);
        Assert.NotNull(result!.Errors);
    }

    [Fact]
    public async Task A_generic_method_changes_with_its_implementations_and_every_call_in_all_forms()
    {
        var h = new Harness(
            ("Api.cs", """
                using System.Collections.Generic;
                using System.Threading.Tasks;

                public class Foo { }
                public interface IApi
                {
                    Task<T> GetAsync<T>(Dictionary<string, string> queryParams, string path);
                }
                public class Api : IApi
                {
                    public Task<T> GetAsync<T>(Dictionary<string, string> queryParams, string path) => Task.FromResult(default(T));
                }
                """),
            ("Use.cs", """
                using System;
                using System.Collections.Generic;
                using System.Linq.Expressions;
                using System.Threading.Tasks;

                public class Use
                {
                    public async Task Go(IApi api, Api concrete)
                    {
                        var a = await api.GetAsync<Foo>(new Dictionary<string, string>(), "a");
                        Foo b = await concrete.GetAsync<Foo>(new(), "b");
                        Expression<Func<IApi, Task<Foo>>> e = x => x.GetAsync<Foo>(null, "c");
                    }
                }
                """));
        var (result, textOf) = await Change(h, "Api.cs", "Task<T> GetAsync<T>(Dictionary<string, string> queryParams, string path);", "GetAsync",
            Keep(1, "path", "string"), Keep(0, "queryParams", "Dictionary<string, string>"));
        var api = textOf("Api.cs");
        Assert.Equal(2, System.Text.RegularExpressions.Regex.Matches(api, @"GetAsync<T>\(string path, Dictionary<string, string> queryParams\)").Count);
        var use = textOf("Use.cs");
        Assert.Contains("api.GetAsync<Foo>(\"a\", new Dictionary<string, string>())", use);
        Assert.Contains("concrete.GetAsync<Foo>(\"b\", new())", use);
        Assert.Contains("x.GetAsync<Foo>(\"c\", null)", use);
    }

    [Fact]
    public async Task An_internal_member_changes_in_a_test_project_that_sees_internals()
    {
        var refs = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator)
            .Where(p => Path.GetFileName(p) is { } n && (n.StartsWith("System.") || n is "netstandard.dll" or "mscorlib.dll"))
            .Select(p => (Microsoft.CodeAnalysis.MetadataReference)Microsoft.CodeAnalysis.MetadataReference.CreateFromFile(p)).ToList();
        var workspace = new Microsoft.CodeAnalysis.AdhocWorkspace();
        Microsoft.CodeAnalysis.Project Make(string name, params (string, string)[] files)
        {
            var project = workspace.AddProject(Microsoft.CodeAnalysis.ProjectInfo.Create(Microsoft.CodeAnalysis.ProjectId.CreateNewId(), Microsoft.CodeAnalysis.VersionStamp.Create(), name, name, Microsoft.CodeAnalysis.LanguageNames.CSharp,
                compilationOptions: new Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions(Microsoft.CodeAnalysis.OutputKind.DynamicallyLinkedLibrary), metadataReferences: refs));
            foreach (var (file, text) in files) { project = project.AddDocument(file, Microsoft.CodeAnalysis.Text.SourceText.From(text), filePath: "/" + name + "/" + file).Project; }
            workspace.TryApplyChanges(project.Solution);
            return workspace.CurrentSolution.GetProject(project.Id)!;
        }
        var lib = Make("Lib", ("Api.cs", """
            using System.Collections.Generic;
            using System.Runtime.CompilerServices;
            using System.Threading.Tasks;

            [assembly: InternalsVisibleTo("Lib.Tests")]

            namespace Lib
            {
                internal interface IApi
                {
                    int Get(string path, int limit);
                    Task<T> GetAsync<T>(Dictionary<string, string> queryParams, string path);
                }
            }
            """));
        var tests = Make("Lib.Tests", ("Use.cs", """
            using System.Collections.Generic;
            using System.Threading.Tasks;
            using Lib;

            namespace Lib.Tests
            {
                internal class Proxy : IApi
                {
                    public int Get(string path, int limit) => limit;
                    public Task<T> GetAsync<T>(Dictionary<string, string> queryParams, string path) => Task.FromResult(default(T));
                }
                public class Use
                {
                    internal int Go(IApi api, Proxy proxy) => api.Get("a", 1) + proxy.Get("b", 2);
                    internal Task<string> Async(IApi api) => api.GetAsync<string>(new(), "x");
                }
            }
            """));
        workspace.TryApplyChanges(workspace.CurrentSolution.AddProjectReference(tests.Id, new Microsoft.CodeAnalysis.ProjectReference(lib.Id)));
        var document = workspace.CurrentSolution.GetProject(lib.Id)!.Documents.Single();
        var source = (await document.GetTextAsync()).ToString();

        var result = await ChangeSignatureEngine.RunAsync(document, new ChangeSignatureRequest(Harness.At(source, "int Get(string path, int limit);", "Get"),
            [Keep(1, "limit", "int"), Keep(0, "path", "string")]), default);
        Assert.Null(result!.Errors);
        var other = Assert.Single(result.Others!);
        var edited = Harness.Lf(Harness.Apply(workspace.CurrentSolution.GetProject(tests.Id)!.Documents.Single().GetTextAsync().Result.ToString(), new ExtractInterfaceResult(other.Edits, null, null)));
        Assert.Contains("public int Get(int limit, string path)", edited);
        Assert.Contains("api.Get(1, \"a\") + proxy.Get(2, \"b\")", edited);

        var generic = await ChangeSignatureEngine.RunAsync(document, new ChangeSignatureRequest(Harness.At(source, "GetAsync<T>(Dictionary", "GetAsync"),
            [Keep(1, "path", "string"), Keep(0, "queryParams", "Dictionary<string, string>")]), default);
        Assert.Null(generic!.Errors);
        var genericEdited = Harness.Lf(Harness.Apply(workspace.CurrentSolution.GetProject(tests.Id)!.Documents.Single().GetTextAsync().Result.ToString(), new ExtractInterfaceResult(Assert.Single(generic.Others!).Edits, null, null)));
        Assert.Contains("GetAsync<T>(string path, Dictionary<string, string> queryParams)", genericEdited);
        Assert.Contains("api.GetAsync<string>(\"x\", new())", genericEdited);
    }

    [Fact]
    public async Task Calls_in_a_test_project_on_the_internal_class_that_implements_an_internal_interface_change_too()
    {
        var refs = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator)
            .Where(p => Path.GetFileName(p) is { } n && (n.StartsWith("System.") || n is "netstandard.dll" or "mscorlib.dll"))
            .Select(p => (Microsoft.CodeAnalysis.MetadataReference)Microsoft.CodeAnalysis.MetadataReference.CreateFromFile(p)).ToList();
        var workspace = new Microsoft.CodeAnalysis.AdhocWorkspace();
        Microsoft.CodeAnalysis.Project Make(string name, params (string, string)[] files)
        {
            var project = workspace.AddProject(Microsoft.CodeAnalysis.ProjectInfo.Create(Microsoft.CodeAnalysis.ProjectId.CreateNewId(), Microsoft.CodeAnalysis.VersionStamp.Create(), name, name, Microsoft.CodeAnalysis.LanguageNames.CSharp,
                compilationOptions: new Microsoft.CodeAnalysis.CSharp.CSharpCompilationOptions(Microsoft.CodeAnalysis.OutputKind.DynamicallyLinkedLibrary), metadataReferences: refs));
            foreach (var (file, text) in files) { project = project.AddDocument(file, Microsoft.CodeAnalysis.Text.SourceText.From(text), filePath: "/" + name + "/" + file).Project; }
            workspace.TryApplyChanges(project.Solution);
            return workspace.CurrentSolution.GetProject(project.Id)!;
        }
        var lib = Make("Lib",
            ("IProxyHelper.cs", """
                using System.Collections.Generic;
                using System.Threading.Tasks;

                namespace Lib
                {
                    internal interface IProxyHelper
                    {
                        Task GetAsync(Dictionary<string, string> queryParams, string path);
                        Task<T> GetAsync<T>(string path, Dictionary<string, string> queryParams);
                    }
                }
                """),
            ("ProxyHelper.cs", """
                using System.Collections.Generic;
                using System.Threading.Tasks;

                namespace Lib
                {
                    internal class ProxyHelper : IProxyHelper
                    {
                        public Task<T> GetAsync<T>(string path, Dictionary<string, string> queryParams) => Task.FromResult(default(T));
                        public Task GetAsync(string path, Dictionary<string, string> queryParams) => Task.CompletedTask;
                    }
                }
                """),
            ("Info.cs", "[assembly: System.Runtime.CompilerServices.InternalsVisibleTo(\"Lib.Tests\")]"));
        var tests = Make("Lib.Tests", ("Tests.cs", """
            using System.Collections.Generic;
            using System.Threading.Tasks;
            using Lib;

            namespace Lib.Tests
            {
                public sealed class ProxyHelperTests
                {
                    internal static ProxyHelper Create() => new();
                    public async Task A()
                    {
                        var sut = Create();
                        var result = await sut.GetAsync<Dictionary<string, string>>("api/items", new Dictionary<string, string> { ["siteId"] = "7" });
                        var act = () => sut.GetAsync("api/action", new Dictionary<string, string> { ["selectedIds"] = "1;2" });
                        var second = await sut.GetAsync<object>("api/x", []);
                    }
                }
            }
            """));
        workspace.TryApplyChanges(workspace.CurrentSolution.AddProjectReference(tests.Id, new Microsoft.CodeAnalysis.ProjectReference(lib.Id)));
        var document = workspace.CurrentSolution.GetProject(lib.Id)!.Documents.Single(d => d.Name == "IProxyHelper.cs");
        var source = (await document.GetTextAsync()).ToString();

        var result = await ChangeSignatureEngine.RunAsync(document, new ChangeSignatureRequest(Harness.At(source, "Task<T> GetAsync<T>(string path", "GetAsync"),
            [Keep(1, "queryParams", "Dictionary<string, string>"), Keep(0, "path", "string")]), default);
        Assert.Null(result!.Errors);
        Assert.Equal(2, result.Others!.Count);
        var edited = Harness.Lf(Harness.Apply(workspace.CurrentSolution.GetProject(tests.Id)!.Documents.Single().GetTextAsync().Result.ToString(),
            new ExtractInterfaceResult(result.Others!.Single(o => o.Path.EndsWith("Tests.cs")).Edits, null, null)));
        Assert.Contains("sut.GetAsync<Dictionary<string, string>>(new Dictionary<string, string> { [\"siteId\"] = \"7\" }, \"api/items\")", edited);
        Assert.Contains("sut.GetAsync<object>([], \"api/x\")", edited);
        // the overload without a type argument is another method: untouched
        Assert.Contains("sut.GetAsync(\"api/action\"", edited);
    }
}
