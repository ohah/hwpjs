//! Page-number source facts from the live editor trees; layout owns the page mapping.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const xml = @import("document_xml.zig");
const settings = @import("section_direct_settings.zig");
const controls = @import("number_controls.zig");
const values = @import("xml_values.zig");

const Owner = struct { sourceNode: usize, paragraph: ?usize = null };
const Position = struct {
    sourceNode: usize,
    paragraph: ?usize,
    position: []const u8,
    format: []const u8,
    sideChar: []const u8,
};
const Control = struct {
    sourceNode: usize,
    paragraph: ?usize,
    kind: enum { hide, restart },
    value: union(enum) { hide: bool, restart: u32 },

    pub fn jsonStringify(self: Control, out: anytype) !void {
        try out.beginObject();
        try out.objectField("sourceNode");
        try out.write(self.sourceNode);
        try out.objectField("paragraph");
        try out.write(self.paragraph);
        try out.objectField("kind");
        try out.write(self.kind);
        try out.objectField("value");
        switch (self.value) {
            inline else => |value| try out.write(value),
        }
        try out.endObject();
    }
};
const Section = struct {
    section: usize,
    startPage: u32 = 0,
    parity: []const u8 = "BOTH",
    hideFirst: bool = false,
    position: ?Position = null,
    controls: []const Control = &.{},
};
const Packet = struct {
    version: u8 = 1,
    initialPage: u32 = 1,
    charShapeId: ?u32 = null,
    sections: []const Section,
};
const max_controls = 20000;

fn normalize(raw: []const u8) []const u8 {
    return std.mem.trim(u8, raw, " \t\r\n");
}

fn bodyOwner(tree: *const Tree, node: usize, needs_ctrl: bool) !usize {
    const parent = tree.elements[node].parent orelse return error.UnsupportedHwpxPageControlOwner;
    const run = if (needs_ctrl) blk: {
        if (!tree.elements[parent].is(xml.paragraph_uri, "ctrl")) return error.UnsupportedHwpxPageControlOwner;
        break :blk tree.elements[parent].parent orelse return error.UnsupportedHwpxPageControlOwner;
    } else parent;
    if (!tree.elements[run].is(xml.paragraph_uri, "run")) return error.UnsupportedHwpxPageControlOwner;
    const paragraph = tree.elements[run].parent orelse return error.UnsupportedHwpxPageControlOwner;
    if (!tree.elements[paragraph].is(xml.paragraph_uri, "p") or tree.elements[paragraph].parent != 0)
        return error.UnsupportedHwpxPageControlOwner;
    return paragraph;
}

const Owners = std.AutoHashMapUnmanaged(usize, usize);

fn currentOwner(section: *const editor.Section, cache: *?Owners, a: std.mem.Allocator, node: usize) !Owner {
    const current = section.structure_values orelse return .{ .sourceNode = node };
    if (cache.* == null) {
        var index: Owners = .empty;
        for (current.paragraphs, 0..) |paragraph, ordinal| {
            if (paragraph.source_ordinal == null or paragraph.generated_id != null) continue;
            const entry = try index.getOrPut(a, paragraph.template_element);
            if (entry.found_existing) return error.AmbiguousHwpxPageControlOwner;
            entry.value_ptr.* = section.first_paragraph + ordinal - 1;
        }
        cache.* = index;
    }
    return .{ .sourceNode = node, .paragraph = cache.*.?.get(node) orelse return error.MissingHwpxPageControlOwner };
}

fn attr(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?[]const u8 {
    const value = (try tree.attributeValue(a, node, "", name)) orelse return null;
    return try value.toUtf8(a, 4096);
}

fn sectionPacket(a: std.mem.Allocator, scratch: std.mem.Allocator, source: *const editor.Section, ordinal: usize, remaining: *usize) !Section {
    const tree = &source.tree;
    if (tree.part_kind != .section or tree.section_ordinal != ordinal or tree.elements.len == 0)
        return error.InvalidPartKind;
    var result: Section = .{ .section = ordinal };
    var seen_start = false;
    var seen_visibility = false;
    var found_sec_pr: ?usize = null;
    var page_controls: std.ArrayList(Control) = .empty;
    var owners: ?Owners = null;
    for (tree.elements, 0..) |element, node| {
        if (element.is(xml.paragraph_uri, "secPr")) {
            _ = try bodyOwner(tree, node, false);
            if (found_sec_pr != null) return error.UnsupportedHwpxPageSectionProperties;
            found_sec_pr = node;
        } else if (found_sec_pr != null and element.parent == found_sec_pr and
            (element.is(xml.paragraph_uri, "startNum") or element.is(xml.paragraph_uri, "visibility")))
        {
            const start = element.is(xml.paragraph_uri, "startNum");
            var item = try settings.itemAt(scratch, tree, node, if (start) .start_num else .visibility);
            defer item.deinit(scratch);
            if (start) {
                if (seen_start) return error.AmbiguousHwpxPageStart;
                seen_start = true;
                if (item.get(.page)) |raw| result.startPage = try values.unsigned32(raw);
                if (item.get(.page_starts_on)) |raw| result.parity = try a.dupe(u8, normalize(raw));
            } else {
                if (seen_visibility) return error.AmbiguousHwpxPageVisibility;
                seen_visibility = true;
                if (item.get(.hide_first_page_num)) |raw| result.hideFirst = try values.boolean(raw);
            }
        } else if (element.is(xml.paragraph_uri, "pageNum")) {
            const owner = try currentOwner(source, &owners, a, try bodyOwner(tree, node, true));
            if (remaining.* == 0) return error.LimitExceeded;
            remaining.* -= 1;
            const fields = try controls.pageAt(scratch, a, tree, node);
            if (fields.pos_known == false or fields.format_known == false)
                return error.UnsupportedHwpxPageNumberPosition;
            const side = fields.get(.side_char) orelse "-";
            const unicode = try std.unicode.Utf8View.init(side);
            var scalars = unicode.iterator();
            var count: usize = 0;
            while (scalars.nextCodepoint()) |codepoint| {
                count += 1;
                if (count > 16 or codepoint < 32 or codepoint == 127) return error.InvalidHwpxPageNumberSideChar;
            }
            result.position = .{
                .sourceNode = owner.sourceNode,
                .paragraph = owner.paragraph,
                .position = normalize(fields.get(.pos) orelse "TOP_LEFT"),
                .format = normalize(fields.get(.format_type) orelse "DIGIT"),
                .sideChar = side,
            };
        } else if (element.is(xml.paragraph_uri, "newNum")) {
            const raw_kind = (try attr(scratch, tree, node, "numType")) orelse continue;
            defer scratch.free(raw_kind);
            if (!std.mem.eql(u8, normalize(raw_kind), "PAGE")) continue;
            const owner = try currentOwner(source, &owners, a, try bodyOwner(tree, node, true));
            if (remaining.* == 0) return error.LimitExceeded;
            remaining.* -= 1;
            const restart = (try controls.restartAt(scratch, a, tree, node)).num orelse 1;
            if (restart < 0) return error.InvalidHwpxPageNumberValue;
            try page_controls.append(a, .{ .sourceNode = owner.sourceNode, .paragraph = owner.paragraph, .kind = .restart, .value = .{ .restart = @intCast(restart) } });
        } else if (element.is(xml.paragraph_uri, "pageHiding")) {
            const owner = try currentOwner(source, &owners, a, try bodyOwner(tree, node, true));
            if (!@import("retained_page_hiding.zig").settingSupported(tree, node))
                return error.UnsupportedHwpxPageHiding;
            if (remaining.* == 0) return error.LimitExceeded;
            remaining.* -= 1;
            const raw = try attr(scratch, tree, node, "hidePageNum");
            defer if (raw) |flag| scratch.free(flag);
            const hide = if (raw) |flag| try values.boolean(flag) else false;
            try page_controls.append(a, .{ .sourceNode = owner.sourceNode, .paragraph = owner.paragraph, .kind = .hide, .value = .{ .hide = hide } });
        } else if (element.is(xml.paragraph_uri, "pageNumCtrl")) {
            _ = try bodyOwner(tree, node, true);
            if (try attr(scratch, tree, node, "pageStartsOn")) |raw| {
                defer scratch.free(raw);
                if (!std.mem.eql(u8, normalize(raw), "BOTH")) return error.UnsupportedHwpxPageNumberParity;
            }
        }
    }
    result.controls = page_controls.items;
    return result;
}

fn pageNumberStyle(a: std.mem.Allocator, header: *const Tree) !?u32 {
    var result: ?u32 = null;
    for (header.elements, 0..) |element, node| {
        if (!element.is(xml.head_uri, "style")) continue;
        const parent = element.parent orelse continue;
        if (!header.elements[parent].is(xml.head_uri, "styles")) continue;
        const name = (try attr(a, header, node, "engName")) orelse continue;
        defer a.free(name);
        if (!std.mem.eql(u8, name, "Page Number")) continue;
        const shape = (try attr(a, header, node, "charPrIDRef")) orelse continue;
        defer a.free(shape);
        if (result != null) return error.AmbiguousHwpxPageNumberStyle;
        result = try values.unsigned32(shape);
    }
    return result;
}

pub fn encode(a: std.mem.Allocator, session: *const editor.Session) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const owned = arena.allocator();
    const sections = try owned.alloc(Section, session.sections.len);
    var remaining: usize = max_controls;
    var has_position = false;
    for (session.sections, sections, 0..) |*section, *dto, ordinal| {
        dto.* = try sectionPacket(owned, a, section, ordinal, &remaining);
        if (dto.position) |position| has_position = has_position or !std.mem.eql(u8, position.position, "NONE");
    }
    const header = if (session.original_header) |*tree| tree else return error.MissingHwpxPageNumberHeader;
    if (session.original_header_source.ptr != session.source.ptr or
        session.original_header_source.len != session.source.len) return error.SourceBindingMismatch;
    const start = try @import("page_number_source.zig").headerStart(a, header);
    return std.json.Stringify.valueAlloc(a, Packet{
        .sections = sections,
        .initialPage = start orelse 1,
        .charShapeId = if (has_position) try pageNumberStyle(a, header) else null,
    }, .{});
}
