//! 원본 쪽 영역 좌표 후보를 문단에 원자적으로 설치합니다. 공개 게시 권한은 아닙니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn install(a: std.mem.Allocator, tree: *const Tree, paragraph: *Paragraph, limit: usize) !void {
    if (paragraph.page_area_positions != null) return;
    if (paragraph.generated_id != null or paragraph.source_ordinal == null or paragraph.pieces != null or paragraph.protected_positions != null) return error.UnsupportedPageAreaOwnership;
    const segments = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    defer a.free(segments);
    const positions = try @import("page_area_source_positions.zig").collect(a, tree, paragraph.template_element, segments, limit);
    paragraph.page_area_positions = positions;
}

test "page area materialize owns actual source coordinates atomically" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &report);
    defer values.deinit(a);
    const source = &values.paragraphs[1];
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, original: *const Paragraph) !void {
            var candidate = try original.clone(allocator);
            defer candidate.deinit(allocator);
            install(allocator, tree, &candidate, 2) catch |err| {
                try std.testing.expect(candidate.page_area_positions == null);
                return err;
            };
            try std.testing.expectEqual(@as(usize, 2), candidate.page_area_positions.?.len);
            const installed = candidate.page_area_positions.?.ptr;
            try install(allocator, tree, &candidate, 0);
            try std.testing.expectEqual(installed, candidate.page_area_positions.?.ptr);
            var copy = try candidate.clone(allocator);
            defer copy.deinit(allocator);
            candidate.page_area_positions.?[0].unit = 7;
            try std.testing.expectEqual(@as(u32, 0), copy.page_area_positions.?[0].unit);
            var rows = [_]Paragraph{copy};
            const budget_view: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = &rows };
            const size = try budget_view.byteSize(std.math.maxInt(usize));
            try std.testing.expectError(error.LimitExceeded, budget_view.byteSize(size - 1));
            rows[0].page_area_positions = null;
            const without = try budget_view.byteSize(std.math.maxInt(usize));
            try std.testing.expectEqual(@as(usize, 2 * @sizeOf(@import("page_area_position.zig").Position)), size - without);
            try std.testing.expectError(error.UnsupportedPageAreaOwnership, @import("paragraph_joined_values.zig").Joined.fromParagraph(allocator, &copy));
        }
    };
    try Probe.run(a, &section.tree, source);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &section.tree, source });
    try std.testing.expectError(error.LimitExceeded, install(a, &section.tree, source, 1));
    try std.testing.expect(source.page_area_positions == null);
    try std.testing.expect(section.structure_values == null);
    var empty = try values.paragraphs[0].clone(a);
    defer empty.deinit(a);
    try install(a, &section.tree, &empty, 0);
    try std.testing.expect(empty.page_area_positions != null);
    try std.testing.expectEqual(@as(usize, 0), empty.page_area_positions.?.len);
    var empty_copy = try empty.clone(a);
    defer empty_copy.deinit(a);
    try std.testing.expect(empty_copy.page_area_positions != null);
    try std.testing.expectEqual(@as(usize, 0), empty_copy.page_area_positions.?.len);
}
