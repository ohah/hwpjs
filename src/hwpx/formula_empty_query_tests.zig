const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const prepare = @import("formula_section_prepare.zig").prepare;

test "HWPX empty formula query ignores unrelated unmatched fields but validates actual formulas" {
    const a = std.testing.allocator;
    inline for (.{ "CLICK_HERE", "HYPERLINK", "FORMULA" }) |kind| {
        const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='" ++ kind ++ "'/></p:ctrl><p:t>unchanged</p:t></p:run></p:p></s:sec>";
        var tree = try tree_mod.parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, source: *const tree_mod.Tree, current: *const @import("text_sites.zig").Sites, formula: bool) !void {
                if (formula) {
                    const result = prepare(allocator, &.{source.*}, 0, current, .{}) catch |err| {
                        if (err == error.InvalidFieldLinks) return;
                        return err;
                    };
                    defer allocator.free(result);
                    return error.ExpectedInvalidFormulaLinks;
                } else {
                    const result = try prepare(allocator, &.{source.*}, 0, current, .{});
                    defer allocator.free(result);
                    try std.testing.expectEqual(@as(usize, 0), result.len);
                }
            }
        }.run, .{ &tree, &sites, std.mem.eql(u8, kind, "FORMULA") });
        try std.testing.expectEqualStrings(xml, tree.source);
        var definitions: @import("formula_definition_values.zig").Values = .{};
        defer definitions.deinit(a);
        const expression = try a.dupe(u8, "=SUM(A1:A1)");
        try definitions.entries.append(a, .{ .begin_element = 0, .formula = expression });
        if (!std.mem.eql(u8, kind, "FORMULA")) try std.testing.expectError(error.InvalidFormulaDefinitionSelection, prepare(a, &.{tree}, 0, &sites, .{ .definitions = &definitions }));
    }
}
