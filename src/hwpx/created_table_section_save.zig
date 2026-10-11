//! Insert model-derived table fragments into a temporary current section view.
const std = @import("std");
const editor = @import("editor_session.zig");
const xml = @import("../xml/root.zig");
const sites_mod = @import("text_sites.zig");
const source_writer = @import("xml_source_writer.zig");
const Pending = struct { site: usize, unit: u32, entry: usize };

fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > limit -| out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
fn tag(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, node: usize) !xml.tags.Tag {
    const span = tree.elements[node].start_tag;
    var input = try xml.input.Input.init(tree.source[span.start..span.end], .utf8, .{});
    return xml.tags.parse(a, &input, .{});
}
fn opening(a: std.mem.Allocator, out: *std.ArrayList(u8), value: xml.tags.Tag, limit: usize) !void {
    if (value.kind == .empty) {
        try append(a, out, value.raw[0 .. value.raw.len - 2], limit);
        try append(a, out, ">", limit);
    } else try append(a, out, value.raw, limit);
}
fn closing(a: std.mem.Allocator, out: *std.ArrayList(u8), value: xml.tags.Tag, limit: usize) !void {
    try append(a, out, "</", limit);
    try append(a, out, value.name.raw, limit);
    try append(a, out, ">", limit);
}
fn cloneable(value: xml.tags.Tag, run: bool) !void {
    for (value.attributes) |attribute| {
        const name = attribute.name.raw;
        if ((run and std.mem.eql(u8, name, "charPrIDRef")) or std.mem.eql(u8, name, "xmlns") or std.mem.startsWith(u8, name, "xmlns:") or std.mem.eql(u8, name, "xml:space") or std.mem.eql(u8, name, "xml:lang")) continue;
        return error.UnsupportedCreatedTableHostAttributes;
    }
}

fn replacement(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, tree: *const @import("xml_part_tree.zig").Tree, sites: *const sites_mod.Sites, group: []const Pending, limit: usize) ![]u8 {
    const site = sites.items[group[0].site];
    const element = tree.elements[site.element_index];
    const run_node = if (site.missing_text) site.element_index else element.parent orelse return error.SourceBindingMismatch;
    if (!tree.elements[run_node].is(@import("document_xml.zig").paragraph_uri, "run")) return error.SourceBindingMismatch;
    var run = try tag(a, tree, run_node);
    defer run.deinit(a);
    var text_tag: ?xml.tags.Tag = if (!site.missing_text) try tag(a, tree, site.element_index) else null;
    defer if (text_tag) |*value| value.deinit(a);
    if (!site.missing_text) {
        try cloneable(run, true);
        try cloneable(text_tag.?, false);
    }
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    if (site.empty_element) try opening(a, &output, if (site.missing_text) run else text_tag.?, limit);
    var cursor: usize = 0;
    for (group) |pending| {
        const byte = try @import("text_site_edit.zig").bytePosition(site.text, pending.unit);
        if (byte < cursor) return error.InvalidTextPosition;
        const prefix = try @import("../xml/text_writer.zig").encode(a, site.text[cursor..byte], limit -| output.items.len);
        defer a.free(prefix);
        try append(a, &output, prefix, limit);
        if (!site.missing_text) {
            try closing(a, &output, text_tag.?, limit);
            try closing(a, &output, run, limit);
            try opening(a, &output, run, limit);
        }
        const fragment = try @import("created_table_xml.zig").write(a, &session.sections[section_index].created_tables.entries.items[pending.entry].table, limit -| output.items.len);
        defer a.free(fragment);
        try append(a, &output, fragment, limit);
        if (!site.missing_text) {
            try closing(a, &output, run, limit);
            try opening(a, &output, run, limit);
            try opening(a, &output, text_tag.?, limit);
        }
        cursor = byte;
    }
    const suffix = try @import("../xml/text_writer.zig").encode(a, site.text[cursor..], limit -| output.items.len);
    defer a.free(suffix);
    try append(a, &output, suffix, limit);
    if (site.empty_element) try closing(a, &output, if (site.missing_text) run else text_tag.?, limit);
    return output.toOwnedSlice(a);
}

pub fn write(session: *const editor.Session, section_index: usize, current_xml: []const u8, limit: usize) ![]u8 {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const a = session.allocator;
    const section = &session.sections[section_index];
    var tree = try @import("section_tree.zig").parse(a, current_xml, section_index, section.tree.item_index, .{});
    defer tree.deinit(a);
    const options = editor.siteOptions(session.options);
    var sites = try sites_mod.collect(a, &tree, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, options);
    defer a.free(locations);
    var pending: std.ArrayList(Pending) = .empty;
    defer pending.deinit(a);
    var hosts: std.AutoHashMap(usize, void) = .init(a);
    defer hosts.deinit();
    for (section.created_tables.entries.items, 0..) |entry, entry_index| {
        const point = try @import("created_table_anchor.zig").resolve(a, session, entry.anchor);
        const local = point.paragraph - section.first_paragraph + 1;
        try @import("plain_paragraph_policy.zig").validateWithAnchors(&tree, &sites, locations, local);
        const positions = try @import("anchor_text_positions.zig").build(a, &tree, &sites, locations, local);
        defer a.free(positions);
        try @import("paragraph_text_positions.zig").validateBoundary(&sites, positions, point.unit);
        var best: ?Pending = null;
        var quality: u8 = 0;
        for (positions) |position| {
            if (position.kind != .text or point.unit < position.start_unit or point.unit > position.end_unit) continue;
            const candidate = sites.items[position.index];
            const score: u8 = if (!candidate.missing_text) 2 else if (!candidate.anchor_boundary) 1 else 0;
            if (best != null and (score < quality or (score == quality and candidate.start < sites.items[best.?.site].start))) continue;
            quality = score;
            best = .{ .site = position.index, .unit = @intCast(point.unit - position.start_unit), .entry = entry_index };
        }
        try pending.append(a, best orelse return error.MissingCreatedTableInsertionSite);
        try hosts.put(try @import("paragraph_site_owner.zig").resolve(&tree, &sites, locations, local), {});
    }
    std.mem.sort(Pending, pending.items, &sites, struct {
        fn less(source: *const sites_mod.Sites, left: Pending, right: Pending) bool {
            if (source.items[left.site].start != source.items[right.site].start) return source.items[left.site].start < source.items[right.site].start;
            if (left.site != right.site) return left.site < right.site;
            if (left.unit != right.unit) return left.unit < right.unit;
            return left.entry < right.entry;
        }
    }.less);
    var changes: std.ArrayList(source_writer.Change) = .empty;
    defer {
        for (changes.items) |change| if (change.serialized_xml) |bytes| a.free(bytes);
        changes.deinit(a);
    }
    var index: usize = 0;
    while (index < pending.items.len) {
        var end = index + 1;
        while (end < pending.items.len and pending.items[end].site == pending.items[index].site) : (end += 1) {}
        const site = sites.items[pending.items[index].site];
        const bytes = try replacement(a, session, section_index, &tree, &sites, pending.items[index..end], limit);
        errdefer a.free(bytes);
        try changes.append(a, .{ .start = site.start, .end = site.end, .text = "", .serialized_xml = bytes });
        index = end;
    }
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "linesegarray")) continue;
        if (element.parent) |parent| if (hosts.contains(parent)) try changes.append(a, .{ .start = element.start_tag.start, .end = tree.elements[node].end, .text = "" });
    }
    std.mem.sort(source_writer.Change, changes.items, {}, struct {
        fn less(_: void, left: source_writer.Change, right: source_writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return source_writer.write(a, current_xml, changes.items, limit);
}
