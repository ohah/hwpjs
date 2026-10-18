//! Source automatic-number values; sequence recalculation belongs elsewhere.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const numbers = @import("number_controls.zig");
const fields = @import("number_control_fields.zig");
pub const Row = struct { number_node: usize, anchor_node: ?usize, values: fields.Auto, format: ?fields.Format };
pub const Snapshot = struct {
    report: numbers.Report,
    rows: []Row,
    pub fn deinit(self: *Snapshot, a: std.mem.Allocator) void {
        a.free(self.rows);
        self.report.deinit();
        self.* = undefined;
    }
};
pub fn read(a: std.mem.Allocator, tree: *const Tree) !Snapshot {
    var report = try numbers.inspectSection(a, tree, .{});
    errdefer report.deinit();
    var rows: std.ArrayList(Row) = .empty;
    defer rows.deinit(a);
    for (report.controls) |control| {
        if (control.kind != .auto_num) continue;
        if (rows.items.len >= 100000) return error.LimitExceeded;
        const parent = tree.elements[control.element_index].parent;
        const anchor = if (parent) |node| if (@import("run_anchor.zig").kind(tree, node) == .automatic_number) node else null else null;
        const format = if (control.format_count == 1) report.formats[control.first_format].attributes else null;
        try rows.append(a, .{ .number_node = control.element_index, .anchor_node = anchor, .values = control.auto.?, .format = format });
    }
    return .{ .report = report, .rows = try rows.toOwnedSlice(a) };
}

test "HWPX automatic number source snapshot actual captions and allocation failures" {
    try @import("../testing/checked_allocator.zig").run(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-caption.hwpx", a, .limited(4_000_000));
            defer a.free(bytes);
            var session = try @import("editor_session.zig").open(a, bytes, .{});
            defer session.deinit();
            const check = struct {
                fn run(allocator: std.mem.Allocator, tree: *const Tree) !void {
                    var snapshot = try read(allocator, tree);
                    defer snapshot.deinit(allocator);
                    try std.testing.expectEqual(@as(usize, 8), snapshot.rows.len);
                    for (snapshot.rows, 0..) |row, index| {
                        try std.testing.expectEqual(@as(?i32, @intCast(index + 1)), row.values.num);
                        try std.testing.expectEqualStrings("TABLE", row.values.get(.num_type).?);
                        try std.testing.expect(row.anchor_node != null);
                        try std.testing.expectEqualStrings("DIGIT", row.format.?.get(.type).?);
                        try std.testing.expectEqual(@as(?bool, false), row.format.?.supscript);
                    }
                }
            }.run;
            try check(a, &session.sections[0].tree);
            try std.testing.checkAllAllocationFailures(a, check, .{&session.sections[0].tree});
        }
    }.run, .{});
}

test "HWPX automatic number source snapshot selected ordinal preserves strict document ordering" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:autoNum num='2' numType='TABLE'/></p:ctrl><p:t>A</p:t></p:run></p:p></s:sec>", 0, 1, .{});
    defer tree.deinit(a);
    tree.section_ordinal = 1;
    try std.testing.expectError(error.InvalidPartKind, numbers.inspect(a, &.{tree}, .{}));
    var snapshot = try read(a, &tree);
    defer snapshot.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), snapshot.rows.len);
    try std.testing.expectEqual(@as(usize, 1), snapshot.report.controls[0].section_ordinal);
}
