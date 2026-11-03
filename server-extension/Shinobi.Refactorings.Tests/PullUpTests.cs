namespace Shinobi.Refactorings.Tests;

public class PullUpTests
{
    private static async Task<(PullUpInfo Info, Func<string, string> Id)> Info(Harness h, string file, string declaration, string name)
    {
        var document = h.Document(file);
        var text = (await document.GetTextAsync()).ToString();
        var info = await PullUpEngine.InfoAsync(document, Harness.At(text, declaration, name), default);
        Assert.NotNull(info);
        return (info!, start => info!.Members.Single(m => m.Signature.Contains(start)).Id);
    }

    private static async Task<ExtractInterfaceResult?> Pull(Harness h, string file, string declaration, string name, string target, string[] members, string[]? abstractMembers = null)
    {
        var (info, id) = await Info(h, file, declaration, name);
        var targetId = info.Targets.Single(t => t.Name == target).Id;
        var text = (await h.Document(file).GetTextAsync()).ToString();
        return await PullUpEngine.RunAsync(h.Document(file),
            new PullUpRequest(Harness.At(text, declaration, name), targetId, members.Select(id).ToList(), (abstractMembers ?? []).Select(id).ToList()), default);
    }

    private const string SameFile = """
        namespace App;

        public class Animal
        {
            public string Name { get; set; }
        }

        public class Dog : Animal
        {
            private int _barks;

            public void Bark() => _barks++;

            public int Barks => _barks;

            public void Fetch() { }
        }
        """;

    [Fact]
    public async Task Lists_the_base_classes_and_interfaces_of_the_solution_and_the_member_under_the_cursor()
    {
        var h = new Harness(("A.cs", SameFile + "\npublic interface IPet { void Fetch(); }\npublic class Pup : Animal, IPet { public void Fetch() { } public int Age; }"));
        var text = SameFile;
        var document = h.Document("A.cs");
        var full = (await document.GetTextAsync()).ToString();
        var onType = await PullUpEngine.InfoAsync(document, Harness.At(full, "class Pup", "Pup"), default);
        Assert.Equal(["Animal", "IPet"], onType!.Targets.Select(t => t.Name));
        Assert.Equal(["class", "interface"], onType.Targets.Select(t => t.Kind));
        Assert.Empty(onType.Selected);
        Assert.Contains(onType.Members, m => m.Signature.Contains("void Fetch()") && m.InterfaceSignature == "void Fetch();");
        Assert.Null(onType.Members.Single(m => m.Signature.Contains("int Age")).InterfaceSignature);

        var onMember = await PullUpEngine.InfoAsync(document, Harness.At(full, "public void Fetch() { } public int Age", "Fetch"), default);
        Assert.Single(onMember!.Selected);
        _ = text;
    }

    [Fact]
    public async Task Moves_members_to_the_base_class_in_the_same_file_and_keeps_what_is_still_used_reachable()
    {
        var h = new Harness(("A.cs", SameFile));
        var result = await Pull(h, "A.cs", "class Dog", "Dog", "Animal", ["private int _barks", "public void Bark", "public int Barks"]);
        Assert.NotNull(result);
        Assert.Null(result!.Errors);
        Assert.Empty(await h.ErrorsAfter(h.Document("A.cs"), result));
        var text = Harness.Lf(Harness.Apply(SameFile, result));
        Assert.Contains("public class Animal\n{\n    public string Name { get; set; }\n\n    private int _barks;\n\n    public void Bark() => _barks++;\n\n    public int Barks => _barks;\n}", text);
        Assert.Contains("public class Dog : Animal\n{\n    public void Fetch() { }\n}", text);
    }

    [Fact]
    public async Task Makes_a_private_member_protected_when_the_class_keeps_using_it()
    {
        const string source = """
            namespace App;

            public class Animal { }

            public class Dog : Animal
            {
                private int _barks;

                public void Bark() => _barks++;

                public int Loud() => _barks * 2;
            }
            """;
        var h = new Harness(("A.cs", source));
        var result = await Pull(h, "A.cs", "class Dog", "Dog", "Animal", ["private int _barks", "public void Bark"]);
        Assert.Null(result!.Errors);
        Assert.Contains("protected int _barks;", Harness.Apply(source, result));
        Assert.Empty(await h.ErrorsAfter(h.Document("A.cs"), result));
    }

    [Fact]
    public async Task Edits_the_other_file_of_the_base_class_and_adds_the_usings_it_needs()
    {
        const string baseFile = """
            namespace App;

            public abstract class Animal
            {
                public string Name { get; set; }
            }
            """;
        const string derived = """
            using System.Collections.Generic;
            using System.Linq;

            namespace App;

            public class Dog : Animal
            {
                public List<string> Tricks { get; } = new();

                public int Count() => Tricks.Count();
            }
            """;
        var h = new Harness(("Animal.cs", baseFile), ("Dog.cs", derived));
        var result = await Pull(h, "Dog.cs", "class Dog", "Dog", "Animal", ["public List<string> Tricks", "public int Count"]);
        Assert.NotNull(result);
        Assert.Null(result!.Errors);
        var other = Assert.Single(result.Others!);
        Assert.EndsWith("Animal.cs", other.Path);
        Assert.Empty(await h.ErrorsAfter(h.Document("Dog.cs"), result));
        var animal = Harness.Lf(Harness.Apply(baseFile, new ExtractInterfaceResult(other.Edits, null, null)));
        Assert.StartsWith("using System.Collections.Generic;\nusing System.Linq;\n\nnamespace App;", animal);
        Assert.Contains("public List<string> Tricks { get; } = new();", animal);
        Assert.DoesNotContain("Tricks", Harness.Apply(derived, result));
    }

    [Fact]
    public async Task Declares_a_member_abstract_in_the_base_class_and_leaves_an_override()
    {
        const string source = """
            namespace App;

            public abstract class Animal { }

            public class Dog : Animal
            {
                public void Speak() { }
            }
            """;
        var h = new Harness(("A.cs", source));
        var result = await Pull(h, "A.cs", "class Dog", "Dog", "Animal", ["public void Speak"], ["public void Speak"]);
        Assert.Null(result!.Errors);
        var text = Harness.Lf(Harness.Apply(source, result));
        Assert.Contains("public abstract void Speak();", text);
        Assert.Contains("public override void Speak() { }", text);
        Assert.Empty(await h.ErrorsAfter(h.Document("A.cs"), result));
    }

    [Fact]
    public async Task Makes_a_concrete_target_abstract_and_refuses_while_it_is_created_somewhere()
    {
        const string source = """
            namespace App;

            public class Animal { }

            public class Dog : Animal
            {
                public void Speak() { }
            }

            public class Zoo
            {
                public Animal Make() => new Animal();
            }
            """;
        var h = new Harness(("A.cs", source));
        var result = await Pull(h, "A.cs", "class Dog", "Dog", "Animal", ["public void Speak"], ["public void Speak"]);
        Assert.NotNull(result!.Errors);
        Assert.Contains(result.Errors!, e => e.Contains("CS0144"));
    }

    [Fact]
    public async Task Refuses_an_abstract_member_while_another_derived_class_does_not_implement_it()
    {
        const string source = """
            namespace App;

            public abstract class Animal { }

            public class Dog : Animal
            {
                public void Speak() { }
            }

            public class Cat : Animal { }
            """;
        var h = new Harness(("A.cs", source));
        var result = await Pull(h, "A.cs", "class Dog", "Dog", "Animal", ["public void Speak"], ["public void Speak"]);
        Assert.NotNull(result!.Errors);
        Assert.Contains(result.Errors!, e => e.Contains("CS0534") && e.Contains("Cat"));
    }

    [Fact]
    public async Task Adds_the_signature_to_an_interface_and_leaves_the_class_alone()
    {
        const string source = """
            namespace App;

            public interface IPet
            {
                string Name { get; }
            }

            public class Dog : IPet
            {
                public string Name => "Rex";

                public void Fetch() { }
            }
            """;
        var h = new Harness(("A.cs", source));
        var result = await Pull(h, "A.cs", "class Dog", "Dog", "IPet", ["public void Fetch"]);
        Assert.Null(result!.Errors);
        var text = Harness.Lf(Harness.Apply(source, result));
        Assert.Contains("public interface IPet\n{\n    string Name { get; }\n    void Fetch();\n}", text);
        Assert.Contains("public void Fetch() { }", text);
        Assert.Empty(await h.ErrorsAfter(h.Document("A.cs"), result));
    }

    [Fact]
    public async Task Refuses_a_member_the_target_already_has()
    {
        const string source = """
            namespace App;

            public class Animal
            {
                public void Speak(string text) { }
            }

            public class Dog : Animal
            {
                public void Speak(string other) { }
            }
            """;
        var h = new Harness(("A.cs", source));
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => Pull(h, "A.cs", "class Dog", "Dog", "Animal", ["public void Speak"]));
        Assert.Contains("already has", error.Message);
    }

    [Fact]
    public async Task Refuses_a_member_that_uses_one_that_stays()
    {
        var h = new Harness(("A.cs", SameFile));
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => Pull(h, "A.cs", "class Dog", "Dog", "Animal", ["public void Bark"]));
        Assert.Contains("_barks", error.Message);
        var (info, _) = await Info(h, "A.cs", "class Dog", "Dog");
        Assert.Single(info.Members.Single(m => m.Signature.Contains("public void Bark")).Deps);
    }

    [Fact]
    public async Task Refuses_a_class_without_a_base_type_in_the_solution()
    {
        var h = new Harness(("A.cs", "namespace App;\npublic class Loner { public void X() { } }"));
        var (info, _) = await Info(h, "A.cs", "class Loner", "Loner");
        Assert.NotNull(info.Refusal);
        Assert.Empty(info.Targets);
    }
}
