//! Serialize a run's numeric style attribute; preserve every other byte.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub fn write(a: std.mem.Allocator, tree: *const Tree, index: usize, id: u32, limit: usize) ![]u8 {
    if (index >= tree.elements.len) return error.InvalidElementIndex;
    const run = tree.elements[index];
    if (!run.is(@import("document_xml.zig").paragraph_uri, "run")) return error.InvalidRunElement;
    if (run.name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const raw = tree.source[run.start_tag.start..run.start_tag.end];
    const attribute = try tree.attributeValue(a, index, "", "charPrIDRef");
    var buffer: [64]u8 = undefined;
    var start: usize = undefined;
    var end: usize = undefined;
    var replacement: []const u8 = undefined;
    if (attribute) |value| {
        const decoded = try value.toUtf8(a, 4096);
        defer a.free(decoded);
        if (try @import("xml_values.zig").unsigned32(decoded) == id) {
            if (raw.len > limit) return error.LimitExceeded;
            return a.dupe(u8, raw);
        }
        start = @intFromPtr(value.raw.ptr) - @intFromPtr(raw.ptr);
        end = start + value.raw.len;
        replacement = try std.fmt.bufPrint(&buffer, "{c}{d}{c}", .{ value.raw[0], id, value.raw[0] });
    } else {
        start = raw.len - (if (std.mem.endsWith(u8, raw, "/>")) @as(usize, 2) else 1);
        end = start;
        replacement = try std.fmt.bufPrint(&buffer, " charPrIDRef=\"{d}\"", .{id});
    }
    // Only numeric IDs and the original quote enter this trusted fragment.
    // Source assembly and its byte budget belong to the shared writer.
    return @import("xml_source_writer.zig").write(a, raw, &.{.{
        .start = start,
        .end = end,
        .text = "",
        .serialized_xml = replacement,
    }}, limit);
}
