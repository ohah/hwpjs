//! 원본 문단의 본문과 쪽 영역 좌표를 같은 후보에서 갱신합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn splice(a: std.mem.Allocator, tree: *const Tree, paragraph: *Paragraph, start: u32, deleted: u32, inserted: []const u8, limit: usize, anchored: bool) anyerror!bool {
    if (paragraph.page_area_positions == null) return error.MissingPageAreaPositions;
    try @import("page_area_current_validate.zig").validatePartitionMember(a, tree, paragraph);
    const positions = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    defer a.free(positions);
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, start);
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, end);
    const units = std.math.cast(u32, if (positions.len == 0) 0 else positions[positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const inserted_units = std.math.cast(u32, try @import("text_site_edit.zig").utf16Length(inserted)) orelse return error.LimitExceeded;
    var draft = try paragraph.clone(a);
    defer draft.deinit(a);
    const areas = draft.page_area_positions.?;
    draft.page_area_positions = null;
    var restored = false;
    defer if (!restored) a.free(areas);
    var values: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = @as(*[1]Paragraph, @ptrCast(&draft)) };
    if (!try @import("paragraph_structure_splice.zig").spliceMode(a, tree, &values, 0, start, deleted, inserted, limit, anchored)) return false;
    for (areas) |*area| {
        area.* = try @import("page_area_position.zig").splice(area.*, start, end, inserted_units, units);
        area.affinity = @import("page_area_position.zig").canonicalAffinity(area.unit);
    }
    draft.page_area_positions = areas;
    restored = true;
    try @import("page_area_current_validate.zig").validatePartitionMember(a, tree, &draft);
    std.mem.swap(Paragraph, paragraph, &draft);
    return true;
}

test "page area splice updates current text and coordinates atomically through failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.splice(0, 2, 0, 0, "AB😀CD");
    const section = &session.sections[0];
    const options = @import("editor_session.zig").siteOptions(session.options);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &report);
    defer values.deinit(a);
    const owner = &values.paragraphs[1];
    try @import("page_area_materialize.zig").install(a, &section.tree, owner, 2);
    owner.page_area_positions.?[0].unit = 2;
    owner.page_area_positions.?[1].unit = 4;
    for (owner.page_area_positions.?) |*area| area.affinity = @import("page_area_position.zig").canonicalAffinity(area.unit);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, source: *const Paragraph) !void {
            var current = try source.clone(allocator);
            defer current.deinit(allocator);
            _ = splice(allocator, tree, &current, 1, 0, "앞😀", 4000000, false) catch |err| {
                for (source.sites.items, current.sites.items) |before, after| try std.testing.expectEqualStrings(before.text, after.text);
                try std.testing.expectEqualSlices(@import("page_area_position.zig").Position, source.page_area_positions.?, current.page_area_positions.?);
                return err;
            };
            try std.testing.expectEqual(@as(u32, 5), current.page_area_positions.?[0].unit);
            try std.testing.expectEqual(@as(u32, 7), current.page_area_positions.?[1].unit);
            const expected = "A앞😀B😀CD";
            var cursor: usize = 0;
            for (current.sites.items) |site| {
                try std.testing.expect(site.text.len <= expected.len - cursor);
                try std.testing.expectEqualStrings(expected[cursor .. cursor + site.text.len], site.text);
                cursor += site.text.len;
            }
            try std.testing.expectEqual(expected.len, cursor);
        }
    };
    try Probe.run(a, &section.tree, owner);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &section.tree, owner });
    try std.testing.expect(try splice(a, &section.tree, owner, 1, 0, "앞😀", 4000000, false));
    const saved = try @import("paragraph_structure_save.zig").write(a, &section.tree, &values, options, &.{}, 4000000);
    defer a.free(saved);
    try std.testing.expectError(error.ProtectedPageAreaBoundary, splice(a, &section.tree, owner, 4, 3, "", 4000000, false));
    try std.testing.expectError(error.SplitSurrogatePair, splice(a, &section.tree, owner, 3, 0, "X", 4000000, false));
    try std.testing.expectError(error.InvalidXmlCharacter, splice(a, &section.tree, owner, 0, 0, &.{0}, 4000000, false));
    try std.testing.expect(!try splice(a, &section.tree, owner, 0, 0, "", 4000000, false));
    const after = try @import("paragraph_structure_save.zig").write(a, &section.tree, &values, options, &.{}, 4000000);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, saved, after);
}
