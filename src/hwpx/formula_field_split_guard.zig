//! A formula's paired markers must move together; this is not text-edit permission.
const std = @import("std");
const fields = @import("field_markers.zig");
const plan = @import("field_split_plan.zig");

pub fn validate(a: std.mem.Allocator, report: *const fields.Report, section: usize, moves: []const plan.Move) !void {
    return validateMode(a, report, section, moves, null);
}

const Range = struct { start: usize, end: usize };
pub fn validateRange(a: std.mem.Allocator, report: *const fields.Report, section: usize, moves: []const plan.Move, start: usize, end: usize) !void {
    if (end < start) return error.InvalidTextPosition;
    return validateMode(a, report, section, moves, .{ .start = start, .end = end });
}

fn validateMode(a: std.mem.Allocator, report: *const fields.Report, section: usize, moves: []const plan.Move, range: ?Range) !void {
    var source: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer source.deinit(a);
    for (report.markers, 0..) |marker, index| {
        if (marker.section_ordinal != section) continue;
        const entry = try source.getOrPut(a, marker.element_index);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = index;
    }
    const Point = struct { side: plan.Side, unit: usize };
    var sides: std.AutoHashMapUnmanaged(usize, Point) = .empty;
    defer sides.deinit(a);
    for (moves) |move| {
        const index = source.get(move.position.element_index) orelse return error.SourceBindingMismatch;
        const marker = report.markers[index];
        if (marker.kind != move.position.kind) return error.SourceBindingMismatch;
        const paired = marker.matched_marker_index orelse return error.InvalidFieldLinks;
        if (paired >= report.markers.len or report.markers[paired].matched_marker_index != index or report.markers[paired].kind == marker.kind or report.markers[paired].section_ordinal != section) return error.InvalidFieldLinks;
        const begin = if (marker.kind == .begin) marker else report.markers[paired];
        if (move.position.begin_element != begin.element_index) return error.SourceBindingMismatch;
        const entry = try sides.getOrPut(a, marker.element_index);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = .{ .side = move.side, .unit = move.position.unit };
    }
    for (moves) |move| {
        const marker = report.markers[source.get(move.position.element_index).?];
        const paired = report.markers[marker.matched_marker_index.?];
        const begin = if (marker.kind == .begin) marker else paired;
        const kind = (begin.begin orelse return error.InvalidFieldLinks).type_raw orelse return error.UnsupportedStructuralFieldEdit;
        if (!std.mem.eql(u8, kind, "FORMULA")) continue;
        const other = sides.get(paired.element_index) orelse return error.UnsupportedStructuralFieldEdit;
        if (other.side != move.side) return error.ProtectedFieldRange;
        if (range) |selection| {
            const start = sides.get(begin.element_index).?.unit;
            const end = if (marker.kind == .begin) other.unit else move.position.unit;
            if (end < start) return error.InvalidFieldPositions;
            if (selection.start == selection.end) {
                if (start < selection.start and selection.start < end) return error.ProtectedFieldRange;
            } else if (selection.start < end and selection.end > start) return error.ProtectedFieldRange;
        }
    }
}

test "formula split ownership guard keeps paired markers together through allocation failures" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='FORMULA'/></p:ctrl><p:t>4</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var report = try fields.inspect(a, &.{tree}, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.markers.len);
    const begin = report.markers[0].element_index;
    var moves: [2]plan.Move = undefined;
    for (report.markers, &moves) |marker, *move| move.* = .{ .position = .{ .element_index = marker.element_index, .begin_element = begin, .kind = marker.kind, .unit = 0 }, .side = .right, .unit = 0 };
    try validate(a, &report, 0, &moves);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const fields.Report, original: []const plan.Move) !void {
            try validate(allocator, borrowed, 0, original);
        }
    }.run, .{ &report, &moves });
    moves[1].side = .left;
    try std.testing.expectError(error.ProtectedFieldRange, validate(a, &report, 0, &moves));
    moves[1].side = .right;
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, validate(a, &report, 0, moves[0..1]));
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &report, 1, &moves));
    moves[1].position.begin_element += 1;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &report, 0, &moves));
}
