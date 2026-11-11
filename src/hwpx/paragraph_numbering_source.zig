//! Current Native header and section evidence for paragraph list labels.
const std = @import("std");
const Allocator = std.mem.Allocator;
const Tree = @import("xml_part_tree.zig").Tree;
const xml = @import("../xml/root.zig");
const fields = @import("table_xml_fields.zig");
const head = @import("document_xml.zig").head_uri;
const para = @import("document_xml.zig").paragraph_uri;

pub const Level = struct { level: u32, start: ?u32, format: ?[]const u8, template: ?[]const u8 };
pub const Definition = struct { id: u32, start: ?u32, levels: []const Level };
pub const Section = struct { section: usize, outline: ?u32 = null, controls_complete: bool = true };
pub const Source = struct { definitions: []const Definition, sections: []const Section };

pub fn read(a: Allocator, session: *const @import("editor_session.zig").Session) !Source {
    if (session.sections.len > 4096) return error.LimitExceeded;
    var lease = try @import("header_read_context.zig").lease(session);
    defer lease.deinit();
    const tree = try lease.get().currentHeader(false);
    const sections = try a.alloc(Section, session.sections.len);
    for (session.sections, 0..) |*section, i| sections[i] = try sectionSource(a, &section.tree, i);
    return .{ .definitions = try definitions(a, tree), .sections = sections };
}

fn text(a: Allocator, tree: *const Tree, index: usize) !?[]const u8 {
    const node = tree.elements[index];
    if (node.first_child != null) return null;
    const end = node.end_tag orelse return null;
    const raw = tree.source[node.start_tag.end..end.start];
    // Plain CharData only. A nested or mixed-content template has no label here.
    if (raw.len > 512 or !std.unicode.utf8ValidateSlice(raw) or
        std.mem.indexOfAny(u8, raw, "<\x00") != null) return null;
    const value: xml.text_content.View = .{
        .kind = .char_data,
        .encoding = .utf8,
        .raw = raw,
        .scalars = raw.len,
        .reference_options = .{},
    };
    return try value.toUtf8(a, 512);
}

fn definitions(a: Allocator, tree: *const Tree) ![]Definition {
    var list: std.ArrayList(Definition) = .empty;
    for (tree.elements, 0..) |node, i| {
        if (!node.is(head, "numbering")) continue;
        const group = node.parent orelse continue;
        const refs = tree.elements[group].parent orelse continue;
        if (!tree.elements[group].is(head, "numberings") or
            !tree.elements[refs].is(head, "refList") or tree.elements[refs].parent != 0 or
            !tree.elements[0].is(head, "head")) continue;
        if (list.items.len >= 4096) return error.LimitExceeded;
        const id = (try fields.optionalUnsigned(a, tree, i, "id", 64)) orelse return error.MissingNumberingId;
        var levels: std.ArrayList(Level) = .empty;
        var child = node.first_child;
        while (child) |j| : (child = tree.elements[j].next_sibling) {
            if (!tree.elements[j].is(head, "paraHead") or levels.items.len == 10) return error.UnobservedNumberingLevel;
            const level = (try fields.optionalUnsigned(a, tree, j, "level", 64)) orelse return error.UnobservedNumberingLevel;
            const format = try tree.attributeValue(a, j, "", "numFormat");
            const checkable = try tree.attributeValue(a, j, "", "checkable");
            const unchecked = if (checkable) |flag| !try fields.boolean(a, flag, 64) else false;
            try levels.append(a, .{
                .level = level,
                .start = try fields.optionalUnsigned(a, tree, j, "start", 64),
                .format = if (unchecked and format != null) try format.?.toUtf8(a, 64) else null,
                .template = try text(a, tree, j),
            });
        }
        try list.append(a, .{
            .id = id,
            .start = try fields.optionalUnsigned(a, tree, i, "start", 64),
            .levels = try levels.toOwnedSlice(a),
        });
    }
    return list.toOwnedSlice(a);
}

fn sectionSource(a: Allocator, tree: *const Tree, section: usize) !Section {
    var result = Section{ .section = section };
    var first_body: ?usize = null;
    var declarations: usize = 0;
    for (tree.elements, 0..) |node, i| {
        if (first_body == null and node.is(para, "p") and node.parent == 0) first_body = i;
        if (node.is(para, "secPr")) {
            declarations += 1;
            if (declarations != 1) {
                result.outline = null;
                continue;
            }
            const run = node.parent orelse continue;
            if (!tree.elements[run].is(para, "run") or first_body == null or
                tree.elements[run].parent != first_body) continue;
            result.outline = try fields.optionalUnsigned(a, tree, i, "outlineShapeIDRef", 64);
        }
        if (node.is(para, "subList")) {
            const num = try tree.attributeValue(a, i, "", "hasNumRef");
            const links = try fields.optionalUnsignedPair(a, tree, i, .{ "linkListIDRef", "linkListNextIDRef" }, 64);
            if ((num != null and try fields.boolean(a, num.?, 64)) or
                (links[0] orelse 0) != 0 or (links[1] orelse 0) != 0)
                result.controls_complete = false;
        }
        if (!node.is(para, "newNum")) continue;
        const restart = try @import("number_controls.zig").restartAt(a, a, tree, i);
        // The official auto-number kinds do not include paragraph lists.
        if (restart.type_known != true) result.controls_complete = false;
    }
    return result;
}

test "paragraph numbering source retains level starts and decoded exact templates" {
    const a = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    var header = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:numberings>" ++
        "<h:numbering id='21' start='7'><h:paraHead level='1' start='7' numFormat='DIGIT' checkable='0'>제^1장 &amp; </h:paraHead>" ++
        "<h:paraHead level='2' start='2' numFormat='ROMAN_SMALL' checkable='0'>(^2)</h:paraHead></h:numbering>" ++
        "</h:numberings></h:refList></h:head>", .header, null, 0, .{});
    defer header.deinit(a);
    const rows = try definitions(arena.allocator(), &header);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(@as(u32, 21), rows[0].id);
    try std.testing.expectEqual(@as(?u32, 7), rows[0].start);
    try std.testing.expectEqualStrings("제^1장 & ", rows[0].levels[0].template.?);
    try std.testing.expectEqual(@as(?u32, 2), rows[0].levels[1].start);
    try std.testing.expectEqualStrings("ROMAN_SMALL", rows[0].levels[1].format.?);
}

test "paragraph numbering source distinguishes the outline reference and unrelated or unknown restarts" {
    const a = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const head_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:secPr outlineShapeIDRef='21'/><p:ctrl>";
    const tail = "</p:ctrl></p:run></p:p></s:sec>";
    var known = try @import("section_tree.zig").parse(a, head_xml ++ "<p:newNum num='7' numType='PAGE'/>" ++ tail, 0, 0, .{});
    defer known.deinit(a);
    const k = try sectionSource(arena.allocator(), &known, 0);
    try std.testing.expectEqual(@as(?u32, 21), k.outline);
    try std.testing.expect(k.controls_complete);
    var unknown = try @import("section_tree.zig").parse(a, head_xml ++ "<p:newNum num='7' numType='FUTURE'/>" ++ tail, 0, 0, .{});
    defer unknown.deinit(a);
    try std.testing.expect(!(try sectionSource(arena.allocator(), &unknown, 0)).controls_complete);
    var linked = try @import("section_tree.zig").parse(a, head_xml ++ "<p:subList hasNumRef='1' linkListNextIDRef='7'/>" ++ tail, 0, 0, .{});
    defer linked.deinit(a);
    try std.testing.expect(!(try sectionSource(arena.allocator(), &linked, 0)).controls_complete);
}
