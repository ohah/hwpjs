//! Derived continuation start tag; preserve namespace and unknown attributes.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const values = @import("xml_values.zig");
pub fn currentBreak(source: ?bool, continuation: bool) ?bool {
    return if (source == null) null else if (continuation) false else source;
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, index: usize, id: u32, max_bytes: usize) ![]u8 {
    if (id == 0) return error.InvalidParagraphInstanceId;
    if (index >= tree.elements.len) return error.InvalidElementIndex;
    const element = tree.elements[index];
    if (!element.is(@import("document_xml.zig").paragraph_uri, "p")) return error.InvalidParagraphElement;
    const raw = tree.source[element.start_tag.start..element.start_tag.end];
    const Patch = struct { start: usize, end: usize, text: []const u8 };
    var patches: [3]Patch = undefined;
    var count: usize = 0;
    var id_buffer: [32]u8 = undefined;
    const old_id = try tree.attributeValue(a, index, "", "id");
    if (old_id) |attribute| {
        const decoded = try attribute.toUtf8(a, 4096);
        defer a.free(decoded);
        _ = try values.nonNegative(decoded);
        const start = @intFromPtr(attribute.raw.ptr) - @intFromPtr(raw.ptr);
        const quote = attribute.raw[0];
        patches[count] = .{ .start = start, .end = start + attribute.raw.len, .text = try std.fmt.bufPrint(&id_buffer, "{c}{d}{c}", .{ quote, id, quote }) };
    } else {
        const close = raw.len - (if (std.mem.endsWith(u8, raw, "/>")) @as(usize, 2) else 1);
        patches[count] = .{ .start = close, .end = close, .text = try std.fmt.bufPrint(&id_buffer, " id=\"{d}\"", .{id}) };
    }
    count += 1;
    for ([_][]const u8{ "pageBreak", "columnBreak" }) |name| {
        const attribute = (try tree.attributeValue(a, index, "", name)) orelse continue;
        const decoded = try attribute.toUtf8(a, 4096);
        defer a.free(decoded);
        const source = try values.boolean(decoded);
        if (currentBreak(source, true).? == source) continue;
        const start = @intFromPtr(attribute.raw.ptr) - @intFromPtr(raw.ptr);
        patches[count] = .{ .start = start, .end = start + attribute.raw.len, .text = if (attribute.raw[0] == '\'') "'0'" else "\"0\"" };
        count += 1;
    }
    std.mem.sort(Patch, patches[0..count], {}, struct {
        fn less(_: void, left: Patch, right: Patch) bool {
            return left.start < right.start;
        }
    }.less);
    var length = raw.len;
    for (patches[0..count]) |patch| {
        length -= patch.end - patch.start;
        length = std.math.add(usize, length, patch.text.len) catch return error.LimitExceeded;
    }
    if (length > max_bytes) return error.LimitExceeded;
    const output = try a.alloc(u8, length);
    var cursor: usize = 0;
    var written: usize = 0;
    for (patches[0..count]) |patch| {
        const kept = raw[cursor..patch.start];
        @memcpy(output[written..][0..kept.len], kept);
        written += kept.len;
        @memcpy(output[written..][0..patch.text.len], patch.text);
        written += patch.text.len;
        cursor = patch.end;
    }
    @memcpy(output[written..], raw[cursor..]);
    return output;
}

test "HWPX continuation tag preserves lexical namespace unknown attributes and allocation failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p opaque='keep&amp;x' columnBreak = 'true' id = '&#49;' pageBreak=\"1\"/><p:p opaque='empty'/></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const output = try write(a, &tree, 1, 2, 1000);
    defer a.free(output);
    try std.testing.expectEqualStrings("<p:p opaque='keep&amp;x' columnBreak = '0' id = '2' pageBreak=\"0\"/>", output);
    const added = try write(a, &tree, 2, 3, 1000);
    defer a.free(added);
    try std.testing.expectEqualStrings("<p:p opaque='empty' id=\"3\"/>", added);
    try std.testing.expectError(error.InvalidParagraphInstanceId, write(a, &tree, 1, 0, 1000));
    try std.testing.expectError(error.InvalidParagraphElement, write(a, &tree, 0, 2, 1000));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, 2, 1));
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const Tree) !void {
            const result = try write(allocator, borrowed, 1, 2, 1000);
            defer allocator.free(result);
        }
    }.run, .{&tree});
}
