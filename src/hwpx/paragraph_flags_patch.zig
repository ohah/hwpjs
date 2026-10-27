//! paraPr와 기존 border의 명시 bool만 변경합니다. XSD default를 원본으로 만들지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const head = @import("document_xml.zig").head_uri;
pub const Patch = @import("../model/paragraph_flags.zig").Patch;
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !@import("../model/paragraph_flags.zig").Value {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (node >= tree.elements.len or !tree.elements[node].is(head, "paraPr")) return error.InvalidParagraphDisplayElement;
    var result: @import("../model/paragraph_flags.zig").Value = .{};
    if (try tree.attributeValue(a, node, "", "snapToGrid")) |raw| result.grid = try optionalBoolean(a, raw);
    var border: ?usize = null;
    if (@import("paragraph_display_children.zig").child(a, tree, node, head, "border")) |child| {
        border = child;
    } else |err| {
        if (err == error.OutOfMemory) return err;
    }
    if (border) |child| {
        const id = (try tree.attributeValue(a, child, "", "borderFillIDRef")) orelse return result;
        if (@import("table_xml_fields.zig").unsigned(a, id, 4096)) |_| {} else |err| {
            if (err == error.OutOfMemory) return err;
            return result;
        }
        if (try tree.attributeValue(a, child, "", "connect")) |raw| result.border_connect = try optionalBoolean(a, raw);
    }
    return result;
}
fn optionalBoolean(a: std.mem.Allocator, raw: anytype) !?bool {
    if (boolean(a, raw)) |value| return value else |err| {
        if (err == error.OutOfMemory) return err;
        return null;
    }
}
fn boolean(a: std.mem.Allocator, raw: anytype) !bool {
    const text = try raw.toUtf8(a, 4096);
    defer a.free(text);
    if (std.mem.eql(u8, text, "true") or std.mem.eql(u8, text, "1")) return true;
    if (std.mem.eql(u8, text, "false") or std.mem.eql(u8, text, "0")) return false;
    return error.InvalidParagraphFlag;
}
fn attribute(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8, value: bool, limit: usize) ![]u8 {
    const raw = try tree.attributeValue(a, node, "", name);
    const replacement = if (raw) |field| try std.fmt.allocPrint(a, "{c}{d}{c}", .{ field.raw[0], @intFromBool(value), field.raw[0] }) else try std.fmt.allocPrint(a, " {s}=\"{d}\"", .{ name, @intFromBool(value) });
    defer a.free(replacement);
    const start = if (raw) |field| @intFromPtr(field.raw.ptr) - @intFromPtr(tree.source.ptr) else tree.elements[node].start_tag.end - (if (tree.elements[node].end_tag == null) @as(usize, 2) else 1);
    return @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = start, .end = start + if (raw) |field| field.raw.len else @as(usize, 0), .text = "", .serialized_xml = replacement }}, limit);
}
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, patch: Patch, limit: usize) ![]u8 {
    _ = try read(a, tree, node);
    if (patch.grid != null) if (try tree.attributeValue(a, node, "", "snapToGrid")) |raw| {
        _ = try boolean(a, raw);
    };
    if (patch.border_connect != null) {
        const child = (try @import("paragraph_display_children.zig").child(a, tree, node, head, "border")) orelse return error.MissingParagraphBorder;
        const id = (try tree.attributeValue(a, child, "", "borderFillIDRef")) orelse return error.MissingParagraphBorderReference;
        _ = try @import("table_xml_fields.zig").unsigned(a, id, 4096);
        if (try tree.attributeValue(a, child, "", "connect")) |raw| {
            _ = try boolean(a, raw);
        }
    }
    var current = try a.dupe(u8, tree.source);
    defer a.free(current);
    if (patch.grid) |value| {
        var parsed = try @import("xml_part_tree.zig").parse(a, current, .header, null, tree.item_index, .{ .max_xml_bytes = limit });
        defer parsed.deinit(a);
        const next = try attribute(a, &parsed, node, "snapToGrid", value, limit);
        a.free(current);
        current = next;
    }
    if (patch.border_connect) |value| {
        var parsed = try @import("xml_part_tree.zig").parse(a, current, .header, null, tree.item_index, .{ .max_xml_bytes = limit });
        defer parsed.deinit(a);
        const child = (try @import("paragraph_display_children.zig").child(a, &parsed, node, head, "border")) orelse return error.MissingParagraphBorder;
        const next = try attribute(a, &parsed, child, "connect", value, limit);
        a.free(current);
        current = next;
    }
    var parsed = try @import("xml_part_tree.zig").parse(a, current, .header, null, tree.item_index, .{ .max_xml_bytes = limit });
    defer parsed.deinit(a);
    return a.dupe(u8, parsed.sourceOf(node));
}
