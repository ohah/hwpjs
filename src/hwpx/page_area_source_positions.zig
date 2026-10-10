//! 원본 쪽 영역 컨테이너의 폭 없는 호스트 위치입니다. 병합 권한은 아닙니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Segment = @import("paragraph_text_positions.zig").Segment;
pub const Position = @import("page_area_position.zig").Position;

pub fn hasForParagraph(tree: *const Tree, paragraph: usize) bool {
    if (paragraph >= tree.elements.len) return false;
    const uri = @import("document_xml.zig").paragraph_uri;
    var run_index = tree.elements[paragraph].first_child;
    while (run_index) |run| : (run_index = tree.elements[run].next_sibling) {
        if (!tree.elements[run].is(uri, "run")) continue;
        var child_index = tree.elements[run].first_child;
        while (child_index) |control| : (child_index = tree.elements[control].next_sibling) {
            if (!tree.elements[control].is(uri, "ctrl")) continue;
            var setting_index = tree.elements[control].first_child;
            while (setting_index) |setting| : (setting_index = tree.elements[setting].next_sibling) {
                if (isArea(tree.elements[setting])) return true;
            }
        }
    }
    return false;
}

fn isArea(element: @import("xml_part_tree.zig").Element) bool {
    const uri = @import("document_xml.zig").paragraph_uri;
    return element.is(uri, "header") or element.is(uri, "footer");
}

pub fn collect(a: std.mem.Allocator, tree: *const Tree, paragraph: usize, segments: []const Segment, limit: usize) ![]Position {
    const coordinates = @import("source_metadata_coordinates.zig");
    try coordinates.validate(tree, paragraph, segments);
    var output: std.ArrayList(Position) = .empty;
    defer output.deinit(a);
    const uri = @import("document_xml.zig").paragraph_uri;
    var run_index = tree.elements[paragraph].first_child;
    while (run_index) |run| : (run_index = tree.elements[run].next_sibling) {
        if (!tree.elements[run].is(uri, "run")) continue;
        var child_index = tree.elements[run].first_child;
        while (child_index) |control| : (child_index = tree.elements[control].next_sibling) {
            if (!tree.elements[control].is(uri, "ctrl")) continue;
            var setting_index = tree.elements[control].first_child;
            while (setting_index) |setting| : (setting_index = tree.elements[setting].next_sibling) {
                const area = tree.elements[setting];
                if (!isArea(area)) continue;
                if (!@import("retained_run_metadata.zig").supported(tree, control)) return error.UnsupportedParagraphControl;
                if (output.items.len >= limit) return error.LimitExceeded;
                const unit = std.math.cast(u32, coordinates.before(segments, tree.elements[control].start_tag.start)) orelse return error.LimitExceeded;
                try output.append(a, .{ .source_element = setting, .source_control = control, .unit = unit, .affinity = @import("page_area_position.zig").canonicalAffinity(unit) });
            }
        }
    }
    return output.toOwnedSlice(a);
}

test "page area source positions bind original empty owner without inline width" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const paragraph = try @import("paragraph_site_owner.zig").resolve(&section.tree, &section.sites, section.locations, 2);
    const segments = try @import("paragraph_text_positions.zig").build(a, &section.tree, &section.sites, section.locations, 2);
    defer a.free(segments);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, owner: usize, positions: []const Segment) !void {
            const rows = try collect(allocator, tree, owner, positions, 2);
            defer allocator.free(rows);
            try std.testing.expectEqual(@as(usize, 2), rows.len);
            try std.testing.expectEqual(@as(u32, 0), rows[0].unit);
            try std.testing.expectEqual(@as(u32, 0), rows[1].unit);
            try std.testing.expect(rows[0].source_control != rows[1].source_control);
        }
    };
    try Probe.run(a, &section.tree, paragraph, segments);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &section.tree, paragraph, segments });
    try std.testing.expectError(error.LimitExceeded, collect(a, &section.tree, paragraph, segments, 1));
    try std.testing.expectError(error.InvalidParagraphElement, collect(a, &section.tree, 0, segments, 2));
    try std.testing.expect(section.structure_values == null);
}
