//! Prepared fixed-topology section only. Managed Session/history publication is separate.
const std = @import("std");
const model = @import("../../model/document.zig");
const epoch = @import("../../model/history_mutation_epoch.zig");
const alignment = @import("../../model/cell_vertical_alignment.zig");
const payload = @import("cell_vertical_alignment_payload.zig");
const Version = @import("../version.zig").Version;
pub const Selector = struct { section: u32, table_node: u32, list_node: u32, paragraph: u32 };
pub const Observation = struct { selector: Selector, attributes: u32, value: ?alignment.Alignment, source_sha256: [32]u8, ticket: epoch.Ticket, read_only: bool };
pub const Request = struct { before: Observation, value: alignment.Alignment };
pub fn observe(a: std.mem.Allocator, raw: []const u8, version: Version, section: model.Section, section_index: u32, selector: Selector, ticket: epoch.Ticket, read_only: bool) !Observation {
    if (selector.section != section_index) return error.InvalidSection;
    const bindings = try @import("table_display_bindings.zig").read(a, raw, version, section.paragraphs);
    defer a.free(bindings);
    var matches: usize = 0;
    for (bindings) |binding| if (binding.table_node == selector.table_node and binding.list_node == selector.list_node and binding.paragraph == selector.paragraph) {
        matches += 1;
    };
    if (matches != 1) return error.InvalidCellDisplayOwner;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    if (selector.list_node >= tree.nodes.len or tree.nodes[selector.list_node].record.value != .list_header) return error.InvalidCellDisplayOwner;
    const current = try payload.observe(tree.nodes[selector.list_node].record.framing.payload, .observed8);
    const spans = try @import("local_field_spans.zig").collectReadableBound(a, raw, version, section);
    defer a.free(spans);
    var protected = read_only or current.attributes & (1 << 17) != 0;
    for (bindings) |binding| {
        if (binding.table_node != selector.table_node or binding.list_node != selector.list_node) continue;
        for (spans) |span| if (span.begin.paragraph <= binding.paragraph and span.end.paragraph >= binding.paragraph) {
            protected = true;
        };
    }
    var sha256: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(raw, &sha256, .{});
    return .{ .selector = selector, .attributes = current.attributes, .value = current.value, .source_sha256 = sha256, .ticket = ticket, .read_only = protected };
}
pub fn write(a: std.mem.Allocator, raw: []const u8, version: Version, section: model.Section, section_index: u32, request: Request, ticket: epoch.Ticket, read_only: bool, limit: usize) !?[]u8 {
    if (raw.len > limit) return error.LimitExceeded;
    const current = try observe(a, raw, version, section, section_index, request.before.selector, ticket, read_only);
    if (!std.meta.eql(current, request.before)) return error.StaleCellVerticalAlignment;
    if (current.read_only) return error.CellVerticalAlignmentReadOnly;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const record = tree.nodes[current.selector.list_node].record.framing;
    const changed = (try payload.write(a, record.payload, .observed8, current.attributes, request.value, record.payload.len)) orelse return null;
    defer a.free(changed);
    const at = record.offset + record.raw.len - record.payload.len;
    const output = try a.dupe(u8, raw);
    @memcpy(output[at..][0..changed.len], changed);
    return output;
}
