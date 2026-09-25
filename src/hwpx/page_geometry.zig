const std = @import("std");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");
const xml_values = @import("xml_values.zig");

pub const Orientation = enum { widely, narrowly };
pub const GutterType = enum { left_only, left_right, top_bottom };
pub const Options = struct {
    max_pages: usize = 100_000,
    max_attribute_bytes: usize = 4096,
};

pub const Margin = struct {
    header: ?u32 = null,
    footer: ?u32 = null,
    gutter: ?u32 = null,
    left: ?u32 = null,
    right: ?u32 = null,
    top: ?u32 = null,
    bottom: ?u32 = null,
};

pub const Page = struct {
    section_ordinal: usize,
    element_index: usize,
    orientation: ?Orientation = null,
    width: ?u32 = null,
    height: ?u32 = null,
    gutter_type: ?GutterType = null,
    margin: ?Margin = null,
    duplicate_margins: usize = 0,
};

pub const Report = struct {
    pages: []Page,
    sections: usize,
    sections_without_page: usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.pages);
        self.* = undefined;
    }
};

fn attribute(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize, name: []const u8, max_bytes: usize) !?[]u8 {
    const raw = try tree.attributeValue(a, index, "", name);
    if (raw) |value| return try value.toUtf8(a, max_bytes);
    return null;
}

fn number(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize, name: []const u8, max_bytes: usize) !?u32 {
    const raw = try attribute(a, tree, index, name, max_bytes);
    defer if (raw) |value| a.free(value);
    return if (raw) |value| try xml_values.unsigned32(value) else null;
}

fn orientation(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize, max_bytes: usize) !?Orientation {
    const raw = try attribute(a, tree, index, "landscape", max_bytes);
    defer if (raw) |value| a.free(value);
    if (raw) |value| {
        const normalized = std.mem.trim(u8, value, " \t\r\n");
        if (std.mem.eql(u8, normalized, "WIDELY")) return .widely;
        if (std.mem.eql(u8, normalized, "NARROWLY")) return .narrowly;
        return error.InvalidPageOrientation;
    }
    return null;
}

fn gutterType(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize, max_bytes: usize) !?GutterType {
    const raw = try attribute(a, tree, index, "gutterType", max_bytes);
    defer if (raw) |value| a.free(value);
    if (raw) |value| {
        const normalized = std.mem.trim(u8, value, " \t\r\n");
        if (std.mem.eql(u8, normalized, "LEFT_ONLY")) return .left_only;
        if (std.mem.eql(u8, normalized, "LEFT_RIGHT")) return .left_right;
        if (std.mem.eql(u8, normalized, "TOP_BOTTOM")) return .top_bottom;
        return error.InvalidPageGutterType;
    }
    return null;
}

fn readMargin(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize, max_bytes: usize) !Margin {
    return .{
        .header = try number(a, tree, index, "header", max_bytes),
        .footer = try number(a, tree, index, "footer", max_bytes),
        .gutter = try number(a, tree, index, "gutter", max_bytes),
        .left = try number(a, tree, index, "left", max_bytes),
        .right = try number(a, tree, index, "right", max_bytes),
        .top = try number(a, tree, index, "top", max_bytes),
        .bottom = try number(a, tree, index, "bottom", max_bytes),
    };
}

/// Observes every 2011 hp:pagePr under a direct hp:secPr child. Each page
/// retains its section position; missing attributes stay absent, not defaulted.
/// This is geometry data, not a layout or whole-schema validity decision.
pub fn inspect(a: std.mem.Allocator, sections: []const part_tree.Tree, options: Options) !Report {
    var pages: std.ArrayList(Page) = .empty;
    errdefer pages.deinit(a);
    var without_page: usize = 0;
    for (sections, 0..) |*tree, section_ordinal| {
        if (tree.part_kind != .section or tree.elements.len == 0 or tree.section_ordinal != section_ordinal) return error.InvalidPartKind;
        const before = pages.items.len;
        for (tree.elements, 0..) |element, index| {
            if (!element.is(document_xml.paragraph_uri, "pagePr")) continue;
            const parent_index = element.parent orelse continue;
            if (!tree.elements[parent_index].is(document_xml.paragraph_uri, "secPr")) continue;
            if (pages.items.len == options.max_pages) return error.LimitExceeded;
            var page: Page = .{
                .section_ordinal = section_ordinal,
                .element_index = index,
                .orientation = try orientation(a, tree, index, options.max_attribute_bytes),
                .width = try number(a, tree, index, "width", options.max_attribute_bytes),
                .height = try number(a, tree, index, "height", options.max_attribute_bytes),
                .gutter_type = try gutterType(a, tree, index, options.max_attribute_bytes),
            };
            var child = element.first_child;
            while (child) |child_index| : (child = tree.elements[child_index].next_sibling) {
                if (!tree.elements[child_index].is(document_xml.paragraph_uri, "margin")) continue;
                if (page.margin == null) page.margin = try readMargin(a, tree, child_index, options.max_attribute_bytes) else {
                    page.duplicate_margins += 1;
                    _ = try readMargin(a, tree, child_index, options.max_attribute_bytes);
                }
            }
            try pages.append(a, page);
        }
        if (before == pages.items.len) without_page += 1;
    }
    return .{ .pages = try pages.toOwnedSlice(a), .sections = sections.len, .sections_without_page = without_page };
}
