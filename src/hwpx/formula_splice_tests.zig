const std = @import("std");

test "HWPX formula splice allocation failures preserve current input and cached label" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p><p:run><p:t>2</p:t></p:run></p:p></p:subList></p:tc><p:tc><p:cellAddr rowAddr='0' colAddr='1'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='FORMULA'><p:parameters><p:stringParam name='Command'>=SUM(A1:A1)??%g,;;2</p:stringParam><p:stringParam name='Formula'>=SUM(A1:A1)</p:stringParam><p:stringParam name='ResultFormat'>%g,</p:stringParam><p:stringParam name='LastResult'>2</p:stringParam></p:parameters></p:fieldBegin></p:ctrl><p:t>2</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    const options: @import("text_sites.zig").Options = .{ .materialize_tab_boundaries = true, .branch_policy = .{ .mode = .selected } };
    var base = try @import("text_sites.zig").collect(a, &tree, options);
    defer base.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &base, options);
    defer a.free(locations);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const @import("xml_part_tree.zig").Tree, positions: []const @import("section_text.zig").Location, opts: @import("text_sites.zig").Options) !void {
            var sites = try @import("text_sites.zig").collect(allocator, &input[0], opts);
            defer sites.deinit(allocator);
            const changed = @import("formula_splice.zig").splice(allocator, input, 0, &sites, positions, positions[0].paragraph_ordinal, 0, 1, "100", 4096) catch |err| {
                try std.testing.expectEqualStrings("2", sites.items[0].text);
                try std.testing.expectEqualStrings("2", sites.items[1].text);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqualStrings("100", sites.items[0].text);
            try std.testing.expectEqualStrings("2", sites.items[1].text);
            _ = @import("formula_splice.zig").splice(allocator, input, 0, &sites, positions, positions[0].paragraph_ordinal, 0, 3, "bad", 4096) catch |err| {
                try std.testing.expectEqualStrings("100", sites.items[0].text);
                try std.testing.expectEqualStrings("2", sites.items[1].text);
                if (err == error.InvalidFormulaNumber) return;
                return err;
            };
            return error.InvalidInputAccepted;
        }
    }.run, .{ &trees, locations, options });
}
