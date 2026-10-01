const std = @import("std");
const plan = @import("structure_plan.zig");
const split = @import("paragraph_split.zig");
const Tree = @import("../body/tree.zig").Tree;
const Source = @import("../text_source.zig").Source;
const a = std.testing.allocator;

test "structural plan resolves actual sibling table cells and rejects forged owners IDs and templates" {
    const cases = [_]struct { path: []const u8, paragraph: usize }{
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/software.hwp", .paragraph = 2 },
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", .paragraph = 1 },
    };
    for (cases) |case| {
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, case.path, a, .limited(4_000_000));
        defer a.free(input);
        var file = try Source.open(a, input);
        defer file.deinit();
        const raw = try file.decodeSection(a, 0);
        defer a.free(raw);
        var document = try @import("../model_projection.zig").fromDecodedSections(a, file.header.version(), &.{raw});
        defer document.deinit(a);
        const section = &document.sections[0];
        const original_count = section.paragraphs.len;
        try split.apply(a, section, raw, file.header.version(), case.paragraph, 0, 0xfffffffe, 1000);
        try std.testing.expectEqual(original_count + 1, section.paragraphs.len);
        var tree = try Tree.parseTextPreview(a, raw, file.header.version(), .{});
        defer tree.deinit(a);
        var checked = try plan.build(a, tree, section.*, file.header.version());
        defer checked.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), checked.insertions.len);
        const insertion = checked.insertions[0];
        try std.testing.expect(insertion.owner_list != null);
        try std.testing.expectEqual(@as(u16, 1), checked.list_additions[insertion.owner_list.?]);
        try std.testing.expectEqual(case.paragraph + 1, insertion.paragraph);
        try std.testing.expect(insertion.last_in_owner);
        const generated = &section.paragraphs[case.paragraph + 1];
        const owner = generated.parent_node;
        generated.parent_node = null;
        try std.testing.expectError(error.SourceBindingMismatch, plan.build(a, tree, section.*, file.header.version()));
        generated.parent_node = owner;
        const template = generated.header_template;
        generated.header_template = null;
        try std.testing.expectError(error.MissingParagraphTemplate, plan.build(a, tree, section.*, file.header.version()));
        generated.header_template = template;
        generated.instance_id = section.paragraphs[case.paragraph].instance_id;
        try std.testing.expectError(error.InvalidParagraphInstanceId, plan.build(a, tree, section.*, file.header.version()));
        generated.instance_id = 0xfffffffe;
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, borrowed: Tree, current: @import("../../model/document.zig").Section, version: @import("../version.zig").Version) !void {
                var value = try plan.build(allocator, borrowed, current, version);
                defer value.deinit(allocator);
            }
        }.run, .{ tree, section.*, file.header.version() });
        try std.testing.expectEqual(owner, generated.parent_node);
        try std.testing.expectEqual(template, generated.header_template);
        try split.apply(a, section, raw, file.header.version(), case.paragraph, 0, 0xfffffffd, 1000);
        var repeated = try plan.build(a, tree, section.*, file.header.version());
        defer repeated.deinit(a);
        try std.testing.expectEqual(@as(usize, 2), repeated.insertions.len);
        try std.testing.expectEqual(@as(u16, 2), repeated.list_additions[insertion.owner_list.?]);
        try std.testing.expect(!repeated.insertions[0].last_in_owner);
        try std.testing.expect(repeated.insertions[1].last_in_owner);
        const saved = try @import("structure_section_writer.zig").write(a, raw, section.*, file.header.version(), 1000, 4_000_000);
        defer a.free(saved);
        var reopened = try @import("../model_projection.zig").fromDecodedSections(a, file.header.version(), &.{saved});
        defer reopened.deinit(a);
        try std.testing.expectEqual(section.paragraphs.len, reopened.sections[0].paragraphs.len);
        for (section.paragraphs, reopened.sections[0].paragraphs) |expected, actual| {
            const first = try @import("plain_text_content.zig").editableTextBytes(a, expected);
            defer a.free(first);
            const second = try @import("plain_text_content.zig").editableTextBytes(a, actual);
            defer a.free(second);
            try std.testing.expectEqualSlices(u8, first, second);
            try std.testing.expectEqual(expected.instance_id, actual.instance_id);
        }
        var saved_tree = try Tree.parseTextPreview(a, saved, file.header.version(), .{});
        defer saved_tree.deinit(a);
        var saved_groups = try @import("paragraph_owner.zig").inspectGroups(a, saved_tree, file.header.version());
        defer saved_groups.deinit(a);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source: []const u8, current: @import("../../model/document.zig").Section, version: @import("../version.zig").Version) !void {
                const output = try @import("structure_section_writer.zig").write(allocator, source, current, version, 1000, 4_000_000);
                defer allocator.free(output);
            }
        }.run, .{ raw, section.*, file.header.version() });
        try std.testing.expectError(error.LimitExceeded, @import("structure_section_writer.zig").write(a, raw, section.*, file.header.version(), 1000, 1));
    }
}
