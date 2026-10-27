//! Clone identity and requested properties using the original namespace context.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const UnderlineKind = @import("character_underline_values.zig").Kind;
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, properties: @import("../model/document.zig").CharacterPropertyPatch, limit: usize) ![]u8 {
    return writeWithProfile(a, tree, node, id, properties, limit, .{});
}
pub fn writeWithProfile(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, properties: @import("../model/document.zig").CharacterPropertyPatch, limit: usize, profile: @import("source_color_profile.zig").Profile) ![]u8 {
    if (properties.border_fill) |border| return @import("border_fill_character_xml.zig").clone(a, tree, node, id, properties, border, limit, profile);
    return writePreparedWithProfile(a, tree, node, id, properties, limit, profile);
}
pub fn writePreparedWithProfile(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, properties: @import("../model/document.zig").CharacterPropertyPatch, limit: usize, profile: @import("source_color_profile.zig").Profile) ![]u8 {
    if (properties.border_fill != null) return error.UnpreparedBorderFillIntent;
    return compose(a, tree, node, id, properties, properties.underline_kind, limit, profile);
}
pub fn writeUnderline(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, kind: UnderlineKind, limit: usize) ![]u8 {
    return compose(a, tree, node, id, .{}, kind, limit, .{});
}
fn compose(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, properties: @import("../model/document.zig").CharacterPropertyPatch, underline: ?UnderlineKind, limit: usize, profile: @import("source_color_profile.zig").Profile) ![]u8 {
    try @import("../model/character_properties.zig").validate(properties);
    _ = try @import("character_shape_display.zig").read(a, tree, node, 4096);
    if (tree.source.len > limit) return error.LimitExceeded;
    var current = try a.dupe(u8, tree.source);
    defer a.free(current);
    if (properties.strike_enabled == false and properties.strike_style != null) return error.ConflictingCharacterDecorationStyles;
    for (0..26) |step| {
        if (step == 25 and properties.shadow == null) continue;
        if (step == 22 and !@import("../model/character_metric_patch.zig").has(properties)) continue;
        if (step == 23 and properties.underline_style == null) continue;
        if (step == 24 and properties.strike_style == null) continue;
        if (step == 21 and properties.strike_color == null) continue;
        if (step == 20 and properties.outline_kind == null) continue;
        if (step >= 16 and step < 20) {
            const present = switch (step) {
                16 => properties.emboss,
                17 => properties.engrave,
                18 => properties.superscript,
                else => properties.subscript,
            };
            if (present == null) continue;
        }
        if (step == 15 and properties.shade == null) continue;
        if (step == 14 and properties.strike_enabled == null) continue;
        if (step == 1 and properties.size == null or step == 2 and properties.italic == null or step == 3 and properties.bold == null or step == 4 and underline == null or step == 5 and properties.underline_color == null) continue;
        if (step == 6 and properties.text_color == null) continue;
        if (step >= 7 and step < 14 and (properties.font_ids == null or properties.font_ids.?[step - 7] == null)) continue;
        var parsed = try @import("xml_part_tree.zig").parse(a, current, .header, null, tree.item_index, .{ .max_xml_bytes = limit });
        defer parsed.deinit(a);
        const replacement = switch (step) {
            0 => try identity(a, &parsed, node, id, limit),
            1 => try @import("character_size_patch.zig").write(a, &parsed, node, properties.size.?, limit),
            2 => try @import("character_emphasis_patch.zig").write(a, &parsed, node, .italic, properties.italic.?, limit),
            3 => try @import("character_emphasis_patch.zig").write(a, &parsed, node, .bold, properties.bold.?, limit),
            4 => try @import("character_underline_patch.zig").write(a, &parsed, node, underline.?, limit),
            5 => try @import("character_underline_patch.zig").writeColor(a, &parsed, node, properties.underline_color.?, limit),
            6 => try @import("character_color_patch.zig").writeWithProfile(a, &parsed, node, properties.text_color.?, limit, profile),
            14 => try @import("character_strike_patch.zig").write(a, &parsed, node, properties.strike_enabled.?, limit),
            15 => try @import("character_shade_patch.zig").write(a, &parsed, node, properties.shade.?, limit),
            16 => try @import("character_emphasis_patch.zig").write(a, &parsed, node, .emboss, properties.emboss.?, limit),
            17 => try @import("character_emphasis_patch.zig").write(a, &parsed, node, .engrave, properties.engrave.?, limit),
            18 => try @import("character_emphasis_patch.zig").write(a, &parsed, node, .supscript, properties.superscript.?, limit),
            19 => try @import("character_emphasis_patch.zig").write(a, &parsed, node, .subscript, properties.subscript.?, limit),
            20 => try @import("character_outline_patch.zig").write(a, &parsed, node, properties.outline_kind.?, limit),
            25 => try @import("character_shadow_patch.zig").write(a, &parsed, node, properties.shadow.?, limit),
            22 => try @import("character_metric_patch.zig").write(a, &parsed, node, properties, limit),
            23 => try @import("character_decoration_style_patch.zig").write(a, &parsed, node, false, properties.underline_style.?, limit),
            24 => try @import("character_decoration_style_patch.zig").write(a, &parsed, node, true, properties.strike_style.?, limit),
            21 => try @import("character_strike_color_patch.zig").write(a, &parsed, node, properties.strike_color.?, limit),
            else => try @import("character_font_patch.zig").write(a, &parsed, node, @fromBackingInt(@intCast(step - 7)), properties.font_ids.?[step - 7].?, limit),
        };
        defer a.free(replacement);
        const next = try @import("xml_source_writer.zig").write(a, current, &.{.{ .start = parsed.elements[node].start_tag.start, .end = parsed.elements[node].end, .text = "", .serialized_xml = replacement }}, limit);
        a.free(current);
        current = next;
    }
    var parsed = try @import("xml_part_tree.zig").parse(a, current, .header, null, tree.item_index, .{ .max_xml_bytes = limit });
    defer parsed.deinit(a);
    _ = try @import("character_shape_display.zig").read(a, &parsed, node, 4096);
    return a.dupe(u8, parsed.sourceOf(node));
}
fn identity(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, limit: usize) ![]u8 {
    const attribute = (try tree.attributeValue(a, node, "", "id")) orelse return error.MissingCharacterShapeReference;
    const fragment = tree.sourceOf(node);
    const replacement = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ attribute.raw[0], id, attribute.raw[0] });
    defer a.free(replacement);
    const start = @intFromPtr(attribute.raw.ptr) - @intFromPtr(fragment.ptr);
    return @import("xml_source_writer.zig").write(a, fragment, &.{.{ .start = start, .end = start + attribute.raw.len, .text = "", .serialized_xml = replacement }}, limit);
}

test "HWPX character resource clone merges shade identity and bold without touching template" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr id='0' shadeColor='#FFFFFFFF' textColor='#123456'/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    const output = try write(a, &tree, 1, 9, .{ .shade = .{ .color = 0xffffff }, .bold = true }, 4096);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "id='9'") != null);
    try std.testing.expect(std.mem.indexOf(u8, output, "shadeColor='#ffffff'") != null);
    try std.testing.expect(std.mem.indexOf(u8, output, "textColor='#123456'") != null);
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX character resource clone composes identity size emphasis and allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:future'><h:charPr opaque='keep' id='&#57;'><f:bold/><!--keep--><h:underline/></h:charPr><h:charPr id='10'/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const clone = try write(allocator, source, 1, 300, .{ .size = 2400, .italic = true, .bold = true }, 4096);
            defer allocator.free(clone);
            try std.testing.expectEqualStrings("<h:charPr opaque='keep' id='300' height=\"2400\"><f:bold/><!--keep--><italic xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\"/><bold xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\"/><h:underline/></h:charPr>", clone);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
    const empty = try write(a, &tree, 4, 301, .{ .size = 1000, .bold = true }, 4096);
    defer a.free(empty);
    try std.testing.expectEqualStrings("<h:charPr id='301'><bold xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\"/></h:charPr>", empty);
    try std.testing.expectError(error.InvalidCharacterSize, write(a, &tree, 1, 300, .{ .size = -1 }, 4096));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, 300, .{}, 1));
}

test "HWPX character resource clone strike composes emphasis and preserves source" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr id='7'><h:strikeout shape='DOT' color='#123456'/></h:charPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            const result = try write(allocator, parsed, 1, 8, .{ .strike_enabled = false, .bold = true }, 4096);
            defer allocator.free(result);
            try std.testing.expect(std.mem.indexOf(u8, result, "shape='NONE' color='#123456'") != null);
            try std.testing.expect(std.mem.indexOf(u8, result, "<bold ") != null);
            try std.testing.expect(std.mem.indexOf(u8, result, "id='8'") != null);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX character resource clone handles actual header without changing template" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var package = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer package.deinit(a);
    var tree = try package.readHeaderTree(a, .{});
    defer tree.deinit(a);
    for (tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").head_uri, "charPr")) continue;
        const original = try a.dupe(u8, tree.sourceOf(index));
        defer a.free(original);
        const fragment = try write(a, &tree, index, 999, .{ .size = 2400, .bold = false, .italic = true }, 4_000_000);
        defer a.free(fragment);
        const whole = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = fragment }}, 4_000_000);
        defer a.free(whole);
        var parsed = try @import("xml_part_tree.zig").parse(a, whole, .header, null, tree.item_index, .{});
        defer parsed.deinit(a);
        const shape = try @import("character_shape_display.zig").read(a, &parsed, index, 4096);
        try std.testing.expectEqual(@as(?u32, 999), shape.id);
        try std.testing.expectEqual(@as(?i32, 2400), shape.height);
        try std.testing.expect(shape.italic and !shape.bold);
        try std.testing.expectEqualSlices(u8, original, tree.sourceOf(index));
        return;
    }
    return error.MissingCharacterShapeReference;
}
