const std = @import("std");
const model = @import("paragraph_joined_values.zig");

test "HWPX joined section preserves opaque gaps and all allocation failure inputs" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><!--before--><p:p id='1'><p:run><p:t>A</p:t></p:run></p:p><!--between--><?keep value?><p:p id='2'><p:run><p:t>B</p:t></p:run></p:p><!--after--><p:p id='3'><p:run><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    var left = try model.Joined.fromParagraph(a, &values.paragraphs[0]);
    defer left.deinit(a);
    var right = try model.Joined.fromParagraph(a, &values.paragraphs[1]);
    defer right.deinit(a);
    var joined = try @import("paragraph_joined_merge.zig").prepare(a, &tree, &left, &right, 10000);
    defer joined.deinit(a);
    const xml = try @import("paragraph_joined_section.zig").write(a, &tree, &joined, .{}, 10000);
    defer a.free(xml);
    for ([_][]const u8{ "<!--before-->", "<!--between--><?keep value?>", "<!--after-->", tree.sourceOf(values.paragraphs[2].template_element) }) |untouched| try std.testing.expect(std.mem.indexOf(u8, xml, untouched) != null);
    try std.testing.expectError(error.LimitExceeded, @import("paragraph_joined_section.zig").write(a, &tree, &joined, .{}, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("xml_part_tree.zig").Tree, current: *const model.Joined) !void {
            const output = try @import("paragraph_joined_section.zig").write(allocator, original, current, .{}, 10000);
            defer allocator.free(output);
        }
    }.run, .{ &tree, &joined });
    try std.testing.expectEqualStrings("A", joined.sites.items[0].text);
    try std.testing.expectEqualStrings("B", joined.sites.items[1].text);
    try std.testing.expectEqualStrings(source, tree.source);
    joined.pieces[0].source_ordinal = null;
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_joined_section.zig").write(a, &tree, &joined, .{}, 10000));
    joined.pieces[0].source_ordinal = 1;
}

test "HWPX joined section actual ZIP keeps non-target entries and edited merged text" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const options = @import("editor_session.zig").siteOptions(.{});
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &report);
    defer values.deinit(a);
    var exercised: usize = 0;
    for (0..values.paragraphs.len - 1) |index| {
        var left = try model.Joined.fromParagraph(a, &values.paragraphs[index]);
        defer left.deinit(a);
        var right = try model.Joined.fromParagraph(a, &values.paragraphs[index + 1]);
        defer right.deinit(a);
        var merged = @import("paragraph_joined_merge.zig").prepare(a, &section.tree, &left, &right, 4_000_000) catch |err| switch (err) {
            error.UnsupportedParagraphControl, error.UnsupportedInlineControl, error.UnsupportedParagraphTracking, error.UnsupportedMergeMetadata, error.MissingTextSite => continue,
            else => return err,
        };
        defer merged.deinit(a);
        try std.testing.expect(try @import("paragraph_joined_splice.zig").splice(a, &section.tree, &merged, 0, 0, "병합😀<&", 4_000_000));
        const xml = try @import("paragraph_joined_section.zig").write(a, &section.tree, &merged, options, 4_000_000);
        defer a.free(xml);
        const saved = try @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = section.entry_index, .bytes = xml }}, .{});
        defer a.free(saved);
        var reopened = try @import("editor_session.zig").open(a, saved, .{});
        defer reopened.deinit();
        const actual = &reopened.sections[0];
        var counter: @import("section_text.zig").Report = .{};
        var paragraphs = try @import("paragraph_structure_collect.zig").collect(a, &actual.tree, &actual.sites, actual.locations, options, &counter);
        defer paragraphs.deinit(a);
        try std.testing.expectEqual(values.paragraphs.len - 1, paragraphs.paragraphs.len);
        for (paragraphs.paragraphs, 0..) |paragraph, ordinal| {
            var expected: std.ArrayList(u8) = .empty;
            defer expected.deinit(a);
            if (ordinal == index) try expected.appendSlice(a, "병합😀<&");
            const old = ordinal + @as(usize, if (ordinal > index) 1 else 0);
            for (values.paragraphs[old].sites.items) |site| try expected.appendSlice(a, site.text);
            if (ordinal == index) for (values.paragraphs[index + 1].sites.items) |site| try expected.appendSlice(a, site.text);
            var text: std.ArrayList(u8) = .empty;
            defer text.deinit(a);
            for (paragraph.sites.items) |site| try text.appendSlice(a, site.text);
            try std.testing.expectEqualStrings(expected.items, text.items);
        }
        var before = try @import("../zip/archive.zig").open(a, input, .{});
        defer before.deinit();
        var after = try @import("../zip/archive.zig").open(a, saved, .{});
        defer after.deinit();
        try std.testing.expectEqual(before.entries.len, after.entries.len);
        for (before.entries, after.entries, 0..) |original, output, entry| {
            try std.testing.expectEqualStrings(original.name, output.name);
            if (entry == section.entry_index) continue;
            try std.testing.expectEqualSlices(u8, original.compressed, output.compressed);
            const old_bytes = try before.decode(original, 4_000_000);
            defer a.free(old_bytes);
            const new_bytes = try after.decode(output, 4_000_000);
            defer a.free(new_bytes);
            try std.testing.expectEqualSlices(u8, old_bytes, new_bytes);
        }
        try std.testing.expectEqualSlices(u8, input, session.source);
        exercised += 1;
    }
    try std.testing.expect(exercised > 0);
}
