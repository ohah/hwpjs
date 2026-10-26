const std = @import("std");
test "actual chart pair resolves exact OPF identity and retains owned source binding under OOM" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx", a, .limited(4000000));
    defer a.free(input);
    var document = try @import("package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var wrapper: ?usize = null;
    for (tree.elements, 0..) |_, index| if (@import("run_switch_anchor.zig").supported(&tree, index)) {
        try std.testing.expect(wrapper == null);
        wrapper = index;
    };
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, doc: *const @import("package.zig").Document, section: *const @import("xml_part_tree.zig").Tree, node: usize) !void {
            var pair = try @import("chart_pair_target.zig").resolve(allocator, doc, section, node);
            defer pair.deinit(allocator);
            try std.testing.expectEqualStrings("Chart/chart1.xml", pair.chart_path);
            try std.testing.expectEqualStrings("BinData/ole1.ole", pair.ole_path);
            try std.testing.expect(pair.declared_external);
            try pair.validateSource(section);
        }
    }.run, .{ &document, &tree, wrapper.? });
    var pair = try @import("chart_pair_target.zig").resolve(a, &document, &tree, wrapper.?);
    defer pair.deinit(a);
    tree.source[0] = 'X';
    try std.testing.expectError(error.SourceBindingMismatch, pair.validateSource(&tree));
    try std.testing.expectError(error.SourceBindingMismatch, @import("chart_pair_target.zig").resolve(a, &document, &tree, wrapper.?));
}
