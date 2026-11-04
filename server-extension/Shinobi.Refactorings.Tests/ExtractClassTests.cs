namespace Shinobi.Refactorings.Tests;

public class ExtractClassTests
{
    private static async Task<ExtractInterfaceResult?> Run(Harness h, string source, string name, string className, string[] members, bool newFile = true)
    {
        var document = h.Document("A.cs");
        var position = Harness.At(source, "class " + name, name);
        var info = await ExtractClassEngine.InfoAsync(document, position, default);
        Assert.NotNull(info);
        string IdOf(string start) => info!.Members.Single(m => m.Signature.Contains(start)).Id;
        return await ExtractClassEngine.RunAsync(document, new ExtractClassRequest(position, className, members.Select(IdOf).ToList(), newFile), default);
    }

    private static async Task<(ExtractInterfaceResult Result, string Original, string NewFile)> Extracted(string source, string name, string[] members, bool newFile = true, string className = "Helper")
    {
        var h = new Harness([("A.cs", source)]);
        var result = await Run(h, source, name, className, members, newFile);
        Assert.NotNull(result);
        Assert.Null(result!.Errors);
        Assert.Empty(await h.ErrorsAfter(h.Document("A.cs"), result));
        return (result, Harness.Lf(Harness.Apply(source, result)), Harness.Lf(result.NewFileContent ?? ""));
    }

    [Fact]
    public async Task Moves_members_to_a_new_class_the_type_keeps_a_field_of_and_forwards_what_others_could_reach()
    {
        const string source = """
            using System.Collections.Generic;

            namespace App;

            public class Basket
            {
                private readonly List<int> _prices = new();

                public int Total => Sum();

                public void Add(int price) => _prices.Add(price);

                private int Sum()
                {
                    var sum = 0;
                    foreach (var price in _prices) { sum += price; }
                    return sum;
                }

                public string Name { get; set; } = "";
            }
            """;
        var (result, original, helper) = await Extracted(source, "Basket", ["private readonly List<int> _prices", "public int Total", "public void Add", "private int Sum"]);
        Assert.EndsWith("Helper.cs", result.NewFilePath);
        Assert.Contains("private readonly Helper _helper = new Helper();", original);
        Assert.Contains("public int Total => _helper.Total;", original);
        Assert.Contains("public void Add(int price) => _helper.Add(price);", original);
        Assert.DoesNotContain("_prices", original);
        Assert.DoesNotContain("Sum()", original);
        Assert.Contains("public string Name { get; set; } = \"\";", original);
        Assert.Contains("public class Helper", helper);
        Assert.Contains("private readonly List<int> _prices = new();", helper);
        Assert.Contains("private int Sum()", helper);
        Assert.Contains("using System.Collections.Generic;", helper);
    }

    [Fact]
    public async Task What_the_type_keeps_goes_through_the_field_to_the_moved_members()
    {
        const string source = """
            namespace App;

            public class Counter
            {
                private int _count;

                private void Bump() => _count++;

                public void Hit()
                {
                    Bump();
                    this.Bump();
                    Bump();
                }
            }
            """;
        var (_, original, helper) = await Extracted(source, "Counter", ["private int _count", "private void Bump"]);
        Assert.Contains("_helper.Bump();", original);
        Assert.DoesNotContain("this.Bump", original);
        Assert.DoesNotContain("\n        Bump();", original);
        Assert.Contains("internal void Bump() => _count++;", helper);
        Assert.Contains("private int _count;", helper);
    }

    [Fact]
    public async Task Moved_members_that_use_what_stays_reach_it_through_the_owner_and_the_constructors_create_the_field()
    {
        const string source = """
            namespace App;

            public class Order
            {
                public Order() { }

                public Order(int id) { Id = id; }

                public int Id { get; set; }

                public string Label() => "Order " + Id;
            }
            """;
        var (_, original, helper) = await Extracted(source, "Order", ["public string Label"]);
        Assert.Contains("private readonly Helper _helper;", original);
        Assert.Equal(2, original.Split("_helper = new Helper(this);").Length - 1);
        Assert.Contains("public string Label() => _helper.Label();", original);
        Assert.Contains("private readonly Order _owner;", helper);
        Assert.Contains("internal Helper(Order owner)", helper);
        Assert.Contains("\"Order \" + _owner.Id", helper);
    }

    [Fact]
    public async Task A_type_without_constructor_gets_one()
    {
        const string source = """
            namespace App;

            public class Order
            {
                public int Id { get; set; }

                public string Label() => "Order " + Id;
            }
            """;
        var (_, original, _) = await Extracted(source, "Order", ["public string Label"]);
        Assert.Contains("public Order()", original);
        Assert.Contains("_helper = new Helper(this);", original);
    }

    [Fact]
    public async Task Static_members_alone_make_a_static_class_and_the_type_keeps_no_field()
    {
        const string source = """
            namespace App;

            public class Maths
            {
                public static int Twice(int x) => x * 2;

                public int Use() => Twice(2);
            }
            """;
        var (_, original, helper) = await Extracted(source, "Maths", ["public static int Twice"]);
        Assert.DoesNotContain("_helper", original);
        Assert.Contains("public static int Twice(int x) => Helper.Twice(x);", original);
        Assert.Contains("public int Use() => Helper.Twice(2);", original);
        Assert.Contains("public static class Helper", helper);
    }

    [Fact]
    public async Task The_class_can_be_written_into_the_same_file()
    {
        const string source = """
            namespace App;

            public class Counter
            {
                private int _count;

                public void Hit() => _count++;
            }
            """;
        var (result, original, _) = await Extracted(source, "Counter", ["private int _count", "public void Hit"], newFile: false);
        Assert.Null(result.NewFilePath);
        Assert.True(original.IndexOf("public class Helper") < original.IndexOf("public class Counter"));
    }

    [Fact]
    public async Task A_member_the_new_class_cannot_reach_has_to_move_too_and_the_info_says_so()
    {
        const string source = """
            namespace App;

            public class Order
            {
                private int _secret;

                public int Show() => _secret;

                public int Other() => 1;
            }
            """;
        var h = new Harness([("A.cs", source)]);
        var info = await ExtractClassEngine.InfoAsync(h.Document("A.cs"), Harness.At(source, "class Order", "Order"), default);
        var show = info!.Members.Single(m => m.Signature.Contains("Show"));
        Assert.Single(show.Deps);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => Run(h, source, "Order", "Helper", ["public int Show"]));
        Assert.Contains("_secret", ex.Message);
        Assert.Contains("move it as well", ex.Message);
    }

    [Fact]
    public async Task Virtual_members_interface_implementations_and_this_are_blocked_with_the_reason()
    {
        const string source = """
            using System;
            namespace App;

            public class Thing : IDisposable
            {
                public virtual void Run() { }

                public void Dispose() { }

                public Thing Me() => this;

                public event EventHandler? Changed;
            }
            """;
        var h = new Harness([("A.cs", source)]);
        var info = await ExtractClassEngine.InfoAsync(h.Document("A.cs"), Harness.At(source, "class Thing", "Thing"), default);
        string? Blocked(string part) => info!.Members.Single(m => m.Signature.Contains(part)).Blocked;
        Assert.Contains("virtual", Blocked("Run"));
        Assert.Contains("interface", Blocked("Dispose"));
        Assert.Contains("this", Blocked("Me"));
        Assert.Contains("events", Blocked("Changed"));
    }

    [Fact]
    public async Task Generic_nested_and_partial_types_are_refused()
    {
        foreach (var source in new[]
        {
            "namespace App; public class Box<T> { public int X; }",
            "namespace App; public class Outer { public class Inner { public int X; } }",
            "namespace App; public partial class Part { public int X; }",
        })
        {
            var h = new Harness([("A.cs", source)]);
            var name = source.Contains("Inner") ? "Inner" : source.Contains("Box") ? "Box" : "Part";
            var info = await ExtractClassEngine.InfoAsync(h.Document("A.cs"), Harness.At(source, "class " + name, name), default);
            Assert.NotNull(info!.Refusal);
        }
    }

    [Fact]
    public async Task A_public_field_becomes_a_forwarding_property()
    {
        const string source = """
            namespace App;

            public class Bag
            {
                public int Size;

                public int Double() => Size * 2;
            }
            """;
        var (_, original, helper) = await Extracted(source, "Bag", ["public int Size", "public int Double"]);
        Assert.Contains("public int Size { get => _helper.Size; set => _helper.Size = value; }", original);
        Assert.Contains("public int Size;", helper);
    }

    [Fact]
    public async Task Refuses_a_class_name_or_file_that_exists_already()
    {
        const string source = "namespace App { public class Item { public string Id { get; set; } public string Value { get; set; } } }";
        var withType = new Harness(("A.cs", source), ("ItemHelper.cs", "namespace App { public class ItemHelper { } }"));
        var type = await Assert.ThrowsAsync<InvalidOperationException>(() => Run(withType, source, "Item", "ItemHelper", ["Value"]));
        Assert.Contains("A type called ItemHelper exists already", type.Message);

        var withFile = new Harness(("A.cs", source), ("ItemHelper.cs", "// notes"));
        var file = await Assert.ThrowsAsync<InvalidOperationException>(() => Run(withFile, source, "Item", "ItemHelper", ["Value"]));
        Assert.Contains("ItemHelper.cs exists already", file.Message);
    }
}
