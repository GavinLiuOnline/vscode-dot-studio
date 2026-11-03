namespace Shinobi.Refactorings.Tests;

public class PushDownTests
{
    private const string Animals = """
        namespace App;

        public class Animal
        {
            private int _energy;

            public int Energy => _energy;

            public void Eat() { _energy++; }

            public void Rest() { _energy--; }

            public virtual string Describe() => "animal";

            public void Report() { System.Console.WriteLine(Energy); }
        }

        public class Dog : Animal
        {
            public void Bark() { }
        }

        public class Cat : Animal
        {
        }
        """;

    private static async Task<(PushDownInfo Info, Func<string, string> Id)> Info(Harness h, string file, string text, string declaration, string name)
    {
        var info = await PushDownEngine.InfoAsync(h.Document(file), Harness.At(text, declaration, name), default);
        Assert.NotNull(info);
        return (info!, start => info!.Members.Single(m => m.Signature.Contains(start)).Id);
    }

    private static async Task<ExtractInterfaceResult?> Push(Harness h, string file, string text, string[] members, string[] derived, bool leaveAbstract = false)
    {
        var (info, id) = await Info(h, file, text, "class Animal", "Animal");
        var position = Harness.At(text, "class Animal", "Animal");
        return await PushDownEngine.RunAsync(h.Document(file),
            new PushDownRequest(position, info.Derived.Where(d => derived.Contains(d.Name)).Select(d => d.Id).ToList(), members.Select(id).ToList(), leaveAbstract), default);
    }

    [Fact]
    public async Task Lists_the_derived_classes_and_who_uses_each_member()
    {
        var h = new Harness(("A.cs", Animals));
        var (info, id) = await Info(h, "A.cs", Animals, "class Animal", "Animal");
        Assert.Equal(["Cat", "Dog"], info.Derived.Select(d => d.Name));
        // Report uses Energy, so pushing Energy down would leave Report without it
        Assert.Contains(id("Report"), info.Members.Single(m => m.Signature.Contains("int Energy")).UsedBy);
        Assert.True(info.Members.Single(m => m.Signature.Contains("void Rest")).CanBeAbstract);
    }

    [Fact]
    public async Task Moves_a_member_into_the_chosen_derived_class_and_the_result_compiles()
    {
        var h = new Harness(("A.cs", Animals));
        var result = (await Push(h, "A.cs", Animals, ["void Rest"], ["Dog"]))!;
        Assert.Null(result.Errors);
        var text = Harness.Lf(Harness.Apply(Animals, result));
        Assert.DoesNotContain("public void Rest() { _energy--; }\n\n    public virtual", text.Split("public class Dog")[0]);
        Assert.Contains("public void Rest() { _energy--; }", text.Split("public class Dog")[1].Split("public class Cat")[0]);
        Assert.DoesNotContain("Rest", text.Split("public class Cat")[1]);
        Assert.Contains("protected int _energy;", text);       // Rest uses it from the derived class now
        Assert.Empty(await h.ErrorsAfter(h.Document("A.cs"), result));
    }

    [Fact]
    public async Task Pushes_into_several_derived_classes()
    {
        var h = new Harness(("A.cs", Animals));
        var result = (await Push(h, "A.cs", Animals, ["void Rest"], ["Dog", "Cat"]))!;
        Assert.Null(result.Errors);
        var text = Harness.Lf(Harness.Apply(Animals, result));
        Assert.Equal(2, text.Split("public void Rest()").Length - 1);
        Assert.Empty(await h.ErrorsAfter(h.Document("A.cs"), result));
    }

    [Fact]
    public async Task Leaves_an_abstract_declaration_and_overrides_in_the_derived_classes()
    {
        var h = new Harness(("A.cs", Animals));
        var result = (await Push(h, "A.cs", Animals, ["virtual string Describe"], ["Dog", "Cat"], leaveAbstract: true))!;
        Assert.Null(result.Errors);
        var text = Harness.Lf(Harness.Apply(Animals, result));
        Assert.Contains("public abstract class Animal", text);
        Assert.Contains("public abstract string Describe();", text);
        Assert.Equal(2, text.Split("public override string Describe() => \"animal\";").Length - 1);
        Assert.Empty(await h.ErrorsAfter(h.Document("A.cs"), result));
    }

    [Fact]
    public async Task Refuses_an_abstract_declaration_when_a_derived_class_does_not_get_the_body()
    {
        var h = new Harness(("A.cs", Animals));
        var result = (await Push(h, "A.cs", Animals, ["virtual string Describe"], ["Dog"], leaveAbstract: true))!;
        // Cat is not abstract and does not implement it
        Assert.NotNull(result.Errors);
        Assert.Contains(result.Errors!, e => e.Contains("CS0534"));
    }

    [Fact]
    public async Task Refuses_when_the_class_or_others_still_use_the_member_through_the_base_type()
    {
        var h = new Harness(("A.cs", Animals + "\npublic class Zoo { public void Wake(Animal a) { a.Rest(); } }"));
        var result = (await Push(h, "A.cs", Animals + "\npublic class Zoo { public void Wake(Animal a) { a.Rest(); } }", ["void Rest"], ["Dog"]))!;
        Assert.NotNull(result.Errors);
        Assert.Contains(result.Errors!, e => e.Contains("CS1061"));
    }

    [Fact]
    public async Task Refuses_a_member_a_derived_class_has_already()
    {
        const string source = Animals + "\npublic class Bird : Animal { public void Rest() { } }";
        var h = new Harness(("A.cs", source));
        await Assert.ThrowsAsync<InvalidOperationException>(() => Push(h, "A.cs", source, ["void Rest"], ["Bird"]));
    }

    [Fact]
    public async Task Edits_a_derived_class_in_another_file_and_adds_its_usings()
    {
        const string animal = """
            using System.Linq;
            namespace App;

            public class Animal
            {
                public int Total(int[] values) => values.Sum();
            }
            """;
        const string dog = """
            namespace App;

            public class Dog : Animal
            {
            }
            """;
        var h = new Harness(("Animal.cs", animal), ("Dog.cs", dog));
        var info = (await PushDownEngine.InfoAsync(h.Document("Animal.cs"), Harness.At(animal, "class Animal", "Animal"), default))!;
        var result = (await PushDownEngine.RunAsync(h.Document("Animal.cs"),
            new PushDownRequest(Harness.At(animal, "class Animal", "Animal"), [info.Derived.Single().Id], [info.Members.Single().Id], false), default))!;
        Assert.Null(result.Errors);
        var other = Assert.Single(result.Others!);
        Assert.EndsWith("Dog.cs", other.Path);
        var text = Harness.Lf(Harness.Apply(dog, new ExtractInterfaceResult(other.Edits, null, null)));
        Assert.Contains("using System.Linq;", text);
        Assert.Contains("public int Total(int[] values) => values.Sum();", text);
        Assert.Empty(await h.ErrorsAfter(h.Document("Animal.cs"), result));
    }

    [Fact]
    public async Task Refuses_a_class_without_derived_classes_and_a_generic_one()
    {
        var h = new Harness(("A.cs", "namespace App; public class Loner { public void A() { } }\npublic class Box<T> { } public class IntBox : Box<int> { }"));
        var text = (await h.Document("A.cs").GetTextAsync()).ToString();
        var loner = await PushDownEngine.InfoAsync(h.Document("A.cs"), Harness.At(text, "class Loner", "Loner"), default);
        Assert.Contains("No class", loner!.Refusal);
        var box = await PushDownEngine.InfoAsync(h.Document("A.cs"), Harness.At(text, "class Box", "Box"), default);
        Assert.Contains("generic", box!.Refusal);
    }
}
