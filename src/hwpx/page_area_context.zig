//! Source placement metadata for a paragraph in a header/footer container.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub const Apply = enum { both, odd, even };
pub const Align = enum { top, center, bottom };
pub const Context = struct { owner_node: usize, list_node: usize, apply: ?Apply, width: ?u32, height: ?u32, vertical_alignment: ?Align };

fn value(comptime T: type, a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?T {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return null;
    const text = try raw.toUtf8(a, 4096);
    defer a.free(text);
    inline for (@typeInfo(T).@"enum".fields) |field| {
        if (std.ascii.eqlIgnoreCase(text, field.name)) return @enumFromInt(field.value);
    }
    // Unknown declarations remain preserved in XML; they are not layout defaults.
    return null;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, paragraph: usize) !?Context {
    if (paragraph >= tree.elements.len) return error.InvalidPartTree;
    const list = tree.elements[paragraph].parent orelse return null;
    if (list >= paragraph) return error.InvalidPartTree;
    if (!tree.elements[list].is(uri, "subList")) return null;
    const owner = tree.elements[list].parent orelse return null;
    if (owner >= list) return error.InvalidPartTree;
    if (!tree.elements[owner].is(uri, "header") and !tree.elements[owner].is(uri, "footer")) return null;
    return .{ .owner_node = owner, .list_node = list, .apply = try value(Apply, a, tree, owner, "applyPageType"), .width = try fields.optionalUnsigned(a, tree, list, "textWidth", 4096), .height = try fields.optionalUnsigned(a, tree, list, "textHeight", 4096), .vertical_alignment = try value(Align, a, tree, list, "vertAlign") };
}

test "HWPX page area context preserves source values and all allocation failures" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:header applyPageType='BOTH'><p:subList textWidth='42520' textHeight='0' vertAlign='TOP'><p:p/></p:subList></p:header><p:footer applyPageType='UNKNOWN'><p:subList><p:p/></p:subList></p:footer></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const header = (try read(allocator, source, 3)).?;
            try std.testing.expectEqual(@as(?u32, 42520), header.width);
            try std.testing.expectEqual(@as(?u32, 0), header.height);
            try std.testing.expectEqual(@as(?Apply, .both), header.apply);
            try std.testing.expectEqual(@as(?Align, .top), header.vertical_alignment);
            const footer = (try read(allocator, source, 6)).?;
            try std.testing.expect(footer.apply == null and footer.width == null and footer.vertical_alignment == null);
        }
    }.run, .{&tree});
}
