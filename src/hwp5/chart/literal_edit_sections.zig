//! Fixed-size source field changes only. Semantic paragraph/table/style intents remain owned by their existing journal.
const std = @import("std");
const model = @import("../../model/document.zig");
const Target = @import("literal_edit_request.zig").Target;
pub const Section = struct { index: usize, value: model.Section };
pub const Prepared = struct {
    sections: []Section,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        for (self.sections) |*s| s.value.deinit(a);
        a.free(self.sections);
        self.* = undefined;
    }
};
pub fn patch(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, targets: []const Target, section: usize, ordinal: u16, materialized: bool) ![]u8 {
    var tree = try @import("../edit/source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    _ = try @import("../body/ole_validation.zig").inspectSelected(tree, .structural, null, .uninspected);
    const bytes = try a.dupe(u8, raw);
    errdefer a.free(bytes);
    const sources = try @import("../edit/drawing_sources.zig").read(a, raw, version);
    defer a.free(sources);
    var by_instance: std.AutoHashMapUnmanaged(u32, ?usize) = .empty;
    defer by_instance.deinit(a);
    for (sources, 0..) |source, i| {
        const slot = try by_instance.getOrPut(a, source.instance_id);
        slot.value_ptr.* = if (slot.found_existing) null else i;
    }
    for (targets) |target| {
        if (target.section != section) continue;
        const resolved = by_instance.get(target.owner.geometry.instance_id) orelse return error.SourceBindingMismatch;
        const source = sources[resolved orelse return error.UnsupportedChartLiteralEditAmbiguousOwner];
        if (source.kind_id != @import("../body/control_rules.zig").id("$ole")) return error.SourceBindingMismatch;
        const child = (try @import("../body/owned_record.zig").find(tree, source.component_node, 84)) orelse return error.SourceBindingMismatch;
        if (!materialized and (source.component_node != target.owner.component_node or source.control_node != target.owner.control_node or child != target.owner.ole_node)) return error.SourceBindingMismatch;
        var actual = source;
        actual.control_node = target.owner.geometry.control_node;
        actual.component_node = target.owner.geometry.component_node;
        actual.paragraph_node = target.owner.geometry.paragraph_node;
        if (!std.meta.eql(actual, target.owner.geometry)) return error.SourceBindingMismatch;
        const found = child;
        const node = tree.nodes[found];
        const p = try @import("../body/ole.zig").Properties.parseKnown(node.record.framing.payload);
        if (p.layout != .spec24 or p.attributes != 1 or p.extra.len != 0 or p.bin_data_id != target.owner.ordinal or p.extent_x != target.owner.extent_x or p.extent_y != target.owner.extent_y) return error.SourceBindingMismatch;
        const offset = node.record.framing.offset + node.record.framing.raw.len - node.record.framing.payload.len + 10;
        if (offset > bytes.len or bytes.len - offset < 2) return error.SourceBindingMismatch;
        std.mem.writeInt(u16, bytes[offset..][0..2], ordinal, .little);
    }
    return bytes;
}
pub fn prepare(a: std.mem.Allocator, decoded: []const []u8, sections: []const model.Section, offsets: []const []usize, version: @import("../version.zig").Version, targets: []const Target, ordinal: u16) !Prepared {
    var output: std.ArrayList(Section) = .empty;
    errdefer {
        for (output.items) |*s| s.value.deinit(a);
        output.deinit(a);
    }
    for (targets, 0..) |target, ti| {
        var prior = false;
        for (targets[0..ti]) |p| if (p.section == target.section) {
            prior = true;
            break;
        };
        if (prior) continue;
        if (target.section >= sections.len or decoded.len != sections.len or offsets.len != sections.len) return error.SourceBindingMismatch;
        const raw = try patch(a, decoded[target.section], version, targets, target.section, ordinal, false);
        var owned_raw = true;
        defer if (owned_raw) a.free(raw);
        const styles = try a.dupe(usize, offsets[target.section]);
        var owned_styles = true;
        defer if (owned_styles) a.free(styles);
        var value = try @import("../../model/clone.zig").section(a, sections[target.section]);
        const original = if (value.rebased_source) |basis| basis.original_record_count else value.source_record_count;
        if (value.rebased_source) |*basis| basis.deinit(a);
        value.rebased_source = .{ .bytes = raw, .style_offsets = styles, .original_record_count = original };
        owned_raw = false;
        owned_styles = false;
        output.append(a, .{ .index = target.section, .value = value }) catch |err| {
            value.deinit(a);
            return err;
        };
    }
    return .{ .sections = try output.toOwnedSlice(a) };
}
