const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const fields = @import("field_marker_fields.zig");
const links = @import("field_marker_links.zig");

pub const Kind = enum { begin, end };

pub const Options = struct {
    max_markers: usize = 200_000,
    max_name_bytes: usize = 4096,
    max_attribute_bytes: usize = 4096,
    max_owned_bytes: usize = 128 * 1024 * 1024,
};

pub const Marker = struct {
    section_ordinal: usize,
    element_index: usize,
    parent_element_index: usize,
    parent_uri: []const u8,
    parent_local_name: []const u8,
    kind: Kind,
    raw_xml: []const u8,
    begin: ?fields.Begin = null,
    end: ?fields.End = null,
    direct_children: usize = 0,
    parameters_children: usize = 0,
    sub_list_children: usize = 0,
    meta_tag_children: usize = 0,
    unexpected_children: usize = 0,
    matched_marker_index: ?usize = null,
    duplicate_begin_id: bool = false,
    link_issue: links.Issue = .none,
    fieldid_mismatch: bool = false,
    non_lifo: bool = false,
};

pub const Report = struct {
    arena: std.heap.ArenaAllocator,
    sections: usize,
    markers: []const Marker,
    begins: usize,
    ends: usize,
    missing_begin_ids: usize,
    missing_types: usize,
    unknown_types: usize,
    unexpected_children: usize,
    other_attributes: usize,
    duplicate_begin_ids: usize,
    unmatched_begins: usize,
    unresolved_ends: usize,
    non_lifo_closures: usize,
    fieldid_mismatches: usize,
    owned_bytes: usize,

    pub fn deinit(self: *Report) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

const Budget = struct {
    max: usize,
    used: usize = 0,

    pub fn copy(self: *Budget, a: std.mem.Allocator, bytes: []const u8) ![]const u8 {
        if (bytes.len > self.max -| self.used) return error.LimitExceeded;
        const result = try a.dupe(u8, bytes);
        self.used += bytes.len;
        return result;
    }
};

fn markerKind(element: tree_mod.Element) ?Kind {
    if (element.is(document_xml.paragraph_uri, "fieldBegin")) return .begin;
    if (element.is(document_xml.paragraph_uri, "fieldEnd")) return .end;
    return null;
}

/// Owns exact field marker XML and lexical attributes; pairs only explicit
/// beginIDRef within a selected section, preserving missing and bad links.
pub fn inspect(a: std.mem.Allocator, sections: []const tree_mod.Tree, options: Options) !Report {
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned_a = arena.allocator();
    var budget: Budget = .{ .max = options.max_owned_bytes };
    var markers: std.ArrayList(Marker) = .empty;
    var begins: usize = 0;
    var ends: usize = 0;
    var missing_begin_ids: usize = 0;
    var missing_types: usize = 0;
    var unknown_types: usize = 0;
    var unexpected_children: usize = 0;
    var other_attributes: usize = 0;
    var link_summary: links.Summary = .{};
    for (sections, 0..) |*tree, ordinal| {
        if (tree.part_kind != .section or tree.section_ordinal != ordinal or tree.elements.len == 0) return error.InvalidPartKind;
        const first_marker = markers.items.len;
        for (tree.elements, 0..) |element, element_index| {
            const kind = markerKind(element) orelse continue;
            const parent_index = element.parent orelse continue;
            if (markers.items.len >= options.max_markers) return error.LimitExceeded;
            const parent_name = tree.elements[parent_index].name;
            if (parent_name.uri.len > options.max_name_bytes) return error.LimitExceeded;
            const parent_local = try (xml.text_content.View{
                .kind = .cdata,
                .raw = parent_name.local.raw,
                .encoding = parent_name.local.encoding,
                .scalars = 0,
                .reference_options = .{},
            }).toUtf8(a, options.max_name_bytes);
            defer a.free(parent_local);
            var marker: Marker = .{
                .section_ordinal = ordinal,
                .element_index = element_index,
                .parent_element_index = parent_index,
                .parent_uri = try budget.copy(owned_a, parent_name.uri),
                .parent_local_name = try budget.copy(owned_a, parent_local),
                .kind = kind,
                .raw_xml = try budget.copy(owned_a, tree.sourceOf(element_index)),
            };
            switch (kind) {
                .begin => {
                    begins += 1;
                    marker.begin = try fields.readBegin(a, owned_a, tree, element_index, options.max_attribute_bytes, &budget);
                    missing_begin_ids += @intFromBool(marker.begin.?.id == null);
                    missing_types += @intFromBool(marker.begin.?.type_raw == null);
                    unknown_types += @intFromBool(marker.begin.?.type_known == false);
                    other_attributes += marker.begin.?.other_attributes;
                },
                .end => {
                    ends += 1;
                    marker.end = try fields.readEnd(a, owned_a, tree, element_index, options.max_attribute_bytes, &budget);
                    other_attributes += marker.end.?.other_attributes;
                },
            }
            var child = element.first_child;
            while (child) |child_index| : (child = tree.elements[child_index].next_sibling) {
                marker.direct_children += 1;
                const child_element = tree.elements[child_index];
                if (kind == .begin and child_element.is(document_xml.paragraph_uri, "parameters")) {
                    marker.parameters_children += 1;
                } else if (kind == .begin and child_element.is(document_xml.paragraph_uri, "subList")) {
                    marker.sub_list_children += 1;
                } else if (kind == .begin and child_element.is(document_xml.paragraph_uri, "metaTag")) {
                    marker.meta_tag_children += 1;
                } else {
                    marker.unexpected_children += 1;
                    unexpected_children += 1;
                }
            }
            try markers.append(owned_a, marker);
        }
        const section_summary = try links.link(a, markers.items[first_marker..], first_marker);
        link_summary.duplicate_begin_ids += section_summary.duplicate_begin_ids;
        link_summary.unmatched_begins += section_summary.unmatched_begins;
        link_summary.unresolved_ends += section_summary.unresolved_ends;
        link_summary.non_lifo_closures += section_summary.non_lifo_closures;
        link_summary.fieldid_mismatches += section_summary.fieldid_mismatches;
    }
    return .{
        .arena = arena,
        .sections = sections.len,
        .markers = try markers.toOwnedSlice(owned_a),
        .begins = begins,
        .ends = ends,
        .missing_begin_ids = missing_begin_ids,
        .missing_types = missing_types,
        .unknown_types = unknown_types,
        .unexpected_children = unexpected_children,
        .other_attributes = other_attributes,
        .duplicate_begin_ids = link_summary.duplicate_begin_ids,
        .unmatched_begins = link_summary.unmatched_begins,
        .unresolved_ends = link_summary.unresolved_ends,
        .non_lifo_closures = link_summary.non_lifo_closures,
        .fieldid_mismatches = link_summary.fieldid_mismatches,
        .owned_bytes = budget.used,
    };
}
