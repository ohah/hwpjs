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
/// 내부 bulk header 거래 전용이다. 최종 header 검증과 설치는 호출자가 소유한다.
/// 일반 write/writePreparedWithProfile은 기존 경로를 유지한다.
pub const BatchStats = struct { fragments: usize = 0, fallback: usize = 0 };
pub fn writePreparedBatchWithProfile(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, properties: @import("../model/document.zig").CharacterPropertyPatch, limit: usize, profile: @import("source_color_profile.zig").Profile) ![]u8 {
    return writePreparedBatchCounted(a, tree, node, id, properties, limit, profile, null);
}
pub fn writePreparedBatchCounted(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, properties: @import("../model/document.zig").CharacterPropertyPatch, limit: usize, profile: @import("source_color_profile.zig").Profile, stats: ?*BatchStats) ![]u8 {
    if (properties.border_fill != null) return error.UnpreparedBorderFillIntent;
    if (try composeBasicFragment(a, tree, node, id, properties, limit, profile)) |fragment| {
        if (stats) |value| value.fragments += 1;
        return fragment;
    }
    if (stats) |value| value.fallback += 1;
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

const FragmentDiff = struct { start: usize, end: usize, replacement: []u8, step: u8 };
fn diffBefore(left: FragmentDiff, right: FragmentDiff) bool {
    return left.start < right.start or (left.start == right.start and left.step < right.step);
}
/// 기존 namespace 해석과 field patcher의 출력만 합친다. 새 XML 문법을 해석하지 않는다.
fn composeBasicFragment(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, properties: @import("../model/document.zig").CharacterPropertyPatch, limit: usize, profile: @import("source_color_profile.zig").Profile) !?[]u8 {
    const Patch = @import("../model/document.zig").CharacterPropertyPatch;
    inline for (@import("../reflection.zig").fields(Patch)) |field| {
        if (comptime !std.mem.eql(u8, field.name, "size") and !std.mem.eql(u8, field.name, "italic") and
            !std.mem.eql(u8, field.name, "bold") and !std.mem.eql(u8, field.name, "text_color") and
            !std.mem.eql(u8, field.name, "font_ids"))
        {
            if (@field(properties, field.name) != null) return null;
        }
    }
    try @import("../model/character_properties.zig").validate(properties);
    _ = try @import("character_shape_display.zig").read(a, tree, node, 4096);
    if (tree.source.len > limit) return error.LimitExceeded;
    const original = tree.sourceOf(node);
    var diffs: std.ArrayList(FragmentDiff) = .empty;
    defer {
        for (diffs.items) |diff| a.free(diff.replacement);
        diffs.deinit(a);
    }
    var prefix_bytes = tree.source.len;
    for (0..14) |step| {
        if (step == 4 or step == 5) continue;
        if (step == 1 and properties.size == null or step == 2 and properties.italic == null or step == 3 and properties.bold == null or step == 6 and properties.text_color == null) continue;
        if (step >= 7 and (properties.font_ids == null or properties.font_ids.?[step - 7] == null)) continue;
        const changed = switch (step) {
            0 => try identity(a, tree, node, id, limit),
            1 => try @import("character_size_patch.zig").write(a, tree, node, properties.size.?, limit),
            2 => try @import("character_emphasis_patch.zig").write(a, tree, node, .italic, properties.italic.?, limit),
            3 => try @import("character_emphasis_patch.zig").write(a, tree, node, .bold, properties.bold.?, limit),
            6 => try @import("character_color_patch.zig").writeWithProfile(a, tree, node, properties.text_color.?, limit, profile),
            else => try @import("character_font_patch.zig").write(a, tree, node, @fromBackingInt(@intCast(step - 7)), properties.font_ids.?[step - 7].?, limit),
        };
        defer a.free(changed);
        if (std.mem.eql(u8, original, changed)) continue;
        var start: usize = 0;
        while (start < original.len and start < changed.len and original[start] == changed[start]) start += 1;
        var end = original.len;
        var replacement_end = changed.len;
        while (end > start and replacement_end > start and original[end - 1] == changed[replacement_end - 1]) {
            end -= 1;
            replacement_end -= 1;
        }
        // 모호한 구조 겹침이면 prefix 크기를 추정하지 않고 원래 compose로 돌아간다.
        for (diffs.items) |previous| {
            const both_insertions = start == end and previous.start == previous.end;
            if (start == previous.start and !both_insertions) return null;
            if (start < previous.end and previous.start < end) return null;
            if (start == end and previous.start < start and start < previous.end) return null;
            if (previous.start == previous.end and start < previous.start and previous.start < end) return null;
        }
        const removed = end - start;
        if (removed > prefix_bytes) return error.InvalidSourceSpan;
        prefix_bytes = std.math.add(usize, prefix_bytes - removed, replacement_end - start) catch return error.LimitExceeded;
        if (prefix_bytes > limit) return error.LimitExceeded;
        const replacement = try a.dupe(u8, changed[start..replacement_end]);
        diffs.append(a, .{ .start = start, .end = end, .replacement = replacement, .step = @intCast(step) }) catch |err| {
            a.free(replacement);
            return err;
        };
    }
    // 필드 수는 최대 12개다. 동일 위치 삽입은 canonical step/언어 순서를 유지한다.
    var i: usize = 1;
    while (i < diffs.items.len) : (i += 1) {
        var j = i;
        while (j > 0 and diffBefore(diffs.items[j], diffs.items[j - 1])) : (j -= 1)
            std.mem.swap(FragmentDiff, &diffs.items[j], &diffs.items[j - 1]);
    }
    const writer = @import("xml_source_writer.zig");
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var joined: std.ArrayList([]u8) = .empty;
    defer {
        for (joined.items) |bytes| a.free(bytes);
        joined.deinit(a);
    }
    for (diffs.items) |diff| {
        if (changes.items.len != 0) {
            const previous = &changes.items[changes.items.len - 1];
            if (diff.start == previous.start) {
                if (diff.end != diff.start or previous.end != previous.start) return null;
                const combined = try std.mem.concat(a, u8, &.{ previous.serialized_xml.?, diff.replacement });
                joined.append(a, combined) catch |err| {
                    a.free(combined);
                    return err;
                };
                previous.serialized_xml = combined;
                continue;
            }
            if (diff.start < previous.end) return null;
        }
        try changes.append(a, .{ .start = diff.start, .end = diff.end, .text = "", .serialized_xml = diff.replacement });
    }
    return try writer.write(a, original, changes.items, limit);
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

fn batchBasicAllocationCase(a: std.mem.Allocator) !void {
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:charPr id='&#57;' height='1000' textColor='#123456' opaque='keep'><f:bold/><!--keep--><h:fontRef hangul='1' latin='2' hanja='3' japanese='4' other='5' symbol='6' user='7'/><h:underline/></h:charPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    const properties: @import("../model/document.zig").CharacterPropertyPatch = .{ .size = 2400, .italic = true, .bold = true, .text_color = 0x654321, .font_ids = .{ 10, 11, 12, 13, 14, 15, 16 } };
    const expected = try writePreparedWithProfile(a, &tree, 1, 30, properties, 4096, .{});
    defer a.free(expected);
    const actual = try writePreparedBatchWithProfile(a, &tree, 1, 30, properties, 4096, .{});
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
    try std.testing.expectEqualStrings(input, tree.source);
    try std.testing.expect(std.mem.indexOf(u8, actual, "<f:bold/><!--keep-->") != null);
}
test "HWPX batch basic fragment matches canonical mixed fields namespaces and allocation failures" {
    try @import("../testing/allocation_failures.zig").check(batchBasicAllocationCase, .{});
}
test "HWPX batch basic fragment preserves seven missing attribute insertion order and zero" {
    const a = std.testing.allocator;
    const input = "<head xmlns='http://www.hancom.co.kr/hwpml/2011/head'><charPr id='0'><fontRef opaque='keep'/></charPr></head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    const properties: @import("../model/document.zig").CharacterPropertyPatch = .{ .font_ids = .{ 0, 1, 2, 3, 4, 5, 6 } };
    const expected = try writePreparedWithProfile(a, &tree, 1, 1, properties, 4096, .{});
    defer a.free(expected);
    const actual = (try composeBasicFragment(a, &tree, 1, 1, properties, 4096, .{})).?;
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
    try std.testing.expect(std.mem.indexOf(u8, actual, "hangul=\"0\" latin=\"1\" hanja=\"2\" japanese=\"3\" other=\"4\" symbol=\"5\" user=\"6\"") != null);
}
test "HWPX batch basic fragment declines structural overlap and rich properties" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr id='0'/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    const properties: @import("../model/document.zig").CharacterPropertyPatch = .{ .italic = true, .bold = true };
    try std.testing.expect((try composeBasicFragment(a, &tree, 1, 1, properties, 4096, .{})) == null);
    const expected = try writePreparedWithProfile(a, &tree, 1, 1, properties, 4096, .{});
    defer a.free(expected);
    const actual = try writePreparedBatchWithProfile(a, &tree, 1, 1, properties, 4096, .{});
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
    try std.testing.expect((try composeBasicFragment(a, &tree, 1, 1, .{ .shade = .none }, 4096, .{})) == null);
}
test "HWPX batch basic fragment keeps invalid property missing ref and byte bounds" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr id='0'/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.InvalidCharacterSize, writePreparedBatchWithProfile(a, &tree, 1, 1, .{ .size = -1 }, 4096, .{}));
    try std.testing.expectError(error.MissingCharacterFontReference, writePreparedBatchWithProfile(a, &tree, 1, 1, .{ .font_ids = .{ 1, null, null, null, null, null, null } }, 4096, .{}));
    try std.testing.expectError(error.LimitExceeded, writePreparedBatchWithProfile(a, &tree, 1, 1, .{ .size = 2400 }, input.len, .{}));
    try std.testing.expectEqualStrings(input, tree.source);
}
