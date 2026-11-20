//! Exact selected-paragraph surgery with an emitted physical-node receipt.
const std = @import("std");
const model = @import("../../model/document.zig");
const mapping = @import("../edit/equation_create_map.zig");
const Request = @import("create_request.zig").Request;
const Version = @import("../version.zig").Version;
pub const Result = struct {
    raw: []u8,
    map: mapping.Map,
    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        a.free(self.raw);
        self.map.deinit(a);
        self.* = undefined;
    }
};

pub fn write(a: std.mem.Allocator, raw: []const u8, version: Version, current: model.Section, index: usize, req: Request, id: u32, ordinal: u16, char_count: usize, limit: usize) !Result {
    var tree = try @import("../edit/source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    if (index >= current.paragraphs.len) return error.InvalidParagraph;
    const p = current.paragraphs[index];
    const owner = try p.originalNode();
    if (owner >= tree.nodes.len or tree.nodes[owner].parent != null or p.parent_node != null) return error.UnsupportedChartHost;
    const parts = try @import("../body/paragraph_children.zig").collect(tree, owner);
    const header = tree.nodes[owner].record.value.header;
    if ((header.merge_tracking orelse 0) != 0) return error.UnsupportedParagraphExtension;
    // Metadata/leaf validation is scoped to the affected physical paragraph.
    try parts.metadata.validate(header, char_count);
    if (parts.line_node) |line| if (tree.nodes[line].subtree_end != line + 1) return error.UnsupportedParagraphRecord;
    if (parts.text_node) |text| {
        try tree.nodes[text].record.value.text.validateCount(header);
    } else if (header.characterUnits() > 1) return error.UnsupportedMissingText;
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var insert_before = tree.nodes[owner].subtree_end;
    var prefix_end: usize = 0;
    for (links.items) |link| {
        if (link.paragraph_node != owner) continue;
        const rules = @import("../body/control_rules.zig");
        if (link.code == 2 and link.start_unit == prefix_end and (link.id == rules.section_id or link.id == rules.column_id)) prefix_end += 8;
        if (link.start_unit >= req.target.anchor.unit and insert_before == tree.nodes[owner].subtree_end) insert_before = link.control_node;
    }
    if (req.target.anchor.unit < prefix_end) return error.InvalidChartCaret;
    var draft = try @import("../edit/created_table_host_draft.zig").prepareObject(a, p, req.target.anchor.unit, parts.metadata.ranges, char_count, limit, @import("../body/control_rules.zig").drawing_id);
    defer draft.deinit(a);
    const text = try @import("../edit/plain_text_content.zig").textBytes(a, draft);
    defer a.free(text);
    const runs = try @import("../edit/character_run_payload.zig").encode(a, draft.character_runs);
    defer a.free(runs);
    const ranges = try encodeRanges(a, draft.range_tags.?);
    defer a.free(ranges);
    var fragment = try @import("create_records.zig").create(a, req, id, tree.nodes[owner].record.framing.level, ordinal, limit);
    defer fragment.deinit();
    const head = try a.dupe(u8, tree.nodes[owner].record.framing.payload);
    defer a.free(head);
    const Header = @import("../body/paragraph_header.zig").Header;
    Header.writeTextCounts(head, draft.declared_units, @intCast(draft.character_runs.len), @intCast(draft.range_tags.?.len));
    std.mem.writeInt(u32, head[Header.control_mask_offset..][0..4], header.control_mask | (1 << 11), .little);
    const map = try a.alloc(?u32, tree.nodes.len);
    errdefer a.free(map);
    @memset(map, null);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    const append = @import("../record_writer.zig").append;
    var emitted: u32 = 0;
    for (tree.nodes, 0..) |node, old| {
        if (old == insert_before) {
            try put(a, &out, fragment.records, limit);
            emitted += 3;
        }
        if (parts.line_node != null and old == parts.line_node.?) continue;
        map[old] = emitted;
        if (old == owner) {
            try append(a, &out, 66, node.record.framing.level, head, limit);
            emitted += 1;
            if (parts.text_node == null) {
                try append(a, &out, 67, node.record.framing.level + 1, text, limit);
                emitted += 1;
            }
        } else if (parts.text_node != null and old == parts.text_node.?) {
            try append(a, &out, 67, node.record.framing.level, text, limit);
            emitted += 1;
        } else if (node.parent == owner and node.record.framing.tag == 68) {
            try append(a, &out, 68, node.record.framing.level, runs, limit);
            emitted += 1;
        } else if (node.parent == owner and node.record.framing.tag == 70) {
            try append(a, &out, 70, node.record.framing.level, ranges, limit);
            emitted += 1;
        } else {
            try put(a, &out, node.record.framing.raw, limit);
            emitted += 1;
        }
    }
    if (insert_before == tree.nodes.len) {
        try put(a, &out, fragment.records, limit);
        emitted += 3;
    }
    // An absent range record stays absent unless a real nonempty range exists.
    if (parts.metadata.ranges == null and ranges.len != 0) return error.UnsupportedRangeSemantics;
    var checked = try @import("../edit/source_tree.zig").parse(a, out.items, version, .{});
    defer checked.deinit(a);
    if (checked.nodes.len != emitted) return error.SourceBindingMismatch;
    var actual_links = try @import("../body/control_links.zig").Links.build(a, checked);
    defer actual_links.deinit(a);
    var count: usize = 0;
    for (checked.nodes) |node| if (node.record.value == .control_header and node.record.value.control_header.id == @import("../body/control_rules.zig").drawing_id) {
        const common = try @import("../body/object_common.zig").parseControl(node.record.value.control_header);
        if (common.instance_id == id) count += 1;
    };
    if (count != 1) return error.ChartCreationVerificationFailed;
    const ole_report = try @import("../body/ole_validation.zig").inspect(checked, .spec24);
    if (ole_report.objects == 0) return error.ChartCreationVerificationFailed;
    return .{ .raw = try out.toOwnedSlice(a), .map = .{ .nodes = map } };
}
fn put(a: std.mem.Allocator, out: *std.ArrayList(u8), b: []const u8, limit: usize) !void {
    if (out.items.len > limit or b.len > limit - out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, b);
}
fn encodeRanges(a: std.mem.Allocator, ranges: []const model.TextRange) ![]u8 {
    const b = try a.alloc(u8, ranges.len * 12);
    for (ranges, 0..) |r, i| {
        std.mem.writeInt(u32, b[i * 12 ..][0..4], r.start_unit, .little);
        std.mem.writeInt(u32, b[i * 12 + 4 ..][0..4], r.end_unit, .little);
        std.mem.writeInt(u32, b[i * 12 + 8 ..][0..4], r.tag, .little);
    }
    return b;
}
