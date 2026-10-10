//! Created identities are not XML node indices or paragraph IDs.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub fn validateCurrent(session: *const @import("editor_session.zig").Session, identity: u64, instance: u32) !void {
    if (identity == 0 or instance == 0) return error.InvalidCreatedTableIdentity;
    for (session.sections) |section| for (section.created_tables.entries.items) |entry| {
        if (entry.table.identity == identity or entry.table.instance_id == instance) return error.InvalidCreatedTableIdentity;
    };
}
/// Check source table instances, including inactive and nested tables.
/// Other object namespaces require their own explicit policy.
pub fn validateSource(a: std.mem.Allocator, trees: []const Tree, instance: u32) !void {
    if (instance == 0) return error.InvalidCreatedTableIdentity;
    for (trees) |*tree| for (tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "tbl")) continue;
        const raw = (try tree.attributeValue(a, index, "", "id")) orelse continue;
        const text = try raw.toUtf8(a, 4096);
        defer a.free(text);
        _ = try @import("xml_values.zig").nonNegative(text);
        const id = @import("xml_values.zig").unsigned32(text) catch |err| switch (err) {
            error.InvalidUnsigned32 => continue,
            else => return err,
        };
        if (id == instance) return error.InvalidCreatedTableIdentity;
    };
}

test "created table source instance IDs preserve wide originals and reject equivalent numbers" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl id='+033'><p:tbl id='4294967296'/></p:tbl><p:p id='34'/></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.InvalidCreatedTableIdentity, validateSource(a, &.{tree}, 33));
    try validateSource(a, &.{tree}, 34);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: Tree) !void {
            try validateSource(allocator, &.{source}, 34);
        }
    }.run, .{tree});
}
