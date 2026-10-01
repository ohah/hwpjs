//! Source bindings with the existing shared compatibility selection policy.
const std = @import("std");
const tree_module = @import("xml_part_tree.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub const Site = struct {
    element_index: usize,
    start: usize,
    end: usize,
    text: []u8,
    empty_element: bool = false,
    missing_text: bool = false,
};
pub const Sites = struct {
    items: []Site,
    pub fn deinit(self: *Sites, a: std.mem.Allocator) void {
        for (self.items) |item| a.free(item.text);
        a.free(self.items);
        self.* = undefined;
    }
};
pub const Options = struct {
    max_sites: usize = 1_000_000,
    max_text_bytes: usize = 64 * 1024 * 1024,
    branch_policy: @import("compatibility_selection.zig").Policy = .{},
    max_attribute_bytes: usize = 4096,
};

/// Owns decoded strings and integer source bindings. Tree must remain unchanged
/// while applying these bindings. No pointers into source survive this call.
pub fn collect(a: std.mem.Allocator, tree: *const tree_module.Tree, options: Options) !Sites {
    const frames = try @import("xml_tree_selection.zig").build(a, tree, options.branch_policy, options.max_attribute_bytes);
    defer a.free(frames);
    const covered = try a.alloc(bool, tree.elements.len);
    defer a.free(covered);
    @memset(covered, false);
    const Builder = struct {
        a: std.mem.Allocator,
        tree: *const tree_module.Tree,
        options: Options,
        covered: []bool,
        frames: []const @import("xml_tree_selection.zig").Frame,
        text_bytes: usize = 0,
        items: std.ArrayList(Site) = .empty,

        fn onContent(raw: *anyopaque, event: tree_module.Tree.ContentEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (!self.frames[event.parent_index].active) return;
            if (self.frames[event.parent_index].kind == .run) {
                const value = try event.value.toUtf8(self.a, self.options.max_text_bytes);
                defer self.a.free(value);
                for (value) |byte| if (!std.ascii.isWhitespace(byte)) {
                    self.covered[event.parent_index] = true;
                    break;
                };
                return;
            }
            if (!isTextElement(self.tree, self.frames, event.parent_index)) return;
            if (event.value.encoding != .utf8) return error.UnsupportedEditEncoding;
            if (self.items.items.len == self.options.max_sites) return error.LimitExceeded;
            const base = @intFromPtr(self.tree.source.ptr);
            const ptr = @intFromPtr(event.value.raw.ptr);
            if (ptr < base or ptr - base > self.tree.source.len) return error.InvalidSourceSpan;
            var start = ptr - base;
            if (event.value.raw.len > self.tree.source.len - start) return error.InvalidSourceSpan;
            var end = start + event.value.raw.len;
            if (event.value.kind == .cdata) {
                if (start < 9 or self.tree.source.len - end < 3) return error.InvalidSourceSpan;
                if (!std.mem.eql(u8, self.tree.source[start - 9 .. start], "<![CDATA[") or !std.mem.eql(u8, self.tree.source[end..][0..3], "]]>")) return error.InvalidSourceSpan;
                start -= 9;
                end += 3;
            }
            const text = try event.value.toUtf8(self.a, self.options.max_text_bytes -| self.text_bytes);
            errdefer self.a.free(text);
            try self.items.append(self.a, .{ .element_index = event.parent_index, .start = start, .end = end, .text = text });
            self.covered[event.parent_index] = true;
            self.text_bytes += text.len;
        }
    };
    var builder: Builder = .{ .a = a, .tree = tree, .options = options, .covered = covered, .frames = frames };
    defer {
        for (builder.items.items) |item| a.free(item.text);
        builder.items.deinit(a);
    }
    try tree.visitContent(a, .{ .context = &builder, .on_content = Builder.onContent });
    for (tree.elements, 0..) |element, index| {
        if (!frames[index].active or !isTextElement(tree, frames, index) or element.first_child != null) continue;
        if (covered[index]) continue;
        if (element.name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
        if (builder.items.items.len == options.max_sites) return error.LimitExceeded;
        const empty = try a.dupe(u8, "");
        errdefer a.free(empty);
        try builder.items.append(a, .{
            .element_index = index,
            .start = if (element.end_tag == null) element.start_tag.start else element.start_tag.end,
            .end = element.start_tag.end,
            .text = empty,
            .empty_element = element.end_tag == null,
        });
    }
    for (tree.elements, 0..) |element, index| {
        if (!frames[index].active or frames[index].kind != .run or element.first_child != null or covered[index]) continue;
        if (element.name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
        if (builder.items.items.len == options.max_sites) return error.LimitExceeded;
        const empty = try a.dupe(u8, "");
        errdefer a.free(empty);
        try builder.items.append(a, .{
            .element_index = index,
            .start = if (element.end_tag == null) element.start_tag.start else element.start_tag.end,
            .end = element.start_tag.end,
            .text = empty,
            .empty_element = element.end_tag == null,
            .missing_text = true,
        });
    }
    std.mem.sort(Site, builder.items.items, {}, struct {
        fn less(_: void, lhs: Site, rhs: Site) bool {
            return lhs.start < rhs.start;
        }
    }.less);
    return .{ .items = try builder.items.toOwnedSlice(a) };
}

fn isTextElement(tree: *const tree_module.Tree, frames: []const @import("xml_tree_selection.zig").Frame, index: usize) bool {
    const element = tree.elements[index];
    if (!element.is(uri, "t")) return false;
    // Same shared scanner rule: descendants of an existing hp:t are inline
    // controls, even when their names happen to be hp:p, hp:run, or hp:t.
    const parent = element.parent orelse return false;
    return !frames[parent].in_text;
}

test "HWPX text sites bind exact namespace direct text and complete CDATA container" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:t>A&amp;<!--keep--><![CDATA[B]]><x:mark>ignored</x:mark>C</p:t><x:t>foreign</x:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), sites.items.len);
    try std.testing.expectEqualStrings("A&", sites.items[0].text);
    try std.testing.expectEqualStrings("B", sites.items[1].text);
    try std.testing.expectEqualStrings("<![CDATA[B]]>", tree.source[sites.items[1].start..sites.items[1].end]);
    try std.testing.expectEqualStrings("C", sites.items[2].text);
    try std.testing.expectError(error.LimitExceeded, collect(a, &tree, .{ .max_sites = 2 }));
    try std.testing.expectError(error.LimitExceeded, collect(a, &tree, .{ .max_text_bytes = 2 }));
    const output = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = sites.items[1].start, .end = sites.items[1].end, .text = "한😀]]><&" }}, 10000);
    defer a.free(output);
    var reopened = try tree_module.parse(a, output, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var updated = try collect(a, &reopened, .{});
    defer updated.deinit(a);
    try std.testing.expect(std.mem.indexOf(u8, output, "<!--keep-->") != null);
    // Adjacent CharData can coalesce after the CDATA wrapper is replaced.
    var joined: std.ArrayList(u8) = .empty;
    defer joined.deinit(a);
    for (updated.items) |site| try joined.appendSlice(a, site.text);
    try std.testing.expectEqualStrings("A&한😀]]><&C", joined.items);
}
