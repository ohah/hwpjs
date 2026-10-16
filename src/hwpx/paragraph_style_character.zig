//! Resolve an explicit paragraph style through the selected header tree.
//! No preceding-run or numeric-zero fallback is inferred here.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").head_uri;

pub fn resolve(a: std.mem.Allocator, header: *const Tree, style_id: u32, characters: *const @import("header_resources.zig").Table) !u32 {
    var result: ?u32 = null;
    for (header.elements, 0..) |element, index| {
        if (!element.is(uri, "style")) continue;
        const group = element.parent orelse continue;
        if (group >= header.elements.len) return error.SourceBindingMismatch;
        if (!header.elements[group].is(uri, "styles")) continue;
        const refs = header.elements[group].parent orelse continue;
        if (refs >= header.elements.len) return error.SourceBindingMismatch;
        if (!header.elements[refs].is(uri, "refList")) continue;
        const root = header.elements[refs].parent orelse continue;
        if (root >= header.elements.len) return error.SourceBindingMismatch;
        if (!header.elements[root].is(uri, "head") or header.elements[root].parent != null) continue;
        if (try unsignedAttribute(a, header, index, "id") != style_id) continue;
        if (result != null) return error.DuplicateStyle;
        result = try unsignedAttribute(a, header, index, "charPrIDRef");
    }
    const id = result orelse return error.MissingStyle;
    if (!characters.hasId(id)) return error.MissingCharacterShape;
    return id;
}

fn unsignedAttribute(a: std.mem.Allocator, tree: *const Tree, index: usize, name: []const u8) !u32 {
    const raw = (try tree.attributeValue(a, index, "", name)) orelse return error.MissingStyleAttribute;
    const decoded = try raw.toUtf8(a, 4096);
    defer a.free(decoded);
    return @import("xml_values.zig").unsigned32(decoded);
}

test "paragraph style character resolves sparse IDs and refuses absent or ambiguous references" {
    const a = std.testing.allocator;
    var characters: @import("header_resources.zig").Table = .{};
    defer characters.ids.deinit(a);
    try characters.ids.append(a, 2);
    const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:foreign'><h:refList><h:styles>";
    const suffix = "</h:styles></h:refList></h:head>";
    const cases = [_]struct { xml: []const u8, failure: ?anyerror }{
        .{ .xml = prefix ++ "<h:style id='0' charPrIDRef='&#50;'/><x:style id='0' charPrIDRef='10'/>" ++ suffix, .failure = null },
        .{ .xml = prefix ++ "<h:style id='7' charPrIDRef='2'/>" ++ suffix, .failure = error.MissingStyle },
        .{ .xml = prefix ++ "<h:style id='0' charPrIDRef='10'/>" ++ suffix, .failure = error.MissingCharacterShape },
        .{ .xml = prefix ++ "<h:style id='0'/>" ++ suffix, .failure = error.MissingStyleAttribute },
        .{ .xml = prefix ++ "<h:style id='0' charPrIDRef='2'/><h:style id='0' charPrIDRef='2'/>" ++ suffix, .failure = error.DuplicateStyle },
        .{ .xml = prefix ++ "<h:wrapper><h:style id='0' charPrIDRef='2'/></h:wrapper>" ++ suffix, .failure = error.MissingStyle },
    };
    for (cases) |case| {
        var tree = try @import("header_tree.zig").parse(a, case.xml, 0, .{});
        defer tree.deinit(a);
        if (case.failure) |failure| {
            try std.testing.expectError(failure, resolve(a, &tree, 0, &characters));
        } else try std.testing.expectEqual(@as(u32, 2), try resolve(a, &tree, 0, &characters));
    }
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, header: *const Tree, table: *const @import("header_resources.zig").Table) !void {
            try std.testing.expectEqual(@as(u32, 2), try resolve(allocator, header, 0, table));
        }
    };
    var tree = try @import("header_tree.zig").parse(a, cases[0].xml, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &characters });
}
