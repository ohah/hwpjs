//! Created identities are not XML node indices or paragraph IDs.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub fn validateCurrent(session: *const @import("editor_session.zig").Session, identity: u64, instance: u32) !void {
    if (identity == 0 or instance == 0) return error.InvalidCreatedTableIdentity;
    for (session.sections) |section| for (section.created_tables.entries.items) |entry| {
        if (entry.table.identity == identity or entry.table.instance_id == instance) return error.InvalidCreatedTableIdentity;
    };
}
/// Known shared AbstractShapeObjectType IDs, not distinct drawing instid.
const shape_names = [_][]const u8{ "tbl", "pic", "rect", "line", "ellipse", "arc", "polygon", "curve", "connectLine", "container", "ole", "equation", "textart", "chart", "video" };
fn ownsShapeId(element: @import("xml_part_tree.zig").Element) bool {
    for (shape_names) |name| {
        if (element.is(@import("document_xml.zig").paragraph_uri, name)) return true;
    }
    return false;
}
/// Check immutable shared shape IDs, including inactive and nested shapes.
pub fn validateSource(a: std.mem.Allocator, trees: []const Tree, instance: u32) !void {
    if (instance == 0) return error.InvalidCreatedTableIdentity;
    for (trees) |*tree| for (tree.elements, 0..) |element, index| {
        if (!ownsShapeId(element)) continue;
        const id = (try sourceId(a, tree, index)) orelse continue;
        if (id == instance) return error.InvalidCreatedTableIdentity;
    };
}

/// Smallest unused positive ID. Planning only; no reservation or mutation.
pub fn nextSource(a: std.mem.Allocator, trees: []const Tree, current: []const u32) !u32 {
    var used: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer used.deinit(a);
    for (trees) |*tree| for (tree.elements, 0..) |element, index| {
        if (!ownsShapeId(element)) continue;
        if (try sourceId(a, tree, index)) |id| try used.put(a, id, {});
    };
    for (current) |id| {
        if (id == 0 or used.contains(id)) return error.InvalidCreatedTableIdentity;
        try used.put(a, id, {});
    }
    var candidate: u32 = 1;
    while (used.contains(candidate)) candidate = std.math.add(u32, candidate, 1) catch return error.LimitExceeded;
    return candidate;
}

fn sourceId(a: std.mem.Allocator, tree: *const Tree, index: usize) !?u32 {
    const raw = (try tree.attributeValue(a, index, "", "id")) orelse return null;
    const text = try raw.toUtf8(a, 4096);
    defer a.free(text);
    _ = try @import("xml_values.zig").nonNegative(text);
    return @import("xml_values.zig").unsigned32(text) catch |err| switch (err) {
        error.InvalidUnsigned32 => null,
        else => return err,
    };
}

test "created table shared shape IDs reject picture and rectangle but not drawing instid" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic id='7' instid='33'/><p:rect id='+08'/><p:p id='9'/></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.InvalidCreatedTableIdentity, validateSource(a, &.{tree}, 7));
    try std.testing.expectError(error.InvalidCreatedTableIdentity, validateSource(a, &.{tree}, 8));
    try validateSource(a, &.{tree}, 9);
    try validateSource(a, &.{tree}, 33);
}

test "created table source instance IDs preserve wide originals and reject equivalent numbers" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl id='+033'><p:tbl id='4294967296'/></p:tbl><p:p id='34'/></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.InvalidCreatedTableIdentity, validateSource(a, &.{tree}, 33));
    try validateSource(a, &.{tree}, 34);
    try std.testing.expectEqual(@as(u32, 3), try nextSource(a, &.{tree}, &.{ 1, 2 }));
    try std.testing.expectError(error.InvalidCreatedTableIdentity, nextSource(a, &.{tree}, &.{33}));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: Tree) !void {
            try validateSource(allocator, &.{source}, 34);
            try std.testing.expectEqual(@as(u32, 3), try nextSource(allocator, &.{source}, &.{ 1, 2 }));
        }
    }.run, .{tree});
}
