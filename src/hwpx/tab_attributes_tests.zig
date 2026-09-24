const std = @import("std");
const tab_attributes = @import("tab_attributes.zig");
const text_node = @import("text_node.zig");
const section_tree = @import("section_tree.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";

fn inspectXml(a: std.mem.Allocator, source: []const u8, options: text_node.Options) !tab_attributes.Report {
    var tree = try section_tree.parse(a, source, 0, 9, .{});
    defer tree.deinit(a);
    const report = try text_node.inspectSections(a, &.{tree}, options);
    return report.tab;
}

test "HWPX tab attributes retain numeric, XSD names, model names and unknown forms" {
    const source = prefix ++ "<p:p><p:run><p:t>" ++
        "<p:tab width='0' type='4' leader='7'/>" ++
        "<p:tab width='4294967295' type='4294967295' leader='17'/>" ++
        "<p:tab width='4294967296' type='4294967296' leader='4294967296'/>" ++
        "<p:tab type='LEFT' leader='WAVE'/>" ++
        "<p:tab type='BAR' leader='BOGUS' extra='x' f:custom='y' xmlns:f='urn:future'/>" ++
        "</p:t></p:run></p:p>" ++ suffix;
    const report = try inspectXml(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 5), report.tabs);
    try std.testing.expectEqual(@as(usize, 3), report.width_present);
    try std.testing.expectEqual(@as(usize, 1), report.width_zero);
    try std.testing.expectEqual(@as(usize, 1), report.width_over_u32);
    try std.testing.expectEqual(@as(u64, 4294967295), report.width_sum);
    try std.testing.expectEqual(@as(usize, 5), report.type_present);
    try std.testing.expectEqual(@as(usize, 3), report.type_numeric);
    try std.testing.expectEqual(@as(usize, 1), report.type_named);
    try std.testing.expectEqual(@as(usize, 1), report.type_other);
    try std.testing.expectEqual(@as(usize, 1), report.type_over_u32);
    try std.testing.expectEqual(@as(u64, 4294967299), report.type_numeric_sum);
    try std.testing.expectEqual(@as(usize, 1), report.type_above_observed_4);
    try std.testing.expectEqual(@as(usize, 5), report.leader_present);
    try std.testing.expectEqual(@as(usize, 3), report.leader_numeric);
    try std.testing.expectEqual(@as(usize, 1), report.leader_named_extended);
    try std.testing.expectEqual(@as(usize, 1), report.leader_other);
    try std.testing.expectEqual(@as(usize, 1), report.leader_over_u32);
    try std.testing.expectEqual(@as(u64, 24), report.leader_numeric_sum);
    try std.testing.expectEqual(@as(usize, 2), report.extra_attributes);
}

test "HWPX tab attributes distinguish absence, malformed width, limits and scope" {
    const empty = try inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t><p:tab/></p:t></p:run></p:p>" ++ suffix, .{});
    try std.testing.expectEqual(@as(usize, 1), empty.tabs);
    try std.testing.expectEqual(@as(usize, 0), empty.width_present);
    try std.testing.expectEqual(@as(usize, 0), empty.type_present);
    try std.testing.expectEqual(@as(usize, 0), empty.leader_present);
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t><p:tab width='-1'/></p:t></p:run></p:p>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t><p:tab width='1.5'/></p:t></p:run></p:p>" ++ suffix, .{}));
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t><p:tab/></p:t></p:run></p:p>" ++ suffix, .{ .max_tabs = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t><p:tab width='12'/></p:t></p:run></p:p>" ++ suffix, .{ .max_attribute_bytes = 1 }));
    const scoped = try inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t><x:tab xmlns:x='urn:foreign' width='1'/><p:fwSpace><p:tab width='2'/></p:fwSpace><p:tab type='-1' leader='NONE'/></p:t></p:run></p:p>" ++ suffix, .{});
    try std.testing.expectEqual(@as(usize, 1), scoped.tabs);
    try std.testing.expectEqual(@as(usize, 1), scoped.type_other);
    try std.testing.expectEqual(@as(usize, 1), scoped.leader_named_base);
}

test "HWPX tab attributes classify every published named value without numeric mapping" {
    const type_names = [_][]const u8{ "LEFT", "RIGHT", "CENTER", "DECIMAL" };
    for (type_names) |name| {
        const source = try std.fmt.allocPrint(std.testing.allocator, prefix ++ "<p:p><p:run><p:t><p:tab type='{s}'/></p:t></p:run></p:p>" ++ suffix, .{name});
        defer std.testing.allocator.free(source);
        const report = try inspectXml(std.testing.allocator, source, .{});
        try std.testing.expectEqual(@as(usize, 1), report.type_named);
        try std.testing.expectEqual(@as(usize, 0), report.type_numeric);
    }
    const base = [_][]const u8{
        "NONE",        "SOLID",      "DOT",        "DASH",            "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE",
        "DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM",
    };
    const extended = [_][]const u8{ "WAVE", "DOUBLEWAVE", "THICK3D", "THICKREV3D", "3D", "REV3D" };
    for (base) |name| {
        const source = try std.fmt.allocPrint(std.testing.allocator, prefix ++ "<p:p><p:run><p:t><p:tab leader='{s}'/></p:t></p:run></p:p>" ++ suffix, .{name});
        defer std.testing.allocator.free(source);
        const report = try inspectXml(std.testing.allocator, source, .{});
        try std.testing.expectEqual(@as(usize, 1), report.leader_named_base);
        try std.testing.expectEqual(@as(usize, 0), report.leader_named_extended);
    }
    for (extended) |name| {
        const source = try std.fmt.allocPrint(std.testing.allocator, prefix ++ "<p:p><p:run><p:t><p:tab leader='{s}'/></p:t></p:run></p:p>" ++ suffix, .{name});
        defer std.testing.allocator.free(source);
        const report = try inspectXml(std.testing.allocator, source, .{});
        try std.testing.expectEqual(@as(usize, 1), report.leader_named_extended);
        try std.testing.expectEqual(@as(usize, 0), report.leader_named_base);
    }
}

test "HWPX tab attributes release allocations after failures" {
    const source = prefix ++ "<p:p><p:run><p:t><p:tab width='123' leader='SOLID' type='DECIMAL' extra='x'/></p:t></p:run></p:p>" ++ suffix;
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            const report = try inspectXml(a, bytes, .{});
            try std.testing.expectEqual(@as(usize, 1), report.tabs);
        }
    }.run, .{source});
}
