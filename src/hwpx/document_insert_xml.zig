//! XML spans and reference rewriting for the bounded document insertion profile.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Tag = @import("../xml/root.zig").tags.Tag;
const xml = @import("../xml/root.zig");
const fields = @import("table_xml_fields.zig");
const source_writer = @import("xml_source_writer.zig");

pub fn opening(tree: *const Tree, index: usize) []const u8 {
    const span = tree.elements[index].start_tag;
    return tree.source[span.start..span.end];
}

pub fn tag(a: std.mem.Allocator, tree: *const Tree, index: usize, names: []const []const u8) !Tag {
    var parsed = try @import("xml_part_attributes.zig").parseStartTag(a, tree, index);
    errdefer parsed.deinit(a);
    for (parsed.attributes) |attribute| {
        const name = try xml.qname.parse(attribute.name);
        if (name.prefix != null) return error.UnsupportedInsertAttribute;
        for (names) |allowed| {
            if (name.local.equals(allowed, false)) break;
        } else return error.UnsupportedInsertAttribute;
    }
    return parsed;
}

pub fn number(a: std.mem.Allocator, tree: *const Tree, index: usize, name: []const u8) !u32 {
    const raw = (try tree.attributeValue(a, index, "", name)) orelse return error.MissingInsertReference;
    return fields.unsigned(a, raw, 32);
}

pub fn replaceNumber(a: std.mem.Allocator, tree: *const Tree, index: usize, name: []const u8, value: u32, changes: *std.ArrayList(source_writer.Change)) !void {
    const raw = (try tree.attributeValue(a, index, "", name)) orelse return error.MissingInsertReference;
    if (raw.text.encoding != .utf8) return error.UnsupportedInsertEncoding;
    const start = @intFromPtr(raw.text.raw.ptr) - @intFromPtr(tree.source.ptr);
    const digits = try std.fmt.allocPrint(a, "{d}", .{value});
    try changes.append(a, .{ .start = start, .end = start + raw.text.raw.len, .text = "", .serialized_xml = digits });
}

pub fn fragment(a: std.mem.Allocator, tree: *const Tree, index: usize, changes: []source_writer.Change, limit: usize) ![]u8 {
    const base = tree.elements[index].start_tag.start;
    for (changes) |*change| {
        if (change.start < base or change.end > tree.elements[index].end) return error.InvalidSourceSpan;
        change.start -= base;
        change.end -= base;
    }
    return write(a, tree.sourceOf(index), changes, limit);
}

pub fn write(a: std.mem.Allocator, bytes: []const u8, changes: []source_writer.Change, limit: usize) ![]u8 {
    std.mem.sort(source_writer.Change, changes, {}, struct {
        fn less(_: void, left: source_writer.Change, right: source_writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return source_writer.write(a, bytes, changes, limit);
}

pub fn append(a: std.mem.Allocator, list: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > limit -| list.items.len) return error.LimitExceeded;
    try list.appendSlice(a, bytes);
}

pub fn requireValue(a: std.mem.Allocator, tree: *const Tree, index: usize, name: []const u8, value: []const u8) !void {
    const attribute = (try tree.attributeValue(a, index, "", name)) orelse return error.MissingInsertReference;
    const normalized = try attribute.toUtf8(a, 64);
    defer a.free(normalized);
    if (!std.mem.eql(u8, normalized, value)) return error.UnsupportedInsertAttribute;
}
