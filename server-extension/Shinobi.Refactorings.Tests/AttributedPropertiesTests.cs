namespace Shinobi.Refactorings.Tests;

/// <summary>A property bag with documented, attributed and initialized properties (an obsolete one among them) and members that use them, with Windows line endings, run through both extractions with five of its properties.</summary>
public class TextEntryTests
{
    private static readonly string Source = """
        using System;

        namespace Sample.Texts
        {
            /// <summary>
            /// Class describing a text entry.
            /// </summary>
            public class TextEntry
            {
                /// <summary>
                /// Gets or sets the key of the entry
                /// </summary>
                public string Key { get; set; }

                /// <summary>
                /// Gets or sets the value of this entry
                /// </summary>
                public string Value { get; set; }

                /// <summary>
                /// Gets or sets the optional comment for this entry
                /// </summary>
                [Obsolete("2021-06-21", true)]
                public string Comment { get; set; }

                /// <summary>
                /// Gets or sets the locale ("" invariant or "en-US", "de" etc). Note
                /// Empty means invariant or default locale.
                /// </summary>
                public string Locale { get; set; } = string.Empty;

                /// <summary>
                /// Gets or sets the last modified date.
                /// </summary>
                public DateTime Updated { get; set; } = DateTime.UtcNow;

                /// <summary>
                /// Gets or sets the group (file) that this entry belongs to
                /// </summary>
                public string Group { get; set; } = string.Empty;

                public bool Modified { get; set; } = false;

                internal bool MatchGroup(string group)
                    => (string.IsNullOrEmpty(group) && string.IsNullOrEmpty(this.Group)) || string.Equals(group, this.Group, StringComparison.InvariantCulture);

                internal bool Match(TextEntry item)
                    => this.MatchGroup(item?.Group) &&
                    string.Equals(this.Locale, item?.Locale, StringComparison.InvariantCultureIgnoreCase) &&
                    string.Equals(this.Key, item?.Key, StringComparison.InvariantCulture);

                internal bool Match(string group, string key, string locale)
                    => this.MatchGroup(group) &&
                    string.Equals(this.Locale, locale, StringComparison.InvariantCultureIgnoreCase) &&
                    string.Equals(this.Key, key, StringComparison.InvariantCulture);
            }
        }
        """.Replace("\n", "\r\n");

    private static readonly string[] Chosen = ["Key", "Value", "Comment", "Locale", "Group"];

    [Fact]
    public async Task Extract_superclass_with_the_five_properties_compiles()
    {
        var h = new Harness(("TextEntry.cs", Source));
        var document = h.Document("TextEntry.cs");
        var position = Harness.At(Source, "class TextEntry", "TextEntry");
        var info = (await ExtractSuperclassEngine.InfoAsync(document, position, default))!;
        var ids = Chosen.Select(name => info.Members.Single(m => m.Signature.Contains(name + " ") || m.Signature.EndsWith(name)).Id).ToList();

        var result = (await ExtractSuperclassEngine.RunAsync(document, new ExtractSuperclassRequest(position, "TextEntryBase", ids, [], true), default))!;

        Assert.Null(result.Errors);
        Assert.Contains("using System;", result.NewFileContent);
        Assert.Contains("public class TextEntry : TextEntryBase", Harness.Apply(Source, result));
        Assert.Empty(await h.ErrorsAfter(document, result));
    }

    [Fact]
    public async Task Extract_class_with_the_five_properties_compiles()
    {
        var h = new Harness(("TextEntry.cs", Source));
        var document = h.Document("TextEntry.cs");
        var position = Harness.At(Source, "class TextEntry", "TextEntry");
        var info = (await ExtractClassEngine.InfoAsync(document, position, default))!;
        var ids = Chosen.Select(name => info.Members.Single(m => m.Signature.Contains(name + " ") || m.Signature.EndsWith(name)).Id).ToList();

        var result = (await ExtractClassEngine.RunAsync(document, new ExtractClassRequest(position, "TextEntryHelper", ids, true), default))!;

        Assert.Null(result.Errors);
        Assert.Empty(await h.ErrorsAfter(document, result));
    }
}
