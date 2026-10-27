//! 직접 head:shadow의 알려진 필드만 관측·교체하며 opaque XML은 건드리지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const shadow = @import("../model/character_shadow.zig");
const head = @import("document_xml.zig").head_uri;
pub const Value = struct { present: bool = false, kind: ?shadow.Kind = null, offset_x: ?i32 = null, offset_y: ?i32 = null, color: ?u32 = null, @"opaque": bool = false };
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Value {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (node >= tree.elements.len or !tree.elements[node].is(head, "charPr")) return error.InvalidCharacterShapeElement;
    var child = tree.elements[node].first_child;
    var found: ?usize = null;
    while (child) |index| : (child = tree.elements[index].next_sibling) if (tree.elements[index].is(head, "shadow")) {
        if (found != null) return error.DuplicateCharacterShadow;
        found = index;
    };
    const index = found orelse return .{};
    var value: Value = .{ .present = true };
    if (try tree.attributeValue(a, index, "", "type")) |raw| {
        const text = try raw.toUtf8(a, 4096);
        defer a.free(text);
        if (std.mem.eql(u8, text, "NONE")) value.kind = .none else if (std.mem.eql(u8, text, "DROP")) value.kind = .drop else if (std.mem.eql(u8, text, "CONTINUOUS")) value.kind = .continuous else value.@"opaque" = true;
    }
    inline for (.{ .{ "offsetX", "offset_x" }, .{ "offsetY", "offset_y" } }) |entry| if (try tree.attributeValue(a, index, "", entry[0])) |raw| {
        const text = try raw.toUtf8(a, 4096);
        defer a.free(text);
        if (@import("xml_values.zig").signed32(text)) |v| {
            @field(value, entry[1]) = v;
        } else |_| {
            value.@"opaque" = true;
        }
    };
    if (try tree.attributeValue(a, index, "", "color")) |raw| {
        const text = try raw.toUtf8(a, 4096);
        defer a.free(text);
        value.color = @import("../model/rgb_color.zig").xml(text);
    }
    return value;
}
fn upper(kind: shadow.Kind) []const u8 {
    return switch (kind) {
        .none => "NONE",
        .drop => "DROP",
        .continuous => "CONTINUOUS",
    };
}
pub fn matches(value: Value, patch: shadow.Patch) bool {
    if (!shadow.has(patch)) return true;
    if (!value.present or value.@"opaque" or value.kind == null) return false;
    return (patch.kind == null or patch.kind == value.kind) and (patch.offset_x == null or patch.offset_x == value.offset_x) and (patch.offset_y == null or patch.offset_y == value.offset_y) and (patch.color == null or patch.color == value.color);
}
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, patch: shadow.Patch, limit: usize) ![]u8 {
    try shadow.validate(patch);
    const value = try read(a, tree, node);
    if (!shadow.has(patch)) return a.dupe(u8, tree.sourceOf(node));
    if (value.@"opaque" or (value.present and value.kind == null)) return error.UnsupportedCharacterShadowSource;
    const kind = patch.kind orelse value.kind;
    const x = patch.offset_x orelse value.offset_x;
    const y = patch.offset_y orelse value.offset_y;
    const color = patch.color orelse value.color;
    if (!value.present or kind != .none) if (kind == null or x == null or y == null or color == null) return error.IncompleteCharacterShadow;
    if (!value.present) {
        if (!shadow.complete(patch)) return error.IncompleteCharacterShadow;
        const rgb = try @import("../model/rgb_color.zig").format(a, color.?);
        defer a.free(rgb);
        const fragment = try std.fmt.allocPrint(a, "<shadow xmlns=\"{s}\" type=\"{s}\" color=\"{s}\" offsetX=\"{d}\" offsetY=\"{d}\"/>", .{ head, upper(kind.?), rgb, x.?, y.? });
        defer a.free(fragment);
        return @import("character_child_insert.zig").write(a, tree, node, fragment, &.{ "emboss", "engrave", "supscript", "subscript" }, limit);
    }
    if (matches(value, patch)) return a.dupe(u8, tree.sourceOf(node));
    var current = try a.dupe(u8, tree.source);
    defer a.free(current);
    inline for (.{ .{ "kind", "type" }, .{ "offset_x", "offsetX" }, .{ "offset_y", "offsetY" }, .{ "color", "color" } }) |entry| if (@field(patch, entry[0])) |requested| {
        var parsed = try @import("xml_part_tree.zig").parse(a, current, .header, null, tree.item_index, .{ .max_xml_bytes = limit });
        defer parsed.deinit(a);
        const text = if (comptime std.mem.eql(u8, entry[0], "kind")) try a.dupe(u8, upper(requested)) else if (comptime std.mem.eql(u8, entry[0], "color")) try @import("../model/rgb_color.zig").format(a, requested) else try std.fmt.allocPrint(a, "{d}", .{requested});
        defer a.free(text);
        const fragment = try @import("character_child_attribute_patch.zig").write(a, &parsed, node, "shadow", entry[1], text, limit);
        defer a.free(fragment);
        const next = try @import("xml_source_writer.zig").write(a, current, &.{.{ .start = parsed.elements[node].start_tag.start, .end = parsed.elements[node].end, .text = "", .serialized_xml = fragment }}, limit);
        a.free(current);
        current = next;
    };
    var parsed = try @import("xml_part_tree.zig").parse(a, current, .header, null, tree.item_index, .{ .max_xml_bytes = limit });
    defer parsed.deinit(a);
    return a.dupe(u8, parsed.sourceOf(node));
}
pub fn matchesCurrent(session: *@import("editor_session.zig").Session, id: u32, patch: ?shadow.Patch) !bool {
    const intent = patch orelse return true;
    const a = session.allocator;
    var context = try @import("formatting_preflight.zig").Context.init(a, session);
    defer context.deinit();
    const node = try @import("formatting_preflight.zig").node(a, &context.tree, "charPr", id);
    return matches(try read(a, &context.tree, node), intent);
}
