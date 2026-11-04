namespace Shinobi.Refactorings.Tests;

public class MoveTypeNamespaceTests
{
    private static async Task<(ExtractInterfaceResult Result, Func<string, string> TextOf)> Move(Harness h, string file, string declaration, string name, string target)
    {
        var document = h.Document(file);
        var text = (await document.GetTextAsync()).ToString();
        var result = await MoveTypeNamespaceEngine.RunAsync(document, new MoveTypeNamespaceRequest(Harness.At(text, declaration, name), target), default);
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
    public async Task Renames_the_namespace_and_adds_the_using_to_the_places_that_used_the_type()
    {
        var h = new Harness(
            ("Order.cs", """
                namespace App.Old;

                public class Order { }
                """),
            ("Same.cs", """
                namespace App.Old;

                public class Same { public Order O = new(); }
                """),
            ("Imports.cs", """
                using System;
                using App.Old;

                namespace App.Other;

                public class Imports { public Order O = new(); }
                """),
            ("Inside.cs", """
                namespace App.New;

                public class Inside { public App.New.Order O = new(); }
                """));
        var (_, textOf) = await Move(h, "Order.cs", "class Order", "Order", "App.New");
        Assert.Contains("namespace App.New;", textOf("Order.cs"));
        Assert.Contains("using App.New;", textOf("Same.cs"));
        var imports = textOf("Imports.cs");
        Assert.Contains("using App.New;", imports);
        Assert.Contains("using App.Old;", imports);
        Assert.DoesNotContain("using", textOf("Inside.cs"));
    }

    [Fact]
    public async Task Replaces_the_qualifier_of_a_qualified_name()
    {
        var h = new Harness(
            ("Order.cs", """
                namespace App.Old;

                public class Order { }
                """),
            ("Q.cs", """
                namespace Elsewhere;

                public class Q { public App.Old.Order O = new(); }
                """));
        var (_, textOf) = await Move(h, "Order.cs", "class Order", "Order", "App.New");
        var q = textOf("Q.cs");
        Assert.Contains("public App.New.Order O", q);
        Assert.DoesNotContain("using", q);
    }

    [Fact]
    public async Task The_type_keeps_the_usings_of_what_it_used_from_its_old_namespace_and_the_one_around_it()
    {
        var h = new Harness(
            ("Order.cs", """
                namespace App.Old;

                public class Order { public Line L = new(); public Root R = new(); }
                """),
            ("Line.cs", """
                namespace App.Old;

                public class Line { }
                """),
            ("Root.cs", """
                namespace App;

                public class Root { }
                """));
        var (_, textOf) = await Move(h, "Order.cs", "class Order", "Order", "Shop.Orders");
        var order = textOf("Order.cs");
        Assert.Contains("using App;", order);
        Assert.Contains("using App.Old;", order);
        Assert.Contains("namespace Shop.Orders;", order);
    }

    [Fact]
    public async Task A_type_among_others_in_a_block_namespace_moves_to_a_block_of_its_own()
    {
        var h = new Harness(
            ("Types.cs", """
                namespace App.Old
                {
                    public class First { public Second S = new(); }

                    public class Second { }
                }
                """));
        var (_, textOf) = await Move(h, "Types.cs", "class Second", "Second", "App.New");
        var text = textOf("Types.cs");
        Assert.Contains("namespace App.New", text);
        Assert.Contains("using App.New;", text);
        Assert.True(text.IndexOf("class First") < text.IndexOf("namespace App.New"));
    }

    [Fact]
    public async Task Extension_methods_need_the_using_in_the_callers()
    {
        var h = new Harness(
            ("Ext.cs", """
                namespace App.Old;

                public static class Ext { public static int Twice(this int x) => x * 2; }
                """),
            ("Use.cs", """
                using App.Old;

                namespace App.Use;

                public class Use { public int N() => 2.Twice(); }
                """));
        var (_, textOf) = await Move(h, "Ext.cs", "class Ext", "Ext", "App.New");
        var use = textOf("Use.cs");
        Assert.Contains("using App.New;", use);
        // the type was the last thing in App.Old: the using of it is renamed, not left to dangle
        Assert.DoesNotContain("App.Old", use);
    }

    [Fact]
    public async Task A_using_of_the_emptied_namespace_goes_where_the_file_needs_nothing_from_the_new_one()
    {
        var h = new Harness(
            ("Order.cs", "namespace App.Old;\n\npublic class Order { }\n"),
            ("Idle.cs", "using System;\nusing App.Old;\n\nnamespace App.Idle;\n\npublic class Idle { }\n"));
        var (_, textOf) = await Move(h, "Order.cs", "class Order", "Order", "App.New");
        var idle = textOf("Idle.cs");
        Assert.DoesNotContain("App.Old", idle);
        Assert.Contains("using System;", idle);
    }

    [Fact]
    public async Task A_global_namespace_type_gets_a_namespace_and_a_file_scoped_namespace_with_other_types_is_refused()
    {
        var h = new Harness(("A.cs", "public class Lonely { }\n"));
        var (_, textOf) = await Move(h, "A.cs", "class Lonely", "Lonely", "App");
        Assert.StartsWith("namespace App;", textOf("A.cs"));

        const string many = "namespace Old;\n\npublic class One { }\n\npublic class Two { }\n";
        var h2 = new Harness(("A.cs", many));
        var info = await MoveTypeNamespaceEngine.InfoAsync(h2.Document("A.cs"), Harness.At(many, "class One", "One"), false, default);
        Assert.Contains("own file", info!.Refusal);
    }

    [Fact]
    public async Task Refuses_a_nested_type_a_bad_name_and_the_namespace_it_is_in()
    {
        const string source = "namespace Old;\n\npublic class Outer { public class Inner { } }\n";
        var h = new Harness(("A.cs", source));
        var info = await MoveTypeNamespaceEngine.InfoAsync(h.Document("A.cs"), Harness.At(source, "class Inner", "Inner"), false, default);
        Assert.Contains("nested", info!.Refusal);
        var position = Harness.At(source, "class Outer", "Outer");
        await Assert.ThrowsAsync<InvalidOperationException>(() => MoveTypeNamespaceEngine.RunAsync(h.Document("A.cs"), new MoveTypeNamespaceRequest(position, "not a namespace"), default)!);
        await Assert.ThrowsAsync<InvalidOperationException>(() => MoveTypeNamespaceEngine.RunAsync(h.Document("A.cs"), new MoveTypeNamespaceRequest(position, "Old"), default)!);
    }

    [Fact]
    public async Task Lists_the_namespaces_of_the_source_for_the_form()
    {
        var h = new Harness(("A.cs", "namespace One.Two;\n\npublic class A { }\n"), ("B.cs", "namespace Three\n{\n    namespace Four { public class B { } }\n}\n"));
        var text = "namespace One.Two;\n\npublic class A { }\n";
        var info = await MoveTypeNamespaceEngine.InfoAsync(h.Document("A.cs"), Harness.At(text, "class A", "A"), true, default);
        Assert.Equal(["One.Two", "Three", "Three.Four"], info!.Namespaces);
        Assert.Equal("One.Two", info.Namespace);
    }
}
