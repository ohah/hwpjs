//! Source-preserving scalar upsert. Callers select owners and supply validated ASCII scalars.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const writer = @import("xml_source_writer.zig");
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, comptime names: []const []const u8, values: [names.len][]const u8, max_bytes: usize) ![]u8 {
    if (node >= tree.elements.len or tree.elements[node].name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const span = tree.elements[node].start_tag;
    const raw = tree.source[span.start..span.end];
    var attrs: [names.len]?@import("../xml/attribute_value.zig").Value = undefined;
    try tree.unprefixedAttributeValues(a, node, names, &attrs);
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var changes: std.ArrayList(writer.Change) = .empty;
    var missing: std.ArrayList(u8) = .empty;
    for (attrs, names, values) |attribute, name, value| {
        if (value.len == 0 or value.len > 64) return error.InvalidXmlScalar;
        for (value) |c| if (!std.ascii.isAlphanumeric(c) and c != '_') return error.InvalidXmlScalar;
        if (attribute) |existing| {
            const decoded = try existing.toUtf8(scratch, 4096);
            const equal = if (std.ascii.isDigit(value[0]))
                try @import("xml_values.zig").unsigned32(decoded) == try std.fmt.parseInt(u32, value, 10)
            else
                std.mem.eql(u8, std.mem.trim(u8, decoded, " \t\r\n"), value);
            if (equal) continue;
            const start = @intFromPtr(existing.raw.ptr) - @intFromPtr(raw.ptr);
            const replacement = try std.fmt.allocPrint(scratch, "{c}{s}{c}", .{ existing.raw[0], value, existing.raw[0] });
            try changes.append(scratch, .{ .start = start, .end = start + existing.raw.len, .text = "", .serialized_xml = replacement });
        } else {
            const extra = try std.fmt.allocPrint(scratch, " {s}=\"{s}\"", .{ name, value });
            try missing.appendSlice(scratch, extra);
        }
    }
    if (missing.items.len != 0) {
        const end = raw.len - @as(usize, if (std.mem.endsWith(u8, raw, "/>")) 2 else 1);
        try changes.append(scratch, .{ .start = end, .end = end, .text = "", .serialized_xml = missing.items });
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, l: writer.Change, r: writer.Change) bool {
            return l.start < r.start;
        }
    }.less);
    return writer.write(a, raw, changes.items, max_bytes);
}
