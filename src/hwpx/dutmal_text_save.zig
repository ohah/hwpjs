//! Compose pending leaf values after body XML; field policy stays with session.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const values = @import("dutmal_text_values.zig");
const writer = @import("xml_source_writer.zig");
const uri = @import("document_xml.zig").paragraph_uri;

fn identity(tree: *const Tree, node: usize) bool {
    if (@import("run_anchor.zig").kind(tree, node) == .dutmal) return true;
    for ([_][]const u8{ "container", "tbl", "tr", "tc", "subList" }) |name| if (tree.elements[node].is(uri, name)) return true;
    return false;
}

pub fn write(a: std.mem.Allocator, source: *const Tree, xml: []const u8, entries: []const values.Entry, limit: usize) ![]u8 {
    if (xml.len > limit or entries.len > values.max_entries) return error.LimitExceeded;
    if (entries.len == 0) return a.dupe(u8, xml);
    var current = try @import("section_tree.zig").parse(a, xml, source.section_ordinal orelse return error.InvalidPartOrdinal, source.item_index, .{});
    defer current.deinit(a);
    var mapping = try @import("xml_identity_binding.zig").bind(a, source, &current, identity);
    defer mapping.deinit(a);
    var seen: std.AutoHashMapUnmanaged(struct { control: usize, kind: @import("dutmal_text_changes.zig").Kind }, void) = .empty;
    defer seen.deinit(a);
    var caches: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer caches.deinit(a);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    for (entries) |entry| {
        if ((try seen.getOrPut(a, .{ .control = entry.control, .kind = entry.kind })).found_existing) return error.DuplicateDutmalTextEdit;
        const node = mapping.get(entry.control) orelse return error.SourceBindingMismatch;
        if (!std.mem.eql(u8, source.sourceOf(entry.control), current.sourceOf(node))) return error.SourceBindingMismatch;
        const prepared = try @import("dutmal_text_changes.zig").prepare(a, &current, node, entry.kind, entry.text, limit);
        defer a.free(prepared);
        if (prepared.len == 0) continue;
        try changes.appendSlice(a, prepared);
        const paragraph = try @import("paragraph_site_owner.zig").ancestor(&current, node);
        var child = current.elements[paragraph].first_child;
        while (child) |index| {
            const element = current.elements[index];
            if (element.is(uri, "linesegarray") and !(try caches.getOrPut(a, index)).found_existing) {
                try changes.append(a, .{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = "" });
            }
            child = element.next_sibling;
        }
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, current.source, changes.items, limit);
}

test "dutmal composed save preserves shifted body and removes only owning line cache" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>";
    const tail = "</p:t><p:dutmal posType='TOP'><p:mainText>A</p:mainText><p:subText>B</p:subText></p:dutmal></p:run><p:linesegarray/></p:p><p:p><p:linesegarray/></p:p></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "old" ++ tail, 0, 0, .{});
    defer tree.deinit(a);
    const body = prefix ++ "새😀" ++ tail;
    var main_text = [_]u8{ 'X', '<', '&' };
    var sub_text = [_]u8{'Y'};
    const entries = [_]values.Entry{ .{ .control = 4, .kind = .main_text, .text = &main_text }, .{ .control = 4, .kind = .sub_text, .text = &sub_text } };
    const expected = prefix ++ "새😀</p:t><p:dutmal posType='TOP'><p:mainText>X&lt;&amp;</p:mainText><p:subText>Y</p:subText></p:dutmal></p:run></p:p><p:p><p:linesegarray/></p:p></s:sec>";
    const result = try write(a, &tree, body, &entries, 4096);
    defer a.free(result);
    try std.testing.expectEqualStrings(expected, result);
    try std.testing.expectError(error.DuplicateDutmalTextEdit, write(a, &tree, body, &.{ entries[0], entries[0] }, 4096));
    const changed_control = prefix ++ "new</p:t><p:dutmal posType='TOP'><p:mainText>changed</p:mainText><p:subText>B</p:subText></p:dutmal></p:run></p:p></s:sec>";
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, changed_control, &entries, 4096));
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, source_tree: *const Tree, xml: []const u8, edits: []const values.Entry) !void {
            const bytes = try write(allocator, source_tree, xml, edits, 4096);
            defer allocator.free(bytes);
            try std.testing.expectEqualStrings(expected, bytes);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, body, &entries });
}
