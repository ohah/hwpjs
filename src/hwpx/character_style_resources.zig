//! Actual header IDs, not counts or array indices. Caller owns the result.
const std = @import("std");
pub fn ids(session: *const @import("editor_session.zig").Session) ![]u32 {
    const a = session.allocator;
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    const original = resources.table(.char_shape).ids.items;
    var output: std.ArrayList(u32) = .empty;
    errdefer output.deinit(a);
    try output.appendSlice(a, original);
    for (session.character_resources.entries.items) |entry| {
        if (std.mem.indexOfScalar(u32, original, entry.source_id) == null) return error.InvalidCharacterShapeReference;
        if (std.mem.indexOfScalar(u32, output.items, entry.id) != null) return error.DuplicateCharacterResourceId;
        try output.append(a, entry.id);
    }
    std.mem.sort(u32, output.items, {}, std.sort.asc(u32));
    return output.toOwnedSlice(a);
}

/// Temporary read-only resource projection, never an editable style cache.
pub fn displayShapes(session: *const @import("editor_session.zig").Session) ![]@import("character_shape_display.zig").Shape {
    if (session.paragraph_resources.entries.items.len != 0 or session.font_resources.entries.items.len != 0) return displayShapesSerialized(session);
    return displayShapesProjected(session);
}

/// 비교 oracle과 추가 문단/글꼴 리소스 검증 경로를 유지합니다.
pub fn displayShapesSerialized(session: *const @import("editor_session.zig").Session) ![]@import("character_shape_display.zig").Shape {
    const a = session.allocator;
    if (session.character_resources.entries.items.len != 0 or session.paragraph_resources.entries.items.len != 0 or session.font_resources.entries.items.len != 0) {
        const expected = try ids(session);
        defer a.free(expected);
        const header = try @import("header_resource_save.zig").replacementWithFonts(a, session.source, &session.paragraph_resources, &session.character_resources, &session.font_resources, session.options.max_xml_bytes);
        defer a.free(header.bytes);
        var tree = try @import("header_tree.zig").parse(a, header.bytes, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
        defer tree.deinit(a);
        return normalizeColors(session, try collect(a, &tree, expected));
    }
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    const expected = resources.table(.char_shape).ids.items;
    return normalizeColors(session, try collect(a, &tree, expected));
}
fn collect(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, expected: []const u32) ![]@import("character_shape_display.zig").Shape {
    const Shape = @import("character_shape_display.zig").Shape;
    const output = try a.alloc(Shape, expected.len);
    errdefer a.free(output);
    var count: usize = 0;
    for (tree.elements, 0..) |_, index| {
        if (!@import("character_shape_owner.zig").contains(tree, index)) continue;
        if (count == output.len) return error.SourceBindingMismatch;
        output[count] = try @import("character_shape_display.zig").read(a, tree, index, 4096);
        if (output[count].id == null) return error.SourceBindingMismatch;
        count += 1;
    }
    if (count != expected.len) return error.SourceBindingMismatch;
    std.mem.sort(Shape, output, {}, struct {
        fn less(_: void, left: Shape, right: Shape) bool {
            return left.id.? < right.id.?;
        }
    }.less);
    for (output, expected) |shape, id| if (shape.id.? != id) return error.SourceBindingMismatch;
    return output;
}

/// 원본 조회와 현재 의도를 조합하는 비교 후보입니다. 반환 값은 호출자가 소유합니다.
pub fn displayShapesProjected(session: *const @import("editor_session.zig").Session) ![]@import("character_shape_display.zig").Shape {
    const a = session.allocator;
    const Shape = @import("character_shape_display.zig").Shape;
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    const originals = try normalizeColors(session, try collect(a, &tree, resources.table(.char_shape).ids.items));
    defer a.free(originals);
    const output = try a.alloc(Shape, try std.math.add(usize, originals.len, session.character_resources.entries.items.len));
    errdefer a.free(output);
    @memcpy(output[0..originals.len], originals);
    for (session.character_resources.entries.items, output[originals.len..]) |entry, *shape| {
        const source = for (originals) |original| {
            if (original.id == entry.source_id) break original;
        } else return error.InvalidCharacterShapeReference;
        shape.* = try @import("character_shape_intent.zig").project(source, entry.id, entry.properties);
    }
    std.mem.sort(Shape, output, {}, struct {
        fn less(_: void, left: Shape, right: Shape) bool {
            return left.id.? < right.id.?;
        }
    }.less);
    for (output, 0..) |shape, index| if (index != 0 and output[index - 1].id == shape.id) return error.DuplicateCharacterResourceId;
    return output;
}

// Session-level DTOs are canonical RGB; original header/XML readers stay raw.
fn normalizeColors(session: *const @import("editor_session.zig").Session, shapes: []@import("character_shape_display.zig").Shape) ![]@import("character_shape_display.zig").Shape {
    errdefer session.allocator.free(shapes);
    if (for (shapes) |shape| {
        if (shape.text_color != null) break false;
    } else true) return shapes;
    const selected_profile = try @import("document_provenance.zig").profile(session);
    for (shapes) |*shape| if (shape.text_color) |raw| {
        shape.text_color = try @import("source_color_profile.zig").decodeNumber(selected_profile, .character_text_color, raw);
    };
    return shapes;
}

test "HWPX projected shapes match serialized current header through mixed edits" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "charshape", "parashape", "linespacing", "facename", "underline-styles" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const Patch = @import("../model/document.zig").CharacterPropertyPatch;
        for ([_]Patch{
            .{ .size = 1700, .bold = true, .italic = false, .strike_enabled = true, .text_color = 0, .font_ids = .{ 0, null, null, null, null, null, null } },
            .{ .size = 0, .bold = false, .italic = true, .strike_enabled = false, .text_color = 0x123456, .underline_kind = .bottom },
        }) |patch| {
            _ = try session.setCharacterProperties(0, 2, 0, 1, patch);
            const serialized = try displayShapesSerialized(&session);
            defer a.free(serialized);
            const projected = try displayShapesProjected(&session);
            defer a.free(projected);
            try std.testing.expectEqualDeep(serialized, projected);
        }
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try @import("editor_session.zig").open(a, saved, .{});
        defer reopened.deinit();
        const expected = try displayShapesSerialized(&session);
        defer a.free(expected);
        const actual = try displayShapesProjected(&reopened);
        defer a.free(actual);
        try std.testing.expectEqualDeep(expected, actual);
        const source_id = session.character_resources.entries.items[0].source_id;
        session.character_resources.entries.items[0].id = source_id;
        try std.testing.expectError(error.DuplicateCharacterResourceId, displayShapesProjected(&session));
        session.character_resources.entries.items[0].source_id = std.math.maxInt(u32);
        try std.testing.expectError(error.InvalidCharacterShapeReference, displayShapesProjected(&session));
    }
}

test "HWPX projected shapes small allocation failures keep source and resource intents" {
    const a = std.testing.allocator;
    const fixture = @import("test_package_fixture.zig");
    const input = try fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = @import("package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='1'><h:charPr id='7' height='1000'><h:bold/></h:charPr></h:charProperties></h:refList></h:head>" },
        .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>A</p:t></p:run></p:p></s:sec>" },
    });
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const id = try session.character_resources.add(a, &.{7}, 7, .{ .size = 0, .bold = false, .text_color = 0 });
    const before = session.character_resources.entries.items[0];
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("editor_session.zig").Session, generated: u32) !void {
            var borrowed = original.*;
            borrowed.allocator = allocator;
            const output = try displayShapesProjected(&borrowed);
            defer allocator.free(output);
            try std.testing.expectEqual(@as(usize, 2), output.len);
            const shape = for (output) |item| {
                if (item.id == generated) break item;
            } else return error.MissingProjectedResource;
            try std.testing.expectEqual(@as(?i32, 0), shape.height);
            try std.testing.expect(!shape.bold);
            try std.testing.expectEqual(@as(?u32, 0), shape.text_color);
        }
    }.run, .{ &session, id });
    try std.testing.expectEqualDeep(before, session.character_resources.entries.items[0]);
    try std.testing.expectEqualSlices(u8, input, session.source);
}
