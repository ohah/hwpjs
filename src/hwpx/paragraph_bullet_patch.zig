//! Existing character-bullet references only. Source declarations stay immutable.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const head = @import("document_xml.zig").head_uri;
const child = @import("paragraph_display_children.zig").child;
const fields = @import("table_xml_fields.zig");
pub const Bullet = @import("../model/formatting_patch.zig").Bullet;

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Bullet {
    var definitions = try @import("paragraph_heading_display.zig").bullets(a, tree);
    defer definitions.deinit(a);
    return readWithDefinitions(a, tree, node, definitions);
}

fn readWithDefinitions(a: std.mem.Allocator, tree: *const Tree, node: usize, definitions: @import("paragraph_heading_display.zig").Bullets) !Bullet {
    const heading = (try @import("paragraph_heading_display.zig").read(a, tree, node, definitions)) orelse return error.UnobservedParagraphHeading;
    const selected = (try child(a, tree, node, head, "heading")) orelse return error.UnobservedParagraphHeading;
    if (tree.elements[selected].parent != node) return error.UnsupportedConditionalHeading;
    const id = (try fields.optionalUnsigned(a, tree, selected, "idRef", 64)) orelse return error.UnobservedBulletReference;
    const level = (try fields.optionalUnsigned(a, tree, selected, "level", 64)) orelse return error.UnobservedBulletLevel;
    if (level != 0) return error.UnsupportedBulletLevel;
    if (heading.kind == .none) return .{ .id = null };
    if (heading.kind != .bullet) return error.UnsupportedParagraphHeadingKind;
    // Keep image/checkable/duplicate/unresolved declarations out of this writer.
    if (heading.marker == null) return error.UnsupportedBulletDeclaration;
    return .{ .id = id };
}

pub fn validate(a: std.mem.Allocator, tree: *const Tree, node: usize, value: Bullet) !void {
    var definitions = try @import("paragraph_heading_display.zig").bullets(a, tree);
    defer definitions.deinit(a);
    _ = try readWithDefinitions(a, tree, node, definitions);
    if (value.id) |id| {
        if ((definitions.get(id) orelse null) == null) return error.UnsupportedBulletDeclaration;
    }
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, value: Bullet, limit: usize) ![]u8 {
    try validate(a, tree, node, value);
    const selected = (try child(a, tree, node, head, "heading")) orelse return error.UnobservedParagraphHeading;
    // Change only the three defined attributes. Preserve namespace, children,
    // extensions and quoting in the surrounding immutable source fragment.
    var changes: [3]@import("xml_source_writer.zig").Change = undefined;
    const names = [_][]const u8{ "type", "idRef", "level" };
    const id = try std.fmt.allocPrint(a, "{d}", .{value.id orelse 0});
    defer a.free(id);
    const values = [_][]const u8{ if (value.id != null) "BULLET" else "NONE", id, "0" };
    var replacements: [3]?[]u8 = @splat(null);
    defer for (replacements) |bytes| if (bytes) |owned| a.free(owned);
    for (names, values, 0..) |name, text, index| {
        const raw = (try tree.attributeValue(a, selected, "", name)) orelse return error.UnobservedParagraphHeading;
        replacements[index] = try std.fmt.allocPrint(a, "{c}{s}{c}", .{ raw.raw[0], text, raw.raw[0] });
        const start = @intFromPtr(raw.raw.ptr) - @intFromPtr(tree.source.ptr);
        changes[index] = .{ .start = start, .end = start + raw.raw.len, .text = "", .serialized_xml = replacements[index].? };
    }
    std.mem.sort(@TypeOf(changes[0]), &changes, {}, struct {
        fn less(_: void, left: @import("xml_source_writer.zig").Change, right: @import("xml_source_writer.zig").Change) bool {
            return left.start < right.start;
        }
    }.less);
    const bytes = try @import("xml_source_writer.zig").write(a, tree.source, &changes, limit);
    defer a.free(bytes);
    var parsed = try @import("header_tree.zig").parse(a, bytes, tree.item_index, .{ .max_xml_bytes = limit });
    defer parsed.deinit(a);
    return a.dupe(u8, parsed.sourceOf(node));
}

test "paragraph bullet writer preserves source extensions through allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:extension'><h:refList><h:bullets itemCnt='1'><h:bullet id='7' useImage='0' char='&#x25B6;'><h:paraHead checkable='0'/></h:bullet></h:bullets><h:paraProperties itemCnt='1'><h:paraPr id='9'><h:heading level='0' x:custom='yes' type='NONE' idRef='0'/><x:keep>unchanged</x:keep></h:paraPr></h:paraProperties></h:refList></h:head>";
    var tree = try @import("header_tree.zig").parse(a, input, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const node = try @import("formatting_preflight.zig").node(allocator, source, "paraPr", 9);
            const output = try write(allocator, source, node, .{ .id = 7 }, 4096);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "level='0' x:custom='yes' type='BULLET' idRef='7'") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "<x:keep>unchanged</x:keep>") != null);
            try std.testing.expectEqualStrings("<h:paraPr id='9'><h:heading level='0' x:custom='yes' type='NONE' idRef='0'/><x:keep>unchanged</x:keep></h:paraPr>", source.sourceOf(node));
            if (validate(allocator, source, node, .{ .id = 999 })) |_| return error.ExpectedInvalidDeclaration else |err| {
                if (err != error.UnsupportedBulletDeclaration) return err;
            }
        }
    }.run, .{&tree});
}

test "paragraph bullet writer rejects missing duplicate and nonbullet source" {
    const a = std.testing.allocator;
    const cases = [_][]const u8{
        "<h:heading type='NONE'/>",
        "<h:heading type='NUMBER' idRef='1' level='0'/>",
        "<h:heading type='BULLET' idRef='7' level='1'/>",
        "<h:heading type='BULLET' idRef='999' level='0'/>",
        "<h:heading type='NONE' idRef='0' level='0'/><h:heading type='NONE' idRef='0' level='0'/>",
    };
    for (cases) |fragment| {
        const bytes = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:paraProperties><h:paraPr id='0'>{s}</h:paraPr></h:paraProperties></h:refList></h:head>", .{fragment});
        defer a.free(bytes);
        var tree = try @import("header_tree.zig").parse(a, bytes, 0, .{});
        defer tree.deinit(a);
        if (read(a, &tree, 3)) |_| return error.ExpectedUnobservedHeading else |_| {}
    }
}
