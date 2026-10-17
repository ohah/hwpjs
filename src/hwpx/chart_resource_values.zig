//! One current point owner per physical chart/OLE pair. No decoded source cache.
const std = @import("std");
const Points = @import("chart_point_values.zig").Values;
const Pair = @import("chart_pair_target.zig").Pair;
pub const Alias = struct { chart_path: []u8, ole_path: []u8 };
pub const Entry = struct { chart_path: []u8, ole_path: []u8, points: Points, aliases: []Alias = &.{}, series_text: ?@import("chart_series_text_values.zig").Values = null, rich_text: ?@import("chart_rich_text_values.zig").Values = null };

fn freeAliases(a: std.mem.Allocator, aliases: []Alias) void {
    for (aliases) |alias| {
        a.free(alias.chart_path);
        a.free(alias.ole_path);
    }
    a.free(aliases);
}

fn cloneAliases(a: std.mem.Allocator, aliases: []const Alias) ![]Alias {
    const result = try a.alloc(Alias, aliases.len);
    errdefer a.free(result);
    var count: usize = 0;
    errdefer for (result[0..count]) |alias| {
        a.free(alias.chart_path);
        a.free(alias.ole_path);
    };
    for (aliases, result) |alias, *owned| {
        const chart = try a.dupe(u8, alias.chart_path);
        errdefer a.free(chart);
        const ole = try a.dupe(u8, alias.ole_path);
        owned.* = .{ .chart_path = chart, .ole_path = ole };
        count += 1;
    }
    return result;
}
pub const Values = struct {
    entries: std.ArrayList(Entry) = .empty,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.entries.items) |*entry| {
            a.free(entry.chart_path);
            a.free(entry.ole_path);
            entry.points.deinit(a);
            if (entry.series_text) |*text| text.deinit(a);
            if (entry.rich_text) |*text| text.deinit(a);
            freeAliases(a, entry.aliases);
        }
        self.entries.deinit(a);
        self.* = .{};
    }
    pub fn find(self: *Values, chart_path: []const u8, ole_path: []const u8) !?*Entry {
        for (self.entries.items) |*entry| {
            const chart = std.mem.eql(u8, entry.chart_path, chart_path);
            const ole = std.mem.eql(u8, entry.ole_path, ole_path);
            if (chart and ole) return entry;
            for (entry.aliases) |alias| {
                if (std.mem.eql(u8, alias.chart_path, chart_path) and std.mem.eql(u8, alias.ole_path, ole_path)) return entry;
            }
            if (chart or ole) return error.AmbiguousChartPair;
        }
        return null;
    }
    pub fn add(self: *Values, a: std.mem.Allocator, pair: *const Pair, points: *const Points) !*Entry {
        if (try self.find(pair.chart_path, pair.ole_path)) |entry| return entry;
        const chart_path = try a.dupe(u8, pair.chart_path);
        errdefer a.free(chart_path);
        const ole_path = try a.dupe(u8, pair.ole_path);
        errdefer a.free(ole_path);
        var owned = try points.clone(a);
        errdefer owned.deinit(a);
        try self.entries.append(a, .{ .chart_path = chart_path, .ole_path = ole_path, .points = owned });
        return &self.entries.items[self.entries.items.len - 1];
    }
    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        var result: Values = .{};
        errdefer result.deinit(a);
        for (self.entries.items) |entry| {
            const chart_path = try a.dupe(u8, entry.chart_path);
            errdefer a.free(chart_path);
            const ole_path = try a.dupe(u8, entry.ole_path);
            errdefer a.free(ole_path);
            var points = try entry.points.clone(a);
            errdefer points.deinit(a);
            const aliases = try cloneAliases(a, entry.aliases);
            errdefer freeAliases(a, aliases);
            var text = if (entry.series_text) |current| try current.clone(a) else null;
            errdefer if (text) |*current| current.deinit(a);
            var rich = if (entry.rich_text) |current| try current.clone(a) else null;
            errdefer if (rich) |*current| current.deinit(a);
            try result.entries.append(a, .{ .chart_path = chart_path, .ole_path = ole_path, .points = points, .aliases = aliases, .series_text = text, .rich_text = rich });
        }
        return result;
    }
    pub fn byteSize(self: *const Values, limit: usize) !usize {
        var size = std.math.mul(usize, self.entries.capacity, @sizeOf(Entry)) catch return error.LimitExceeded;
        if (size > limit) return error.LimitExceeded;
        for (self.entries.items) |entry| {
            const metadata = std.math.mul(usize, entry.points.points.len, @sizeOf(@import("chart_point_values.zig").Point)) catch return error.LimitExceeded;
            for ([_]usize{ entry.chart_path.len, entry.ole_path.len, metadata }) |bytes| {
                if (bytes > limit - size) return error.LimitExceeded;
                size += bytes;
            }
            for (entry.points.points) |point| {
                if (point.value.len > limit - size) return error.LimitExceeded;
                size += point.value.len;
            }
            const alias_metadata = std.math.mul(usize, entry.aliases.len, @sizeOf(Alias)) catch return error.LimitExceeded;
            if (entry.series_text) |text| {
                const text_metadata = std.math.mul(usize, text.items.len, @sizeOf(@import("chart_series_text_values.zig").Value)) catch return error.LimitExceeded;
                if (text_metadata > limit - size) return error.LimitExceeded;
                size += text_metadata;
                for (text.items) |item| {
                    if (item.text.len > limit - size) return error.LimitExceeded;
                    size += item.text.len;
                }
            }
            if (entry.rich_text) |text| {
                const text_metadata = std.math.mul(usize, text.items.len, @sizeOf(@import("chart_rich_text_values.zig").Value)) catch return error.LimitExceeded;
                if (text_metadata > limit - size) return error.LimitExceeded;
                size += text_metadata;
                for (text.items) |item| {
                    if (item.text.len > limit - size) return error.LimitExceeded;
                    size += item.text.len;
                }
            }
            if (alias_metadata > limit - size) return error.LimitExceeded;
            size += alias_metadata;
            for (entry.aliases) |alias| for ([_]usize{ alias.chart_path.len, alias.ole_path.len }) |bytes| {
                if (bytes > limit - size) return error.LimitExceeded;
                size += bytes;
            };
        }
        return size;
    }

    pub fn bindAliases(a: std.mem.Allocator, entry: *Entry, pairs: []const Pair) !void {
        const borrowed = try a.alloc(Alias, pairs.len);
        defer a.free(borrowed);
        for (pairs, borrowed) |pair, *alias| alias.* = .{ .chart_path = pair.chart_path, .ole_path = pair.ole_path };
        const owned = try cloneAliases(a, borrowed);
        freeAliases(a, entry.aliases);
        entry.aliases = owned;
    }
};
