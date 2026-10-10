//! 병합 호스트 사이 중첩 본문을 허용하되 원본 귀속을 정확히 한 번씩 검사합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");
const Piece = @import("paragraph_joined_values.zig").Piece;

pub const Cursor = struct {
    consumed: []bool,
    next: usize = 0,

    pub fn init(a: std.mem.Allocator, count: usize) !Cursor {
        const consumed = try a.alloc(bool, count);
        @memset(consumed, false);
        return .{ .consumed = consumed };
    }

    pub fn deinit(self: *Cursor, a: std.mem.Allocator) void {
        a.free(self.consumed);
        self.* = undefined;
    }

    pub fn take(self: *Cursor, tree: *const Tree, original: *const model.Values, element: usize, previous: []const Piece) !*const model.Paragraph {
        if (original.paragraphs.len != self.consumed.len or element >= tree.elements.len) return error.SourceBindingMismatch;
        var found: ?usize = null;
        for (original.paragraphs, 0..) |paragraph, index| if (paragraph.template_element == element) {
            if (found != null) return error.SourceBindingMismatch;
            found = index;
        };
        const selected = found orelse return error.SourceBindingMismatch;
        if (self.consumed[selected] or selected < self.next) return error.SourceBindingMismatch;
        for (self.next..selected) |index| {
            if (self.consumed[index]) continue;
            const child = original.paragraphs[index].template_element;
            if (child >= tree.elements.len) return error.SourceBindingMismatch;
            var nested = false;
            var ancestor = tree.elements[child].parent;
            while (ancestor) |parent| {
                if (parent >= child or parent >= tree.elements.len) return error.SourceBindingMismatch;
                for (previous) |piece| if (piece.owns_source and piece.template_element == parent) {
                    var owned = false;
                    for (original.paragraphs, 0..) |paragraph, source_index| if (paragraph.template_element == parent and self.consumed[source_index]) {
                        owned = true;
                    };
                    if (!owned) return error.SourceBindingMismatch;
                    nested = true;
                };
                const next_parent = tree.elements[parent].parent;
                if (next_parent) |next_index| if (next_index >= parent) return error.SourceBindingMismatch;
                ancestor = next_parent;
            }
            if (!nested) return error.SourceBindingMismatch;
        }
        self.consumed[selected] = true;
        while (self.next < self.consumed.len and self.consumed[self.next]) self.next += 1;
        return &original.paragraphs[selected];
    }

    pub fn finish(self: *const Cursor) !void {
        if (self.next != self.consumed.len) return error.SourceBindingMismatch;
    }
};

test "HWPX source inventory permits only nested gaps between joined hosts" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:rect><p:subList><p:p/></p:subList></p:rect></p:run></p:p><p:p><p:run><p:rect><p:subList><p:p/></p:subList></p:rect></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var rows: [4]model.Paragraph = undefined;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "p")) {
        if (count >= rows.len) return error.UnexpectedParagraphCount;
        rows[count] = .{ .template_element = index, .source_ordinal = count + 1, .sites = .{ .items = &.{} } };
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 4), count);
    const original: model.Values = .{ .paragraphs = &rows };
    const previous = [_]Piece{.{ .template_element = rows[0].template_element, .source_ordinal = 1, .generated_id = null, .first_site = 0, .site_count = 0 }};
    var cursor = try Cursor.init(a, rows.len);
    defer cursor.deinit(a);
    try std.testing.expectError(error.SourceBindingMismatch, cursor.take(&tree, &original, rows[2].template_element, &.{}));
    _ = try cursor.take(&tree, &original, rows[0].template_element, &.{});
    try std.testing.expectError(error.SourceBindingMismatch, cursor.take(&tree, &original, rows[2].template_element, &.{}));
    _ = try cursor.take(&tree, &original, rows[2].template_element, &previous);
    try std.testing.expectError(error.SourceBindingMismatch, cursor.take(&tree, &original, rows[2].template_element, &previous));
    try std.testing.expectError(error.SourceBindingMismatch, cursor.finish());
    _ = try cursor.take(&tree, &original, rows[1].template_element, &.{});
    _ = try cursor.take(&tree, &original, rows[3].template_element, &.{});
    try cursor.finish();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, values: *const model.Values, hosts: []const Piece) !void {
            var current = try Cursor.init(allocator, values.paragraphs.len);
            defer current.deinit(allocator);
            _ = try current.take(parsed, values, values.paragraphs[0].template_element, &.{});
            _ = try current.take(parsed, values, values.paragraphs[2].template_element, hosts);
            _ = try current.take(parsed, values, values.paragraphs[1].template_element, &.{});
            _ = try current.take(parsed, values, values.paragraphs[3].template_element, &.{});
            try current.finish();
        }
    }.run, .{ &tree, &original, &previous });
    try std.testing.expectEqualStrings(source, tree.source);
}
