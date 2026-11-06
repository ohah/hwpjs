//! Raw nullable BorderFill observations only: no geometry interpretation or fixtures.
const std = @import("std");
const t = std.testing;
const source = @import("hwpx/border_fill_source.zig");
const header = @import("hwpx/header_tree.zig");
const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:refList><h:borderFills>";
const suffix = "</h:borderFills></h:refList></h:head>";
const names = .{ "slash_crooked", "slash_is_counter", "back_slash_crooked", "back_slash_is_counter", "break_cell_separate_line" };
const complete = "<h:borderFill id='4' breakCellSeparateLine='5'><h:slash type='FUTURE_SLASH' Crooked='2' isCounter='3'/><h:backSlash type='FUTURE_BACK' Crooked='4' isCounter='true'/></h:borderFill>";
fn expectComplete(value: source.Source) !void {
    try t.expectEqualStrings("2", value.slash_crooked.?);
    try t.expectEqualStrings("3", value.slash_is_counter.?);
    try t.expectEqualStrings("4", value.back_slash_crooked.?);
    try t.expectEqualStrings("true", value.back_slash_is_counter.?);
    try t.expectEqualStrings("5", value.break_cell_separate_line.?);
    try t.expectEqualStrings("FUTURE_SLASH", value.slash.?);
    try t.expectEqualStrings("FUTURE_BACK", value.back_slash.?);
    try t.expectEqual(@as(usize, 0), value.unknown_attributes);
}

test "HX diagonal raw absent fields stay null even when direction child exists" {
    var tree = try header.parse(t.allocator, prefix ++ "<h:borderFill id='4'><h:slash/><h:backSlash/></h:borderFill>" ++ suffix, 0, .{});
    defer tree.deinit(t.allocator);
    var value = try source.read(t.allocator, &tree, 4);
    defer value.deinit();
    inline for (names) |name| try t.expect(@field(value, name) == null);
    try t.expect(value.slash_node != null and value.back_slash_node != null);
    const json = try std.json.Stringify.valueAlloc(t.allocator, value, .{});
    defer t.allocator.free(json);
    inline for (names) |name| try t.expect(std.mem.indexOf(u8, json, "\"" ++ name ++ "\":null") != null);
}

test "HX diagonal raw explicit zero is a string distinct from absence" {
    var tree = try header.parse(t.allocator, prefix ++ "<h:borderFill id='4' breakCellSeparateLine='0'><h:slash Crooked='0' isCounter='0'/><h:backSlash Crooked='0' isCounter='0'/></h:borderFill>" ++ suffix, 0, .{});
    defer tree.deinit(t.allocator);
    var value = try source.read(t.allocator, &tree, 4);
    defer value.deinit();
    inline for (names) |name| try t.expectEqualStrings("0", @field(value, name).?);
    try t.expectEqual(@as(usize, 0), value.unknown_attributes);
}

test "HX diagonal raw nonzero and future spellings retain exact decoded text" {
    var tree = try header.parse(t.allocator, prefix ++ complete ++ suffix, 0, .{});
    defer tree.deinit(t.allocator);
    var value = try source.read(t.allocator, &tree, 4);
    defer value.deinit();
    try expectComplete(value);
    const json = try std.json.Stringify.valueAlloc(t.allocator, value, .{});
    defer t.allocator.free(json);
    try t.expect(std.mem.indexOf(u8, json, "\"back_slash_is_counter\":\"true\"") != null);
}

test "HX diagonal raw entities are decoded and unknown attribute counts are preserved" {
    var tree = try header.parse(t.allocator, prefix ++ "<h:borderFill id='4' breakCellSeparateLine='&#53;' future='1'><h:slash Crooked='&#x32;' isCounter='A&amp;B' extra='x'/><h:backSlash Crooked='' isCounter='&#48;'/></h:borderFill>" ++ suffix, 0, .{});
    defer tree.deinit(t.allocator);
    var value = try source.read(t.allocator, &tree, 4);
    defer value.deinit();
    try t.expectEqualStrings("5", value.break_cell_separate_line.?);
    try t.expectEqualStrings("2", value.slash_crooked.?);
    try t.expectEqualStrings("A&B", value.slash_is_counter.?);
    try t.expectEqualStrings("", value.back_slash_crooked.?);
    try t.expectEqualStrings("0", value.back_slash_is_counter.?);
    try t.expectEqual(@as(usize, 2), value.unknown_attributes);
}

test "HX diagonal raw namespace and exact attribute spelling do not manufacture values" {
    var tree = try header.parse(t.allocator, prefix ++ "<h:borderFill id='4' f:breakCellSeparateLine='1'><h:slash f:Crooked='2' crooked='3' f:isCounter='1'/><h:backSlash IsCounter='1'/></h:borderFill>" ++ suffix, 0, .{});
    defer tree.deinit(t.allocator);
    var value = try source.read(t.allocator, &tree, 4);
    defer value.deinit();
    inline for (names) |name| try t.expect(@field(value, name) == null);
    try t.expectEqual(@as(usize, 5), value.unknown_attributes);
}

test "HX diagonal raw indexed source read equals direct selected resource without cross resource leakage" {
    var tree = try header.parse(t.allocator, prefix ++ "<h:borderFill id='3' breakCellSeparateLine='OTHER'/>" ++ complete ++ suffix, 0, .{});
    defer tree.deinit(t.allocator);
    var index = source.Index.init(t.allocator, &tree);
    defer index.deinit();
    var indexed = try source.readWithIndex(t.allocator, &tree, 4, &index);
    defer indexed.deinit();
    var direct = try source.read(t.allocator, &tree, 4);
    defer direct.deinit();
    try expectComplete(indexed);
    inline for (names) |name| try t.expectEqualStrings(@field(direct, name).?, @field(indexed, name).?);
}

test "HX diagonal raw copied strings survive XML tree and borrowed source release" {
    const xml = try t.allocator.dupe(u8, prefix ++ complete ++ suffix);
    var tree = try header.parse(t.allocator, xml, 0, .{});
    var value = source.read(t.allocator, &tree, 4) catch |err| {
        tree.deinit(t.allocator);
        t.allocator.free(xml);
        return err;
    };
    defer value.deinit();
    tree.deinit(t.allocator);
    @memset(xml, 'X');
    t.allocator.free(xml);
    try expectComplete(value);
}

fn directAllocations(a: std.mem.Allocator, tree: *const header.Tree) !void {
    var value = try source.read(a, tree, 4);
    defer value.deinit();
    try expectComplete(value);
}
fn indexedAllocations(a: std.mem.Allocator, tree: *const header.Tree) !void {
    var index = source.Index.init(a, tree);
    defer index.deinit();
    var value = try source.readWithIndex(a, tree, 4, &index);
    defer value.deinit();
    try expectComplete(value);
}
test "HX diagonal raw every direct and indexed allocation failure releases owned arena and index" {
    var tree = try header.parse(t.allocator, prefix ++ complete ++ suffix, 0, .{});
    defer tree.deinit(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, directAllocations, .{&tree});
    try t.checkAllAllocationFailures(t.allocator, indexedAllocations, .{&tree});
}
