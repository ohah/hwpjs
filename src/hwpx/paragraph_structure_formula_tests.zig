const std = @import("std");

test "HWPX structural formula splice allocation failures preserve the complete model" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='9'><p:run><p:t>AB</p:t></p:run></p:p>");
    defer a.free(input);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            var session = try @import("editor_session.zig").open(allocator, bytes, .{});
            defer session.deinit();
            _ = try session.splitParagraph(0, 1, 1, 0);
            const before = try session.sections[0].structure_values.?.clone(allocator);
            var snapshot = before;
            defer snapshot.deinit(allocator);
            _ = session.splice(0, 3, 0, 1, "100") catch |err| {
                const current = session.sections[0].structure_values.?;
                try std.testing.expectEqual(snapshot.paragraphs.len, current.paragraphs.len);
                for (snapshot.paragraphs, current.paragraphs) |left, right| {
                    try std.testing.expectEqual(left.template_element, right.template_element);
                    try std.testing.expectEqual(left.generated_id, right.generated_id);
                    for (left.sites.items, right.sites.items) |one, two| try std.testing.expectEqualStrings(one.text, two.text);
                }
                try std.testing.expectEqualSlices(u8, bytes, session.source);
                return err;
            };
            try std.testing.expectEqualStrings("100", session.sections[0].structure_values.?.paragraphs[2].sites.items[0].text);
        }
    }.run, .{input});
}

test "HWPX structural formula save preserves actual chart calculations outside cells" {
    var verification_allocator: @import("../testing/checked_allocator.zig").Debug = .{};
    defer std.testing.expect(verification_allocator.deinit() == .ok) catch @panic("structural formula fixture allocator leak");
    const a = verification_allocator.allocator();
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var report: @import("section_text.zig").Report = .{};
    const options = @import("editor_session.zig").siteOptions(session.options);
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &report);
    defer values.deinit(a);
    var target: ?usize = null;
    for (values.paragraphs, 0..) |paragraph, index| {
        if (!try session.canEdit(0, paragraph.source_ordinal.?)) continue;
        var parent = section.tree.elements[paragraph.template_element].parent;
        var cell = false;
        while (parent) |node| : (parent = section.tree.elements[node].parent) {
            if (section.tree.elements[node].is(@import("document_xml.zig").paragraph_uri, "tc")) cell = true;
        }
        if (!cell) {
            target = index;
            break;
        }
    }
    try std.testing.expect(target != null);
    const trees = [_]@import("xml_part_tree.zig").Tree{section.tree};
    const id = try @import("paragraph_instance_ids.zig").next(a, &trees, &.{}, 10000);
    var draft = try @import("paragraph_structure_split.zig").prepare(a, &section.tree, &values, target.?, 0, 0, id, 4_000_000);
    defer draft.deinit(a);
    const output = try @import("paragraph_structure_save.zig").writeWithFormulas(a, &trees, 0, &draft, options, &.{}, 4_000_000);
    defer a.free(output);
    var rendered = try @import("xml_part_tree.zig").parse(a, output, .section, 0, section.tree.item_index, .{});
    defer rendered.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &rendered, options);
    defer sites.deinit(a);
    const prepared = try @import("formula_section_prepare.zig").prepare(a, &.{rendered}, 0, &sites, .{});
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    try std.testing.expectEqual(@as(usize, 0), prepared.len);
    try std.testing.expectEqualSlices(u8, input, session.source);
    try std.testing.expect(try session.splitParagraph(0, target.? + 1, 0, 0));
    try std.testing.expect(try session.canEdit(0, target.? + 2));
    try std.testing.expect(try session.splice(0, target.? + 2, 0, 0, "구조수식😀"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(section.last_paragraph, reopened.sections[0].last_paragraph);
    var found = false;
    for (reopened.sections[0].sites.items) |site| if (std.mem.startsWith(u8, site.text, "구조수식😀")) {
        found = true;
    };
    try std.testing.expect(found);
}
