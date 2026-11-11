//! Stage a source-bound CLICK_HERE pair through the same section rebase as rename.
const std = @import("std");
const editor = @import("editor_session.zig");
const rename = @import("named_field_rename.zig");
const projection = @import("paragraph_text_positions.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub const max_name_bytes = rename.max_name_bytes;
pub const max_parameter_bytes = 4096;

pub const Parameters = struct {
    direction: []const u8 = "",
    memo: []const u8 = "",
};

pub fn apply(session: *editor.Session, section: usize, paragraph: usize, start: u32, end: u32, expected: []const u8, name: []const u8, parameters: Parameters) !bool {
    if (!session.history_delta_managed or !session.history_transaction_active) return error.HistoryProtocol2Required;
    if (std.mem.trim(u8, name, " \t\r\n").len == 0) return error.InvalidNamedFieldName;
    if (name.len > max_name_bytes or expected.len > session.options.max_text_bytes or
        parameters.direction.len > max_parameter_bytes or parameters.memo.len > max_parameter_bytes) return error.LimitExceeded;
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    if (end < start) return error.InvalidTextPosition;
    const old = &session.sections[section];
    try old.validateSourceBasis();
    const original = old.original_basis orelse return error.SourceBindingMismatch;
    if (@import("created_table_host_splice.zig").hasPending(session) or
        !rename.supportsFlatSection(session, section, old))
        return error.UnsupportedNamedFieldCreateSection;

    const a = session.allocator;
    const tree = &old.tree;
    const ordinal = try old.sourceParagraph(paragraph);
    const owner = try @import("paragraph_site_owner.zig").resolve(tree, &old.sites, old.locations, ordinal);
    const root = tree.elements[owner].parent orelse return error.UnsupportedNamedFieldCreateOwner;
    if (tree.elements[root].parent != null or !tree.elements[root].is(@import("document_xml.zig").section_uri, "sec"))
        return error.UnsupportedNamedFieldCreateOwner;
    // Formula display values can use a different axis from current source sites.
    if (try @import("formula_section_save.zig").hasFormula(a, tree)) return error.UnsupportedNamedFieldCreateSection;
    const segments = if (try @import("field_source_outside_positions.zig").prepare(session, section, paragraph, start, end)) |exterior|
        exterior
    else
        try @import("source_field_paragraph_positions.zig").build(session, section, paragraph);
    defer a.free(segments);
    try projection.validateRange(segments, start, end);
    try projection.validateBoundary(&old.sites, segments, start);
    try projection.validateBoundary(&old.sites, segments, end);

    const segment = try selectSite(old, segments, start, end);
    const site = old.sites.items[segment.index];
    const node = tree.elements[site.element_index];
    const run = node.parent orelse return error.UnsupportedNamedFieldCreateOwner;
    if (!tree.elements[run].is(uri, "run") or tree.elements[run].parent != owner)
        return error.UnsupportedNamedFieldCreateOwner;
    try old.sites.validateTextOwnership(segment.index);
    var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, site.element_index);
    defer tag.deinit(a);
    // Splitting attributed or mixed text could duplicate opaque semantics.
    if (tag.attributes.len != 0 or (node.end_tag != null and
        (site.start != node.start_tag.end or site.end != node.end_tag.?.start)))
        return error.UnsupportedNamedFieldCreateSite;

    const bytePosition = @import("text_site_edit.zig").bytePosition;
    const first = try bytePosition(site.text, @intCast(start - segment.start_unit));
    const last = try bytePosition(site.text, @intCast(end - segment.start_unit));
    if (!std.mem.eql(u8, expected, site.text[first..last])) return error.NamedFieldValueMismatch;
    const id = try @import("named_fields.zig").creationId(session, name);
    const replacement = try serialize(a, tag.name.raw, id, name, site.text[0..first], site.text[first..last], site.text[last..], parameters, session.options.max_xml_bytes);
    defer a.free(replacement);
    const xml = try @import("text_sites_save.zig").writeReplacingSite(a, tree, &old.sites, editor.siteOptions(session.options), old.field_dirty.items, segment.index, replacement, session.options.max_xml_bytes);
    defer a.free(xml);
    const next = try @import("section_source_basis.zig").prepare(a, xml, section, tree.item_index, old.first_paragraph, session.options);
    var staged: editor.Section = .{
        .original_basis = original,
        .owned_rebased_basis = next.basis,
        .tree = next.basis.tree,
        .sites = next.sites,
        .locations = next.basis.locations,
        .entry_index = old.entry_index,
        .first_paragraph = old.first_paragraph,
        .source_first_paragraph = old.first_paragraph,
        .last_paragraph = next.basis.last_paragraph,
    };
    errdefer staged.deinitCurrent(a);
    if (staged.last_paragraph != old.last_paragraph) return error.SourceBindingMismatch;
    try validateStagedField(session, section, paragraph, start, end, id, &staged);
    try session.installSectionSourceBasis(section, &staged);
    return true;
}

fn validateStagedField(session: *const editor.Session, section: usize, paragraph: usize, start: u32, end: u32, id: u32, staged: *const editor.Section) !void {
    const a = session.allocator;
    const sections = try a.dupe(editor.Section, session.sections);
    defer a.free(sections);
    sections[section] = staged.*;
    var proxy = session.*;
    proxy.sections = sections;
    proxy.source_fields = null;
    var lease = try @import("source_field_analysis.zig").leaseForExterior(&proxy);
    defer lease.deinit(a);
    const report = &lease.source.report;
    const marker = for (report.markers) |marker| {
        if (marker.section_ordinal == section and marker.begin != null and marker.begin.?.id == id) break marker;
    } else return error.SourceBindingMismatch;
    const frames = try @import("xml_tree_selection.zig").build(a, &staged.tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    const prepared = try @import("field_label_session.zig").prepareLinked(
        &proxy,
        section,
        paragraph,
        marker.element_index,
        report,
        lease.source.fields,
        frames,
    );
    defer prepared.deinit(a);
    const span = @import("field_text_positions.zig").project(prepared.field, section, prepared.segments) orelse
        return error.SourceBindingMismatch;
    if (span.start_unit != start or span.end_unit != end) return error.SourceBindingMismatch;
}

fn selectSite(section: *const editor.Section, segments: []const projection.Segment, start: u32, end: u32) !projection.Segment {
    var candidate: ?projection.Segment = null;
    for (segments) |segment| {
        if (segment.kind != .text or start < segment.start_unit or end > segment.end_unit) continue;
        const site = section.sites.items[segment.index];
        const node = section.tree.elements[site.element_index];
        if (site.anchor_boundary or site.missing_text or !node.is(uri, "t") or node.first_child != null) continue;
        // A boundary with more than one eligible source site has ambiguous affinity.
        if (candidate != null) return error.UnsupportedNamedFieldCreateSite;
        candidate = segment;
    }
    return candidate orelse error.UnsupportedNamedFieldCreateSite;
}

fn serialize(a: std.mem.Allocator, qname: []const u8, id: u32, name: []const u8, before: []const u8, value: []const u8, after: []const u8, parameters: Parameters, limit: usize) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const attr = try @import("../xml/attribute_writer.zig").encode(scratch, name, limit);
    const encode = @import("../xml/text_writer.zig").encode;
    const left = try encode(scratch, before, limit);
    const body = try encode(scratch, value, limit);
    const right = try encode(scratch, after, limit);
    // The t has no local namespace declaration, so its prefix (or default)
    // remains bound to the paragraph namespace at the sibling ctrl markers.
    const prefix = qname[0 .. qname.len - 1];
    const left_node = if (left.len == 0) "" else try textNode(scratch, qname, left);
    const right_node = if (right.len == 0) "" else try textNode(scratch, qname, right);
    const body_node = try textNode(scratch, qname, body);
    const parameter_xml = try serializeParameters(scratch, prefix, parameters, limit);
    return std.fmt.allocPrint(a, "{s}<{s}ctrl><{s}fieldBegin id=\"{d}\" type=\"CLICK_HERE\" name=\"{s}\" editable=\"1\" dirty=\"{d}\" zorder=\"-1\" fieldid=\"{d}\">{s}</{s}fieldBegin></{s}ctrl>{s}<{s}ctrl><{s}fieldEnd beginIDRef=\"{d}\" fieldid=\"{d}\"/></{s}ctrl>{s}", .{ left_node, prefix, prefix, id, attr, @intFromBool(value.len != 0), click_here_control_id, parameter_xml, prefix, prefix, body_node, prefix, prefix, id, click_here_control_id, prefix, right_node });
}

fn serializeParameters(a: std.mem.Allocator, prefix: []const u8, parameters: Parameters, limit: usize) ![]u8 {
    // KS X 6101 10.7.3.1 and 10.7.3.2.1. Count the unescaped command
    // payload on the UTF-16 axis, including the separator after each value.
    const command = try commandValue(a, parameters);
    const encode = @import("../xml/text_writer.zig").encode;
    const command_xml = try encode(a, command, limit);
    const direction_xml = try encode(a, parameters.direction, limit);
    const memo_xml = try encode(a, parameters.memo, limit);
    return std.fmt.allocPrint(a, "<{0s}parameters cnt=\"4\" name=\"\">" ++
        "<{0s}integerParam name=\"Prop\">9</{0s}integerParam>" ++
        "<{0s}stringParam name=\"Command\" xml:space=\"preserve\">{1s}</{0s}stringParam>" ++
        "<{0s}stringParam name=\"Direction\">{2s}</{0s}stringParam>" ++
        "<{0s}stringParam name=\"HelpState\">{3s}</{0s}stringParam></{0s}parameters>", .{ prefix, command_xml, direction_xml, memo_xml });
}

/// Shared CLICK_HERE command spelling for creation and property edits.
/// Owns the returned UTF-8 value, before XML escaping.
pub fn commandValue(a: std.mem.Allocator, parameters: Parameters) ![]u8 {
    const units = @import("text_site_edit.zig").utf16Length;
    const payload = try std.fmt.allocPrint(a, "Direction:wstring:{d}:{s} HelpState:wstring:{d}:{s} ", .{
        try units(parameters.direction), parameters.direction, try units(parameters.memo), parameters.memo,
    });
    defer a.free(payload);
    return std.fmt.allocPrint(a, "Clickhere:set:{d}:{s} ", .{ try units(payload), payload });
}

// KS X 6101 10.7.3.1 CLICK_HERE example uses the same fieldid as %clk.
const click_here_control_id: u32 = 0x25636c6b;

fn textNode(a: std.mem.Allocator, qname: []const u8, value: []const u8) ![]u8 {
    return std.fmt.allocPrint(a, "<{s}>{s}</{s}>", .{ qname, value, qname });
}
