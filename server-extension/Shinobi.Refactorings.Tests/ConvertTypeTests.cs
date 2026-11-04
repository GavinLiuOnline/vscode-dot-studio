namespace Shinobi.Refactorings.Tests;

public class ConvertTypeTests
{
    private const string ClassSource = """
        namespace App;

        public abstract class Shape
        {
            public abstract double Area();
            public abstract string Name { get; }
        }

        public class Circle : Shape
        {
            public override double Area() => 3;
            public override string Name => "circle";
        }

        public class Use
        {
            public double Total(Shape s) => s.Area();
        }
        """;

    private static async Task<(ConvertTypeInfo Info, ExtractInterfaceResult? Result, string Text, IReadOnlyList<string> Errors)> Convert(string source, string declaration, string name, bool defaults = false, params (string, string)[] others)
    {
        var h = new Harness([("A.cs", source), .. others]);
        var document = h.Document("A.cs");
        var position = Harness.At(source, declaration, name);
        var info = (await ConvertTypeEngine.InfoAsync(document, position, default))!;
        if (info.Refusal is not null) { return (info, null, source, []); }
        var result = (await ConvertTypeEngine.RunAsync(document, new ConvertTypeRequest(position, defaults), default))!;
        return (info, result, Harness.Lf(Harness.Apply(source, result)), result.Errors is null ? await h.ErrorsAfter(document, result) : result.Errors);
    }

    [Fact]
    public async Task Converts_an_abstract_class_to_an_interface_and_the_implementers_lose_override()
    {
        var (info, result, text, errors) = await Convert(ClassSource, "abstract class Shape", "Shape");
        Assert.Equal("toInterface", info.Direction);
        Assert.Equal(["Circle"], info.Implementers.Select(i => i.Name));
        Assert.Empty(errors);
        Assert.Contains("public interface Shape", text);
        Assert.Contains("    double Area();", text);
        Assert.Contains("    string Name { get; }", text);
        Assert.Contains("public double Area() => 3;", text);
        Assert.Contains("public string Name => \"circle\";", text);
        Assert.DoesNotContain("override", text);
        Assert.Contains("keeps its name", result!.Summary);
    }

    [Fact]
    public async Task Refuses_state_constructors_a_base_class_and_members_that_are_not_public()
    {
        const string source = """
            namespace App;

            public class Base { }

            public abstract class Shape : Base
            {
                private int _size;
                protected Shape() { }
                protected abstract void Draw();
                public static void Make() { }
                public override string ToString() => "";
            }
            """;
        var (info, _, _, _) = await Convert(source, "abstract class Shape", "Shape");
        Assert.NotNull(info.Refusal);
        Assert.Contains("derives from Base", info.Refusal);
        Assert.Contains("is a field", info.Refusal);
        Assert.Contains("constructor", info.Refusal);
        Assert.Contains("is not public", info.Refusal);
        Assert.Contains("is static", info.Refusal);
        Assert.Contains("overrides a member of object", info.Refusal);
    }

    private const string WithBody = """
        namespace App;

        public abstract class Shape
        {
            public abstract double Area();
            public virtual string Describe() => "shape";
        }

        public class Circle : Shape
        {
            public override double Area() => 3;
            public override string Describe() => "circle";
        }
        """;

    [Fact]
    public async Task Members_with_a_body_need_the_option_and_then_stay_as_default_interface_members()
    {
        var h = new Harness(("A.cs", WithBody));
        var info = (await ConvertTypeEngine.InfoAsync(h.Document("A.cs"), Harness.At(WithBody, "abstract class Shape", "Shape"), default))!;
        Assert.Equal(["public virtual string Describe()"], info.Bodies);
        Assert.True(info.CanUseDefaultMembers);
        Assert.Null(info.Refusal);
        await Assert.ThrowsAsync<InvalidOperationException>(() => ConvertTypeEngine.RunAsync(h.Document("A.cs"), new ConvertTypeRequest(Harness.At(WithBody, "abstract class Shape", "Shape"), false), default));

        var (_, _, text, errors) = await Convert(WithBody, "abstract class Shape", "Shape", defaults: true);
        Assert.Empty(errors);
        Assert.Contains("    string Describe() => \"shape\";", text);
        Assert.DoesNotContain("override", text);
    }

    [Fact]
    public async Task An_automatic_property_of_the_class_is_state_and_refused()
    {
        const string source = "namespace App; public abstract class Shape { public virtual int Size { get; set; } }";
        var (info, _, _, _) = await Convert(source, "abstract class Shape", "Shape");
        Assert.Contains("automatic property", info.Refusal);
    }

    private const string InterfaceSource = """
        namespace App;

        public interface IShape
        {
            double Area();
            string Name { get; }
            string Describe() => "shape";
        }

        public interface IFoo { }

        public class Circle : IShape
        {
            public double Area() => 3;
            public string Name => "circle";
        }

        public class Square : IFoo, IShape
        {
            public double Area() => 4;
            public string Name => "square";
            public string Describe() => "square";
        }
        """;

    [Fact]
    public async Task Converts_an_interface_to_an_abstract_class_and_the_implementers_override_it()
    {
        var (info, _, text, errors) = await Convert(InterfaceSource, "interface IShape", "IShape");
        Assert.Equal("toClass", info.Direction);
        Assert.Equal(["Circle", "Square"], info.Implementers.Select(i => i.Name));
        Assert.Empty(errors);
        Assert.Contains("public abstract class IShape", text);
        Assert.Contains("public abstract double Area();", text);
        Assert.Contains("public abstract string Name { get; }", text);
        Assert.Contains("public virtual string Describe() => \"shape\";", text);
        Assert.Contains("public override double Area() => 3;", text);
        Assert.Contains("public override string Name => \"circle\";", text);
        Assert.Contains("public class Square : IShape, IFoo", text);          // the class comes first
        Assert.Contains("public override string Describe() => \"square\";", text);
    }

    [Fact]
    public async Task An_implementer_in_another_file_is_edited_there()
    {
        const string shape = "namespace App; public interface IShape { double Area(); }";
        const string circle = "namespace App;\n\npublic class Circle : IShape\n{\n    public double Area() => 3;\n}\n";
        var h = new Harness(("Shape.cs", shape), ("Circle.cs", circle));
        var document = h.Document("Shape.cs");
        var position = Harness.At(shape, "interface IShape", "IShape");
        var result = (await ConvertTypeEngine.RunAsync(document, new ConvertTypeRequest(position, false), default))!;
        Assert.Null(result.Errors);
        var other = Assert.Single(result.Others!);
        Assert.Contains("public override double Area() => 3;", Harness.Apply(circle, new ExtractInterfaceResult(other.Edits, null, null)));
        Assert.Empty(await h.ErrorsAfter(document, result));
    }

    [Fact]
    public async Task Refuses_an_interface_with_a_struct_a_class_with_a_base_class_and_another_interface_extending_it()
    {
        const string source = """
            namespace App;

            public interface IShape { void A(); }
            public interface IBetter : IShape { }
            public struct Dot : IShape { public void A() { } }
            public class Base { }
            public class Circle : Base, IShape { public void A() { } }
            """;
        var (info, _, _, _) = await Convert(source, "interface IShape", "IShape");
        Assert.Contains("The interface IBetter extends it", info.Refusal);
        Assert.Contains("The struct Dot implements it", info.Refusal);
        Assert.Contains("Circle already derives from Base", info.Refusal);
    }

    [Fact]
    public async Task Is_not_offered_on_a_class_that_is_not_abstract()
    {
        var h = new Harness(("A.cs", "namespace App; public class Plain { }"));
        var text = (await h.Document("A.cs").GetTextAsync()).ToString();
        Assert.Null(await ConvertTypeEngine.InfoAsync(h.Document("A.cs"), Harness.At(text, "class Plain", "Plain"), default));
    }
}
