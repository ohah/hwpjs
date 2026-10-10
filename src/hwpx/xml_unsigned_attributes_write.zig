//! Writes selected unsigned attributes without changing unrelated XML lexemes.
//! Element ownership and dimension semantics belong to the caller.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
fn equal(a: std.mem.Allocator, raw: @import("../xml/attribute_value.zig").Value, value: u32) !bool {
    return try fields.unsigned(a, raw, 4096) == value;
}
fn serialize(a: std.mem.Allocator, quote: u8, value: u32) ![]u8 {
    return std.fmt.allocPrint(a, "{c}{d}{c}", .{ quote, value, quote });
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, comptime names: []const []const u8, values: [names.len]u32, max_bytes: usize) ![]u8 {
    return @import("xml_numeric_attributes_write.zig").write(a, tree, node, names, u32, values, equal, serialize, max_bytes) catch |err| switch (err) {
        error.MissingXmlNumericAttribute => error.MissingXmlUnsignedAttribute,
        else => err,
    };
}

test "HWPX unsigned attribute writer preserves size ownership and every allocation failure" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'><p:sz x:width='999' height = \"20\" opaque='keep' width='&#49;'/></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 1, &.{ "width", "height" }, .{ 0, 4294967295 }, 1000);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<p:sz x:width='999' height = \"4294967295\" opaque='keep' width='0'/>", output);
        }
    }.run, .{&tree});
    const unchanged = try write(a, &tree, 1, &.{ "width", "height" }, .{ 1, 20 }, 1000);
    defer a.free(unchanged);
    const span = tree.elements[1].start_tag;
    try std.testing.expectEqualStrings(input[span.start..span.end], unchanged);
    try std.testing.expectError(error.MissingXmlUnsignedAttribute, write(a, &tree, 1, &.{"absent"}, .{1}, 1000));
    try std.testing.expectError(error.InvalidXmlAttributeNode, write(a, &tree, tree.elements.len, &.{"width"}, .{1}, 1000));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, &.{"width"}, .{0}, 1));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX unsigned attribute writer rejects missing attribute after earlier replacement with allocation cleanup" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'><p:sz width='1' x:height='20'/></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = write(allocator, source, 1, &.{ "width", "height" }, .{ 9, 20 }, 1000) catch |err| {
                if (err == error.MissingXmlUnsignedAttribute) return;
                return err;
            };
            defer allocator.free(output);
            return error.UnexpectedAttributeWriteSuccess;
        }
    }.run, .{&tree});
    try std.testing.expectError(error.MissingXmlUnsignedAttribute, write(a, &tree, 1, &.{ "width", "height" }, .{ 9, 20 }, 1000));
    try std.testing.expectEqualStrings(input, tree.source);
}
