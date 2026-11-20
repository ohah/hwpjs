//! Prepare owned current source and intents. Existing History alone publishes.
const std = @import("std");
const model = @import("../../model/document.zig");
const mapping = @import("../edit/equation_create_map.zig");
const Tables = @import("../edit/created_table_values.zig").Values;
const Backgrounds = @import("../edit/cell_background_values.zig").Values;
const records = @import("../edit/created_table_records.zig");
const Request = @import("create_request.zig").Request;
const Version = @import("../version.zig").Version;
pub const Prepared = struct {
    section: model.Section,
    tables: Tables,
    backgrounds: Backgrounds,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.section.deinit(a);
        self.tables.deinit(a);
        self.backgrounds.deinit(a);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, decoded: []const []u8, document: *const model.Document, pending: []const Tables, backgrounds: Backgrounds, version: Version, request: Request, ordinal: u16, resources: records.Resources, limits: records.Limits) !Prepared {
    try @import("create_request.zig").validate(request);
    const section_index = request.target.section;
    if (section_index >= document.sections.len) return error.InvalidSection;
    if (decoded.len != document.sections.len or pending.len != decoded.len) return error.SourceBindingMismatch;
    const current = document.sections[section_index];
    const target = try @import("../edit/created_table_anchor.zig").resolve(a, &current, request.target.anchor);
    if (current.paragraphs[target].parent_node != null) return error.UnsupportedChartHost;
    const expected = try @import("../edit/plain_text_content.zig").textBytes(a, current.paragraphs[target]);
    defer a.free(expected);
    if (!std.mem.eql(u8, expected, request.expected_text_utf16le)) return error.SourceBindingMismatch;
    // Reuse the source protection authority, including retained locked owners.
    var protection = try @import("../edit/text_source_protection.zig").read(a, decoded, version, section_index, current);
    defer protection.deinit(a);
    if (target >= protection.protected_paragraphs.len) return error.SourceBindingMismatch;
    if (protection.protected_paragraphs[target]) return error.UnsupportedChartProtectedHost;
    const id = try @import("../edit/equation_create_ids.zig").plan(a, decoded, document, pending);
    // Serialize paragraphs only. Pending tables are intentionally still semantic
    // values, and form/picture/cell resource intents stay with their existing owner.
    const emitted = try @import("../edit/structure_section_writer.zig").writeWithDeletions(a, decoded[section_index], current, version, resources.paragraphs.char_shapes, limits.max_bytes, true);
    defer a.free(emitted);
    var old_tree = try @import("../edit/source_tree.zig").parse(a, decoded[section_index], version, .{});
    defer old_tree.deinit(a);
    var emitted_tree = try @import("../edit/source_tree.zig").parse(a, emitted, version, .{});
    defer emitted_tree.deinit(a);
    var projected = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{emitted});
    defer projected.deinit(a);
    var first = try mapping.fromNativeWriter(a, old_tree, emitted_tree, current, projected.sections[0]);
    defer first.deinit(a);
    var normalized = try mapping.section(a, current, projected.sections[0], first);
    defer normalized.deinit(a);
    // A field can span paragraphs. Reject every containing field rather than
    // assigning new semantics to lock bits or field-label object insertion.
    const spans = try @import("../edit/local_field_spans.zig").collectReadableBound(a, emitted, version, normalized);
    defer a.free(spans);
    for (spans) |span| {
        if (target < span.begin.paragraph or target > span.end.paragraph) continue;
        const unit = request.target.anchor.unit;
        if ((target != span.begin.paragraph or unit >= span.begin.unit) and (target != span.end.paragraph or unit <= span.end.unit)) return error.UnsupportedChartFieldHost;
    }
    var physical_request = request;
    physical_request.target.anchor.host = .{ .original_node = try normalized.paragraphs[target].originalNode() };
    var changed = try @import("create_section.zig").write(a, emitted, version, normalized, target, physical_request, id, ordinal, resources.paragraphs.char_shapes, limits.max_bytes);
    defer changed.deinit(a);
    var final_projection = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{changed.raw});
    defer final_projection.deinit(a);
    var selected = try @import("../edit/created_table_host_draft.zig").prepareObject(a, normalized.paragraphs[target], request.target.anchor.unit, (try @import("../body/paragraph_children.zig").collect(emitted_tree, try normalized.paragraphs[target].originalNode())).metadata.ranges, resources.paragraphs.char_shapes, limits.max_bytes, @import("../body/control_rules.zig").drawing_id);
    defer selected.deinit(a);
    std.mem.swap(model.Paragraph, &normalized.paragraphs[target], &selected);
    var candidate = try mapping.section(a, normalized, final_projection.sections[0], changed.map);
    errdefer candidate.deinit(a);
    var tables = try pending[section_index].clone(a, limits.max_bytes);
    errdefer tables.deinit(a);
    for (tables.entries) |*entry| {
        const index = try @import("../edit/created_table_anchor.zig").resolve(a, &current, entry.anchor);
        entry.anchor.host = .{ .original_node = try candidate.paragraphs[index].originalNode() };
        if (index == target) entry.anchor.unit = try @import("../../model/protected_point_splice.zig").unit(entry.anchor.unit, request.target.anchor.unit, 0, 8);
    }
    var cells = try backgrounds.clone(a);
    errdefer cells.deinit(a);
    for (cells.entries) |*entry| if (entry.edit.section == section_index) {
        entry.edit.table_node = try changed.map.get(try first.get(entry.edit.table_node));
        entry.edit.list_node = try changed.map.get(try first.get(entry.edit.list_node));
    };
    const basis: @import("../../model/section_source_basis.zig").Basis = block: {
        const offsets = try styleOffsets(a, changed.raw, version, candidate, resources.paragraphs.styles);
        errdefer a.free(offsets);
        const owned = try a.dupe(u8, changed.raw);
        break :block .{ .bytes = owned, .style_offsets = offsets, .original_record_count = if (current.rebased_source) |old| old.original_record_count else current.source_record_count };
    };
    const owned = basis.bytes;
    if (candidate.rebased_source) |*old_basis| old_basis.deinit(a);
    candidate.rebased_source = basis;
    // Check the exact candidate through the same serializer as save. No result
    // is published on a late refusal; all other adapter intents remain owned.
    const verified = try @import("../edit/created_table_section.zig").write(a, owned, candidate, &tables, version, resources, limits);
    defer a.free(verified);
    try verify(a, owned, version, id, ordinal, request, candidate, target, true);
    var actual = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{verified});
    defer actual.deinit(a);
    try verify(a, verified, version, id, ordinal, request, actual.sections[0], target, false);
    return .{ .section = candidate, .tables = tables, .backgrounds = cells };
}
fn verify(a: std.mem.Allocator, raw: []const u8, version: Version, id: u32, ordinal: u16, request: Request, candidate: model.Section, target: usize, check_anchor: bool) !void {
    const sites = try @import("ole_sites.zig").read(a, raw, version, candidate.paragraphs, .spec24);
    defer a.free(sites);
    var count: usize = 0;
    for (sites) |site| if (site.geometry.instance_id == id) {
        if (site.ordinal != ordinal or (check_anchor and (site.paragraph != target or site.current_unit != request.target.anchor.unit)) or site.geometry.width != request.box.width or site.geometry.height != request.box.height or site.attributes != 1 or site.opaque_tail_bytes != 0) return error.ChartCreationVerificationFailed;
        count += 1;
    };
    if (count != 1) return error.ChartCreationVerificationFailed;
}

fn styleOffsets(a: std.mem.Allocator, raw: []const u8, version: Version, section: model.Section, styles: usize) ![]usize {
    const offsets = try a.alloc(usize, section.paragraphs.len);
    errdefer a.free(offsets);
    const Header = @import("../body/paragraph_header.zig").Header;
    var it = @import("../record.zig").Iterator.init(raw, .{});
    var node: usize = 0;
    var index: usize = 0;
    while (try it.next()) |record| : (node += 1) {
        if (record.tag != 66) continue;
        if (index >= offsets.len) return error.SourceBindingMismatch;
        const source_node = section.paragraphs[index].source_node orelse return error.SourceBindingMismatch;
        if (@as(usize, source_node) != node) return error.SourceBindingMismatch;
        const header = try Header.parse(record.payload, version);
        if (header.style_id >= styles) return error.InvalidStyleReference;
        offsets[index] = record.offset + record.raw.len - record.payload.len + Header.style_id_offset;
        index += 1;
    }
    if (index != offsets.len) return error.SourceBindingMismatch;
    return offsets;
}
