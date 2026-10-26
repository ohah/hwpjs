//! Current tab positions reuse the owned character projection; raw XML is provenance only.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Row = struct {
    unit: usize,
    node: usize,
    width: ?[]u8 = null,
    tab_type: ?[]u8 = null,
    leader: ?[]u8 = null,
    pub fn deinit(self: *Row, a: std.mem.Allocator) void {
        if (self.width) |value| a.free(value);
        if (self.tab_type) |value| a.free(value);
        if (self.leader) |value| a.free(value);
        self.* = undefined;
    }
};

pub fn deinit(a: std.mem.Allocator, rows: []Row) void {
    for (rows) |*row| row.deinit(a);
    a.free(rows);
}

fn attribute(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?[]u8 {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return null;
    return try raw.toUtf8(a, 4096);
}

fn values(a: std.mem.Allocator, tree: *const Tree, node: usize, unit: usize) !Row {
    if (!@import("retained_tab.zig").supported(tree, node)) return error.InvalidInlineTabSource;
    var row = Row{ .unit = unit, .node = node };
    errdefer row.deinit(a);
    row.width = try attribute(a, tree, node, "width");
    row.tab_type = try attribute(a, tree, node, "type");
    row.leader = try attribute(a, tree, node, "leader");
    return row;
}

pub fn read(session: *const @import("editor_session.zig").Session, section: usize, paragraph: usize) ![]Row {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const a = session.allocator;
    const spans = try @import("character_style_snapshot.zig").read(session, section, paragraph);
    defer a.free(spans);
    const tree = &session.sections[section].tree;
    var output: std.ArrayList(Row) = .empty;
    errdefer {
        for (output.items) |*row| row.deinit(a);
        output.deinit(a);
    }
    var nodes: std.AutoHashMap(usize, void) = .init(a);
    defer nodes.deinit();
    for (spans) |span| {
        const node = span.inline_element orelse continue;
        const kind = @import("retained_inline_unit.zig").kind(tree, node) orelse return error.InvalidInlineTabSource;
        if (kind != .tab) continue;
        if (span.end_unit <= span.start_unit or span.end_unit - span.start_unit != 1 or output.items.len > 0 and span.start_unit <= output.items[output.items.len - 1].unit) return error.InvalidTextSites;
        const entry = try nodes.getOrPut(node);
        if (entry.found_existing) return error.SourceBindingMismatch;
        var row = try values(a, tree, node, span.start_unit);
        errdefer row.deinit(a);
        try output.append(a, row);
    }
    return output.toOwnedSlice(a);
}

test "HWPX current tab snapshot keeps missing and opaque normalized source values" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t><p:tab width='12&#48;' type='FUTURE' leader='0'/><p:tab/></p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            var row = try values(allocator, input, 4, 3);
            defer row.deinit(allocator);
            try std.testing.expectEqualStrings("120", row.width.?);
            try std.testing.expectEqualStrings("FUTURE", row.tab_type.?);
            try std.testing.expectEqualStrings("0", row.leader.?);
            var missing = try values(allocator, input, 5, 4);
            defer missing.deinit(allocator);
            try std.testing.expect(missing.width == null and missing.tab_type == null and missing.leader == null);
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{&tree});
    try std.testing.expectError(error.InvalidInlineTabSource, values(a, &tree, 0, 0));
}

test "HWPX current tab snapshot follows actual prefix edits and detached ownership" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/pr-1674.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const original = try read(&session, 0, 78);
    defer deinit(a, original);
    try std.testing.expectEqual(@as(usize, 1), original.len);
    try std.testing.expectEqual(@as(usize, 0), original[0].unit);
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, bytes, unchanged);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: *const @import("editor_session.zig").Session, unit: usize) !void {
            var view = input.*;
            view.allocator = allocator;
            const rows = try read(&view, 0, 78);
            defer deinit(allocator, rows);
            try std.testing.expectEqual(@as(usize, 1), rows.len);
            try std.testing.expectEqual(unit, rows[0].unit);
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &session, @as(usize, 0) });
    try std.testing.expect(try session.splice(0, 78, 0, 0, "앞😀"));
    const changed = try read(&session, 0, 78);
    defer deinit(a, changed);
    try std.testing.expectEqual(@as(usize, 3), changed[0].unit);
    try std.testing.expectEqual(original[0].node, changed[0].node);
    try std.testing.expectEqualStrings(original[0].width.?, changed[0].width.?);
    changed[0].width.?[0] = '9';
    const fresh = try read(&session, 0, 78);
    defer deinit(a, fresh);
    try std.testing.expectEqualStrings(original[0].width.?, fresh[0].width.?);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &session, @as(usize, 3) });
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const restored = try read(&reopened, 0, 78);
    defer deinit(a, restored);
    try std.testing.expectEqual(@as(usize, 3), restored[0].unit);
    try std.testing.expectEqualStrings(original[0].width.?, restored[0].width.?);
    try std.testing.expectError(error.InvalidSectionIndex, read(&session, session.sections.len, 78));
}

test "HWPX current tab snapshot provenance does not alter HCR1 wire" {
    const a = std.testing.allocator;
    const Range = @import("character_style_display_ranges.zig").Range;
    const before = try @import("../wasm/character_ranges_wire.zig").encode(a, &[_]Range{.{ .start_unit = 0, .end_unit = 1, .char_shape_id = 0 }});
    defer a.free(before);
    const after = try @import("../wasm/character_ranges_wire.zig").encode(a, &[_]Range{.{ .start_unit = 0, .end_unit = 1, .char_shape_id = 0, .inline_element = 4 }});
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
