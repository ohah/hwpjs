//! Current canonical authored profile proof + exact leaf-span edits. No raster defaults.
const std = @import("std");
const common = @import("../../chart/display_values.zig");
const chart = @import("../../hwpx/chart_create_data.zig");
const Tree = @import("../../hwpx/chart_tree.zig").Tree;
const Key = struct { series: usize, category: u32, numeric: bool };
pub const OwnedData = struct {
    data: chart.Data,
    pub fn deinit(self: *OwnedData, a: std.mem.Allocator) void {
        for (self.data.series) |s| a.free(s.values);
        a.free(self.data.series);
        a.free(self.data.categories);
        self.* = undefined;
    }
};
pub const Prepared = struct {
    profile: @import("literal_edit_profile.zig").Profile,
    xml: []u8,
    values: common.Values,
    data: OwnedData,
    changed: bool,
    sha256: [32]u8,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.data.deinit(a);
        self.values.deinit(a);
        a.free(self.xml);
        self.* = undefined;
    }
};
const Index = struct {
    points: std.AutoHashMapUnmanaged(Key, usize) = .empty,
    series_nodes: []const usize,
    categories: usize,
    profile: @import("literal_edit_profile.zig").Profile,
    fn deinit(self: *Index, a: std.mem.Allocator) void {
        self.points.deinit(a);
    }
};
fn index(a: std.mem.Allocator, values: *const common.Values) !Index {
    if (values.plots.plots.len != 1 or values.bindings.len != values.points.points.len or values.rich_text.items.len != 0) return error.UnsupportedChartLiteralEditProfile;
    const series = values.plots.plots[0].series_nodes;
    if (series.len == 0 or series.len > chart.max_series or values.series_text.items.len != series.len) return error.UnsupportedChartLiteralEditProfile;
    const profile: @import("literal_edit_profile.zig").Profile = switch (values.plots.plots[0].kind) {
        .barChart => blk: {
            if (values.plot_settings.len != 1) return error.UnsupportedChartLiteralEditProfile;
            const settings = values.plot_settings[0];
            const direction = settings.direction orelse return error.UnsupportedChartLiteralEditProfile;
            const grouping = settings.grouping orelse return error.UnsupportedChartLiteralEditProfile;
            if (grouping.value != .clustered) return error.UnsupportedChartLiteralEditProfile;
            break :blk switch (direction.value orelse return error.UnsupportedChartLiteralEditProfile) {
                .col => .spec24_clustered_column_literals_v1,
                .bar => .spec24_clustered_horizontal_bar_literals_v1,
            };
        },
        .lineChart => .spec24_standard_line_literals_v1,
        else => return error.UnsupportedChartLiteralEditProfile,
    };
    var out: Index = .{ .series_nodes = series, .categories = 0, .profile = profile };
    errdefer out.deinit(a);
    for (values.bindings) |binding| {
        if (binding.point >= values.points.points.len or binding.plot_node != values.plots.plots[0].node) return error.UnsupportedChartLiteralEditProfile;
        const point = values.points.points[binding.point];
        if (point.level_node != null) return error.UnsupportedChartLiteralEditProfile;
        const numeric = switch (binding.role) {
            .category => false,
            .value => true,
            else => return error.UnsupportedChartLiteralEditProfile,
        };
        if ((numeric and point.kind != .numeric_literal) or (!numeric and point.kind != .string_literal)) return error.UnsupportedChartLiteralEditProfile;
        const source = binding.series_node orelse return error.UnsupportedChartLiteralEditProfile;
        const ordinal = std.mem.indexOfScalar(usize, series, source) orelse return error.UnsupportedChartLiteralEditProfile;
        const entry = try out.points.getOrPut(a, .{ .series = ordinal, .category = point.index, .numeric = numeric });
        if (entry.found_existing) return error.UnsupportedChartLiteralEditProfile;
        entry.value_ptr.* = binding.point;
        if (ordinal == 0 and !numeric) out.categories += 1;
    }
    if (out.categories == 0 or out.categories > chart.max_categories or values.points.points.len != series.len * out.categories * 2) return error.UnsupportedChartLiteralEditProfile;
    return out;
}
fn ownedData(a: std.mem.Allocator, tree: *const Tree, values: *const common.Values, lookup: Index) !OwnedData {
    const cats = try a.alloc([]const u8, lookup.categories);
    errdefer a.free(cats);
    const series = try a.alloc(chart.Series, lookup.series_nodes.len);
    var initialized: usize = 0;
    errdefer {
        for (series[0..initialized]) |s| a.free(s.values);
        a.free(series);
    }
    for (lookup.series_nodes, 0..) |node, si| {
        var name: ?[]const u8 = null;
        for (values.series_text.items) |row| if (row.series_node == node) {
            if (name != null) return error.UnsupportedChartLiteralEditProfile;
            name = row.text;
        };
        const nums = try a.alloc([]const u8, cats.len);
        series[si] = .{ .name = name orelse {
            a.free(nums);
            return error.UnsupportedChartLiteralEditProfile;
        }, .values = nums };
        initialized += 1;
        for (cats, nums, 0..) |*cat, *number, ci| {
            const k: u32 = @intCast(ci);
            const c = lookup.points.get(.{ .series = si, .category = k, .numeric = false }) orelse return error.UnsupportedChartLiteralEditProfile;
            const n = lookup.points.get(.{ .series = si, .category = k, .numeric = true }) orelse return error.UnsupportedChartLiteralEditProfile;
            const text = values.points.points[c].value;
            if (si == 0) cat.* = text else if (!std.mem.eql(u8, cat.*, text)) return error.UnsupportedChartLiteralEditProfile;
            number.* = values.points.points[n].value;
        }
    }
    const data: chart.Data = .{ .categories = cats, .series = series };
    try chart.validate(data);
    const canonical = try @import("create_profile.zig").create(a, data, @import("literal_edit_profile.zig").createProfile(lookup.profile));
    defer a.free(canonical);
    // This rejects unknown styles/schema/streams rather than regenerating them.
    if (!std.mem.eql(u8, canonical, tree.source)) return error.UnsupportedChartLiteralEditProfile;
    return .{ .data = data };
}
pub fn prepare(a: std.mem.Allocator, source: []const u8, expected_sha256: [32]u8, edits: []const @import("literal_edit_request.zig").Edit, limit: usize) !Prepared {
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(source, &digest, .{});
    if (!std.mem.eql(u8, &digest, &expected_sha256)) return error.SourceBindingMismatch;
    var tree = try @import("../../hwpx/chart_tree.zig").parse(a, source, 0, .{ .max_xml_bytes = chart.max_xml_bytes });
    defer tree.deinit(a);
    var values = try common.collectBody(a, &tree, try common.readHeaders(a, &tree), .{});
    defer values.deinit(a);
    var lookup = try index(a, &values);
    defer lookup.deinit(a);
    var before = try ownedData(a, &tree, &values, lookup);
    defer before.deinit(a);
    var expanded: std.ArrayList(@import("../../hwpx/chart_point_write.zig").Edit) = .empty;
    defer expanded.deinit(a);
    var seen: std.AutoHashMapUnmanaged(Key, void) = .empty;
    defer seen.deinit(a);
    for (edits) |edit| {
        const series, const ci, const expected, const value, const numeric = switch (edit) {
            .category => |v| .{ @as(usize, 0), v.category, v.expected, v.value, false },
            .value => |v| .{ @as(usize, v.series), v.category, v.expected, v.value, true },
        };
        if (series >= lookup.series_nodes.len or ci >= lookup.categories) return error.InvalidChartPointIndex;
        if ((try seen.getOrPut(a, .{ .series = series, .category = ci, .numeric = numeric })).found_existing) return error.DuplicateChartPointEdit;
        const end = if (numeric) series + 1 else lookup.series_nodes.len;
        var si = series;
        while (si < end) : (si += 1) {
            const point = lookup.points.get(.{ .series = si, .category = ci, .numeric = numeric }) orelse return error.UnsupportedChartLiteralEditProfile;
            if (!std.mem.eql(u8, values.points.points[point].value, expected)) return error.SourceBindingMismatch;
            try expanded.append(a, .{ .point = point, .value = value });
        }
    }
    const xml = try @import("../../hwpx/chart_point_write.zig").write(a, &tree, &values.points, expanded.items, @min(limit, chart.max_xml_bytes));
    errdefer a.free(xml);
    var after_tree = try @import("../../hwpx/chart_tree.zig").parse(a, xml, 0, .{});
    defer after_tree.deinit(a);
    var after = try common.collectBody(a, &after_tree, try common.readHeaders(a, &after_tree), .{});
    errdefer after.deinit(a);
    var after_lookup = try index(a, &after);
    defer after_lookup.deinit(a);
    if (after_lookup.profile != lookup.profile) return error.UnsupportedChartLiteralEditProfile;
    var data = try ownedData(a, &after_tree, &after, after_lookup);
    errdefer data.deinit(a);
    std.crypto.hash.sha2.Sha256.hash(xml, &digest, .{});
    return .{ .profile = lookup.profile, .xml = xml, .values = after, .data = data, .changed = !std.mem.eql(u8, source, xml), .sha256 = digest };
}
