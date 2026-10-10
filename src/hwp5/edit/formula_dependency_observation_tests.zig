//! Reference-only dependency observation; never uses cached values as inputs.
const std = @import("std");
const Probe = struct {
    section: @import("../../model/document.zig").Section,
    index: *usize,
    pub fn read(self: @This(), tree: @import("../body/tree.zig").Tree, group: @import("../body/list_groups.zig").Group) !f64 {
        const node = try @import("../body/formula_values.zig").paragraphNode(tree, group);
        for (self.section.paragraphs) |p| {
            if (@as(usize, p.source_node orelse continue) != node) continue;
            const bytes = try @import("plain_text_content.zig").textBytes(std.testing.allocator, p);
            defer std.testing.allocator.free(bytes);
            const nodes = [_]usize{ 407, 423, 439, 455, 471, 490 };
            const values = [_]f64{ 43200, 24000, 19200, 19200, 19200, 6400 };
            try std.testing.expect(self.index.* < nodes.len);
            try std.testing.expectEqual(nodes[self.index.*], node);
            const value = try @import("../body/formula_values.zig").numberFromText(bytes, p.declared_units);
            try std.testing.expectEqual(values[self.index.*], value);
            self.index.* += 1;
            return value;
        }
        return error.SourceBindingMismatch;
    }
};

test "reference mixed formula dependency observation" {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/task1768/distribution_doc.hwpx", a, .limited(16_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    var tree = try @import("../body/tree.zig").Tree.parse(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    for (tree.nodes) |node| {
        if (node.record.value != .control_header or node.record.value.control_header.id != @import("../body/control_rules.zig").id("%fmu")) continue;
        const properties = try @import("../body/field_start.zig").Properties.parse(node.record.value.control_header.properties);
        const owner = try @import("../body/formula_cell.zig").locate(tree, groups, node.parent.?, .observed8);
        var index: usize = 0;
        const result = try @import("../body/formula_values.zig").evaluateWith(tree, groups, owner, try (try properties.formulaView()).range(), .observed8, .{}, Probe{ .section = doc.sections[0], .index = &index });
        try std.testing.expectEqual(@as(usize, 6), result.cells);
        try std.testing.expectEqual(@as(usize, 6), index);
        try std.testing.expectEqual(@as(f64, 131200), result.value);
    }
}
