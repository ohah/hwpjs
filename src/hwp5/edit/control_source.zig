//! Retained anchors reuse existing wire identity and header pairing validation.
const std = @import("std");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const Original = struct { bytes: []const u8, version: @import("../version.zig").Version };

pub fn validate(a: std.mem.Allocator, tree: Tree) !void {
    return validateInternal(a, tree, null);
}

pub fn validateWithSource(a: std.mem.Allocator, tree: Tree, source: []const u8, version: @import("../version.zig").Version) !void {
    return validateInternal(a, tree, .{ .bytes = source, .version = version });
}

fn validateInternal(a: std.mem.Allocator, tree: Tree, original: ?Original) !void {
    for (tree.nodes) |*node| {
        if (node.record.framing.tag == @intFromEnum(body.Tag.control_header))
            node.record.value = .{ .control_header = try body.ControlHeader.parse(node.record.framing.payload) };
    }
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    const report = try @import("../body/control_type_validation.zig").inspect(links.items);
    if (report.deferred != 0) {
        const input = original orelse return error.UnsupportedSectionControl;
        var forms = try @import("form_source_retention.zig").collect(a, input.bytes, input.version);
        defer forms.deinit(a);
        const rules = @import("../body/control_rules.zig");
        for (links.items) |link| {
            if (rules.classifyCode(link.id, link.code) != .unknown) continue;
            if (link.id != rules.form_id or link.header_id != rules.form_id or link.code != @import("../body/form_links.zig").observed_code) return error.UnsupportedSectionControl;
            const record = tree.nodes[link.control_node].record.framing;
            if (!forms.allows(record.offset, record.payload)) return error.SourceBindingMismatch;
        }
    }
    for (links.items) |link| {
        if (link.code == 3) _ = try @import("../body/field_start.zig").Properties.parse(tree.nodes[link.control_node].record.value.control_header.properties);
    }
}
