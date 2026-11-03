namespace Shinobi.Refactorings.Tests;

public class ExtractSuperclassTests
{
    private static Task<ExtractInterfaceResult?> Run(Harness h, string file, string declaration, string name, string baseName, string[] members, string[]? abstractMembers = null, bool newFile = true)
        => RunAsync(h, file, declaration, name, baseName, members, abstractMembers, newFile);

    /// <summary>Members are named by what their declaration starts with (a member's id is its place and a hash).</summary>
    private static async Task<ExtractInterfaceResult?> RunAsync(Harness h, string file, string declaration, string name, string baseName, string[] members, string[]? abstractMembers, bool newFile)
    {
        var document = h.Document(file);
        var text = (await document.GetTextAsync()).ToString();
        var position = Harness.At(text, declaration, name);
        var info = await ExtractSuperclassEngine.InfoAsync(document, position, default);
        Assert.NotNull(info);
        string IdOf(string start) => info!.Members.Single(m => m.Signature.StartsWith(start) || m.Signature.Contains(start)).Id;
        return await ExtractSuperclassEngine.RunAsync(document,
            new ExtractSuperclassRequest(position, baseName, members.Select(IdOf).ToList(), (abstractMembers ?? []).Select(IdOf).ToList(), newFile), default);
    }

    private static async Task<(ExtractInterfaceResult Result, string Original, string NewFile)> Extracted(string source, string declaration, string name, string[] members, string[]? abstractMembers = null, bool newFile = true, params (string, string)[] others)
    {
        var h = new Harness([("A.cs", source), .. others]);
        var result = await Run(h, "A.cs", declaration, name, name + "Base", members, abstractMembers, newFile);
        Assert.NotNull(result);
        Assert.Null(result!.Errors);
        Assert.Empty(await h.ErrorsAfter(h.Document("A.cs"), result));
        return (result, Harness.Lf(Harness.Apply(source, result)), Harness.Lf(result.NewFileContent ?? ""));
    }

    [Fact]
    public async Task Moves_members_to_a_new_base_class_in_its_own_file()
    {
        const string source = """
            using System.Collections.Generic;

            namespace App;

            public class Foo
            {
                private readonly List<int> _items = new();

                public int Count => _items.Count;

                public void Add(int item) => _items.Add(item);

                public void Other() { }
            }
            """;
        var (result, original, baseFile) = await Extracted(source, "class Foo", "Foo", ["private readonly List<int> _items", "public int Count", "public void Add"]);
        Assert.EndsWith("FooBase.cs", result.NewFilePath);
        Assert.Contains("public class Foo : FooBase", original);
        Assert.Contains("public void Other() { }", original);
        Assert.DoesNotContain("_items", original);
        Assert.Equal("""
            using System.Collections.Generic;

            namespace App;

            public class FooBase
            {
                private readonly List<int> _items = new();

                public int Count => _items.Count;

                public void Add(int item) => _items.Add(item);
            }

            """.Replace("\r\n", "\n"), baseFile);
    }

    [Fact]
    public async Task The_new_base_class_takes_the_old_base_class_and_the_class_keeps_its_interfaces()
    {
        const string source = """
            using System;
            namespace App;
            public class Old { }
            public class Foo : Old, IDisposable
            {
                public int X;
                public void Dispose() { }
            }
            """;
        var (_, original, baseFile) = await Extracted(source, "class Foo", "Foo", ["public int X"]);
        Assert.Contains("public class Foo : FooBase, IDisposable", original);
        Assert.Contains("public class FooBase : Old", baseFile);
    }

    [Fact]
    public async Task A_class_with_interfaces_only_gets_the_base_class_first()
    {
        const string source = """
            using System;
            namespace App;
            public class Foo : IDisposable
            {
                public int X;
                public void Dispose() { }
            }
            """;
        var (_, original, baseFile) = await Extracted(source, "class Foo", "Foo", ["public int X"]);
        Assert.Contains("public class Foo : FooBase, IDisposable", original);
        Assert.Contains("public class FooBase", baseFile);
        Assert.DoesNotContain(": ", baseFile.Split('\n').First(l => l.Contains("class FooBase")));
    }

    [Fact]
    public async Task An_abstract_member_stays_as_an_override_and_the_base_class_is_abstract()
    {
        const string source = """
            namespace App;
            public class Foo
            {
                private int Run(int x) => x * 2;
                public string Name { get; set; } = "";
                public void Go() { Run(1); }
            }
            """;
        var (_, original, baseFile) = await Extracted(source, "class Foo", "Foo", ["private int Run", "public string Name"], ["private int Run", "public string Name"]);
        Assert.Contains("protected override int Run(int x) => x * 2;", original);
        Assert.Contains("public override string Name { get; set; } = \"\";", original);
        Assert.Contains("public abstract class FooBase", baseFile);
        Assert.Contains("protected abstract int Run(int x);", baseFile);
        Assert.Contains("public abstract string Name { get; set; }", baseFile);
    }

    [Fact]
    public async Task A_private_member_that_the_class_still_uses_becomes_protected()
    {
        const string source = """
            namespace App;
            public class Foo
            {
                private int _count;
                private int _hidden;
                public int Next() => ++_count + _hidden;
            }
            """;
        var (_, _, baseFile) = await Extracted(source, "class Foo", "Foo", ["private int _count", "private int _hidden"]);
        Assert.Contains("protected int _count;", baseFile);
        Assert.Contains("protected int _hidden;", baseFile);
    }

    [Fact]
    public async Task A_private_member_used_only_by_moved_members_stays_private()
    {
        const string source = """
            namespace App;
            public class Foo
            {
                private int _count;
                public void Inc() => _count++;
                public void Other() { }
            }
            """;
        var (_, _, baseFile) = await Extracted(source, "class Foo", "Foo", ["private int _count", "public void Inc"]);
        Assert.Contains("private int _count;", baseFile);
    }

    [Fact]
    public async Task A_member_that_uses_a_member_that_stays_is_refused()
    {
        const string source = """
            namespace App;
            public class Foo
            {
                private int _count;
                public void Inc() => _count++;
            }
            """;
        var h = new Harness(("A.cs", source));
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => Run(h, "A.cs", "class Foo", "Foo", "FooBase", ["public void Inc"]));
        Assert.Contains("_count", error.Message);
        Assert.Contains("stays in Foo", error.Message);
    }

    [Fact]
    public async Task The_info_lists_what_a_member_uses()
    {
        const string source = """
            namespace App;
            public class Foo
            {
                private int _count;
                public void Inc() => _count++;
                public void Other() { }
            }
            """;
        var h = new Harness(("A.cs", source));
        var document = h.Document("A.cs");
        var info = (await ExtractSuperclassEngine.InfoAsync(document, Harness.At(source, "class Foo", "Foo"), default))!;
        var inc = info.Members.Single(m => m.Signature.Contains("Inc"));
        var count = info.Members.Single(m => m.Signature.Contains("_count"));
        Assert.Equal([count.Id], inc.Deps);
        Assert.Empty(info.Members.Single(m => m.Signature.Contains("Other")).Deps);
        Assert.True(inc.CanBeAbstract);
        Assert.False(count.CanBeAbstract);
        Assert.Equal("public abstract void Inc();", inc.AbstractSignature);
    }

    [Fact]
    public async Task A_sealed_partial_class_with_an_interface_like_ResourceManager_works()
    {
        const string part1 = """
            using System;
            namespace App;
            public sealed partial class Manager : IDisposable
            {
                private readonly object _lock = new();
                public bool Initialized { get; private set; }
                public void Initialize() { lock (_lock) { Initialized = true; } }
                public void Dispose() { }
            }
            """;
        const string part2 = """
            namespace App;
            public sealed partial class Manager
            {
                public bool Check() => _lock != null && Initialized;
            }
            """;
        var (_, original, baseFile) = await Extracted(part1, "class Manager", "Manager", ["private readonly object _lock", "public bool Initialized", "public void Initialize"], null, true, ("B.cs", part2));
        Assert.Contains("public sealed partial class Manager : ManagerBase, IDisposable", original);
        Assert.Contains("public class ManagerBase", baseFile);
        // the other part uses _lock, so it is no longer private
        Assert.Contains("protected readonly object _lock", baseFile);
    }

    [Fact]
    public async Task Another_part_that_names_a_base_class_refuses()
    {
        const string part1 = "namespace App; public class Old { } public partial class Foo { public int X; }";
        const string part2 = "namespace App; public partial class Foo : Old { }";
        var h = new Harness(("A.cs", part1), ("B.cs", part2));
        var position = Harness.At(part1, "class Foo", "Foo");
        var info = await ExtractSuperclassEngine.InfoAsync(h.Document("A.cs"), position, default);
        Assert.Contains("Another part of Foo (B.cs) names the base class Old", info!.Refusal);
        await Assert.ThrowsAsync<InvalidOperationException>(() => ExtractSuperclassEngine.RunAsync(h.Document("A.cs"), new ExtractSuperclassRequest(position, "FooBase", [info.Members.Count.ToString()], [], true), default));
    }

    [Fact]
    public async Task A_base_class_without_a_parameterless_constructor_refuses()
    {
        const string source = "namespace App; public class Old { public Old(int x) { } } public class Foo : Old { public Foo() : base(1) { } public int X; }";
        var h = new Harness(("A.cs", source));
        var info = await ExtractSuperclassEngine.InfoAsync(h.Document("A.cs"), Harness.At(source, "class Foo", "Foo"), default);
        Assert.Contains("no constructor without arguments", info!.Refusal);
    }

    [Fact]
    public async Task A_constructor_that_passes_arguments_to_the_base_class_refuses()
    {
        const string source = "namespace App; public class Old { public Old() { } public Old(int x) { } } public class Foo : Old { public Foo() : base(1) { } public int X; }";
        var h = new Harness(("A.cs", source));
        var info = await ExtractSuperclassEngine.InfoAsync(h.Document("A.cs"), Harness.At(source, "class Foo", "Foo"), default);
        Assert.Contains("passes arguments to its base class", info!.Refusal);
    }

    [Fact]
    public async Task Structs_records_static_and_nested_types_are_not_offered_or_refused()
    {
        const string source = """
            namespace App;
            public struct S { public int X; }
            public record R(int X);
            public static class St { public static int X; }
            public class Outer { public class Inner { public int X; } }
            """;
        var h = new Harness(("A.cs", source));
        var document = h.Document("A.cs");
        Assert.Null(await ExtractSuperclassEngine.InfoAsync(document, Harness.At(source, "struct S", "S"), default));
        Assert.Null(await ExtractSuperclassEngine.InfoAsync(document, Harness.At(source, "record R", "R"), default));
        Assert.Null(await ExtractSuperclassEngine.InfoAsync(document, Harness.At(source, "class St", "St"), default));
        var nested = await ExtractSuperclassEngine.InfoAsync(document, Harness.At(source, "class Inner", "Inner"), default);
        Assert.Contains("nested type", nested!.Refusal);
    }

    [Fact]
    public async Task The_base_class_can_go_above_the_class_in_the_same_file()
    {
        const string source = """
            namespace App
            {
                /// <summary>A foo.</summary>
                public class Foo
                {
                    public int X;
                    public void Y() { }
                }
            }
            """;
        var (result, original, _) = await Extracted(source, "class Foo", "Foo", ["public int X"], null, false);
        Assert.Null(result.NewFilePath);
        Assert.Contains("    public class FooBase\n    {\n        public int X;\n    }\n\n    /// <summary>A foo.</summary>", original);
        Assert.Contains("public class Foo : FooBase", original);
    }

    [Fact]
    public async Task A_generic_class_keeps_its_type_parameters_and_constraints()
    {
        const string source = """
            namespace App;
            public class Foo<T> where T : class
            {
                public T Value = default!;
                public T Get() => Value;
                public void Other() { }
            }
            """;
        var (_, original, baseFile) = await Extracted(source, "class Foo", "Foo", ["public T Value", "public T Get"]);
        Assert.Contains("public class Foo<T> : FooBase<T> where T : class", original);
        Assert.Contains("public class FooBase<T> where T : class", baseFile);
    }

    [Fact]
    public async Task Only_the_usings_the_moved_members_need_are_copied()
    {
        const string source = """
            using System;
            using System.Collections.Generic;
            using System.Text;
            namespace App;
            public class Foo
            {
                public List<int> Items = new();
                public StringBuilder Sb = new();
            }
            """;
        var (_, _, baseFile) = await Extracted(source, "class Foo", "Foo", ["public List<int> Items"]);
        Assert.Contains("using System.Collections.Generic;", baseFile);
        Assert.DoesNotContain("using System.Text;", baseFile);
        Assert.DoesNotContain("using System;", baseFile);
    }

    [Fact]
    public async Task The_validator_reports_errors_the_edit_would_add()
    {
        // a readonly field that stays assigned in the constructor, moved to the base class: CS0191
        const string source = """
            namespace App;
            public class Foo
            {
                private readonly int _id;
                public Foo() { _id = 1; }
            }
            """;
        var h = new Harness(("A.cs", source));
        var result = await Run(h, "A.cs", "class Foo", "Foo", "FooBase", ["private readonly int _id"]);
        Assert.NotNull(result!.Errors);
        Assert.Contains(result.Errors!, e => e.Contains("CS0191"));
    }

    [Fact]
    public async Task A_private_setter_that_the_class_still_uses_becomes_protected()
    {
        const string source = """
            namespace App;
            public class Foo
            {
                public bool Ready { get; private set; }
                public void Reset() { Ready = false; }
                public bool Hidden { get; private set; }
            }
            """;
        var (_, _, baseFile) = await Extracted(source, "class Foo", "Foo", ["public bool Ready", "public bool Hidden"]);
        Assert.Contains("public bool Ready { get; protected set; }", baseFile);
        Assert.Contains("public bool Hidden { get; private set; }", baseFile);
    }

    [Fact]
    public async Task A_private_property_that_is_used_loses_the_modifier_of_its_private_accessor()
    {
        const string source = """
            namespace App;
            public class Foo
            {
                private int Count { get; private set; }
                public void Inc() { Count++; }
            }
            """;
        var (_, _, baseFile) = await Extracted(source, "class Foo", "Foo", ["private int Count"]);
        Assert.Contains("protected int Count { get; set; }", baseFile);
    }
}
