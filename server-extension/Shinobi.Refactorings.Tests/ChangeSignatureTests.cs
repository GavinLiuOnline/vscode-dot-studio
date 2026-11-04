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
}
