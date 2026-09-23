const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const chart_namespace = @import("chart_namespace.zig");

pub const Options = struct {
    max_data_containers: usize = 100_000,
    max_points: usize = 1_000_000,
    max_attribute_bytes: usize = 4096,
};

pub const Report = struct {
    numeric_caches: usize = 0,
    string_caches: usize = 0,
    numeric_literals: usize = 0,
    string_literals: usize = 0,
    unsupported_multilevel_string_caches: usize = 0,
    points: usize = 0,
    declared_points: usize = 0,
    missing_point_count: usize = 0,
    duplicate_point_count: usize = 0,
    point_count_disagreement: usize = 0,
    duplicate_point_index: usize = 0,
    out_of_range_point_index: usize = 0,
    missing_value_element: usize = 0,
    duplicate_value_element: usize = 0,
    nested_value_element: usize = 0,

    pub fn caches(self: Report) usize {
        return self.numeric_caches + self.string_caches;
    }

    pub fn containers(self: Report) usize {
        return self.caches() + self.numeric_literals + self.string_literals + self.unsupported_multilevel_string_caches;
    }

    pub fn issues(self: Report) usize {
        return self.unsupported_multilevel_string_caches + self.missing_point_count + self.duplicate_point_count + self.point_count_disagreement +
            self.duplicate_point_index + self.out_of_range_point_index + self.missing_value_element + self.duplicate_value_element + self.nested_value_element;
    }
};

const Cache = struct {
    depth: usize,
    declared: ?u32 = null,
    point_count_elements: usize = 0,
    points: usize = 0,
    seen: std.AutoHashMapUnmanaged(u32, void) = .empty,
};

pub const Scanner = struct {
    allocator: std.mem.Allocator,
    options: Options,
    report: *Report,
    current: ?Cache = null,
    point_depth: ?usize = null,
    point_values: usize = 0,
    value_depth: ?usize = null,
    unsupported_depth: ?usize = null,

    pub fn deinit(self: *Scanner) void {
        if (self.current) |*cache| cache.seen.deinit(self.allocator);
        self.* = undefined;
    }

    fn numericAttribute(self: *Scanner, tag: xml.tags.Tag, scope: *const xml.namespaces.State, name: []const u8, err: anyerror) !u32 {
        const raw = (try attrs.attribute(self.allocator, tag, scope, name, self.options.max_attribute_bytes)) orelse return err;
        defer self.allocator.free(raw);
        const normalized = std.mem.trim(u8, raw, " \t\r\n");
        if (normalized.len == 0) return err;
        return std.fmt.parseInt(u32, normalized, 10) catch return err;
    }

    fn finishPoint(self: *Scanner) void {
        if (self.point_values == 0) self.report.missing_value_element += 1;
        if (self.point_values > 1) self.report.duplicate_value_element += 1;
        self.point_depth = null;
        self.point_values = 0;
    }

    fn finishCache(self: *Scanner) !void {
        var cache = self.current.?;
        defer cache.seen.deinit(self.allocator);
        self.current = null;
        if (cache.point_count_elements == 0) self.report.missing_point_count += 1;
        if (cache.declared) |declared| {
            self.report.declared_points = std.math.add(usize, self.report.declared_points, declared) catch return error.LimitExceeded;
            if (cache.points != declared) self.report.point_count_disagreement += 1;
            var it = cache.seen.keyIterator();
            while (it.next()) |index| if (index.* >= declared) {
                self.report.out_of_range_point_index += 1;
            };
        }
    }

    pub fn onTag(self: *Scanner, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) !void {
        if (self.unsupported_depth) |unsupported_depth| {
            if (tag.kind == .end and depth == unsupported_depth) self.unsupported_depth = null;
            return;
        }
        if (tag.kind == .end) {
            if (self.value_depth == depth) self.value_depth = null;
            if (self.point_depth == depth) self.finishPoint();
            if (self.current) |cache| {
                if (cache.depth == depth) try self.finishCache();
            }
            return;
        }
        if (self.value_depth) |value_depth| {
            if (depth > value_depth) self.report.nested_value_element += 1;
        }
        if (try attrs.element(tag, scope, chart_namespace.uri, "multiLvlStrCache")) {
            if (self.report.containers() == self.options.max_data_containers) return error.LimitExceeded;
            self.report.unsupported_multilevel_string_caches += 1;
            if (tag.kind == .start) self.unsupported_depth = depth;
            return;
        }
        const numeric_cache = try attrs.element(tag, scope, chart_namespace.uri, "numCache");
        const string_cache = try attrs.element(tag, scope, chart_namespace.uri, "strCache");
        const numeric_literal = try attrs.element(tag, scope, chart_namespace.uri, "numLit");
        const string_literal = try attrs.element(tag, scope, chart_namespace.uri, "strLit");
        if (numeric_cache or string_cache or numeric_literal or string_literal) {
            if (self.current != null) return error.NestedChartCache;
            if (self.report.containers() == self.options.max_data_containers) return error.LimitExceeded;
            if (numeric_cache) self.report.numeric_caches += 1 else if (string_cache) self.report.string_caches += 1 else if (numeric_literal) self.report.numeric_literals += 1 else self.report.string_literals += 1;
            self.current = .{ .depth = depth };
            if (tag.kind == .empty) try self.finishCache();
            return;
        }
        const cache = if (self.current) |*value| value else return;
        if (depth == cache.depth + 1 and try attrs.element(tag, scope, chart_namespace.uri, "ptCount")) {
            cache.point_count_elements += 1;
            if (cache.point_count_elements > 1) self.report.duplicate_point_count += 1;
            const declared = try self.numericAttribute(tag, scope, "val", error.InvalidChartPointCount);
            if (cache.declared == null) cache.declared = declared;
            return;
        }
        if (depth == cache.depth + 1 and try attrs.element(tag, scope, chart_namespace.uri, "pt")) {
            if (self.report.points == self.options.max_points) return error.LimitExceeded;
            const index = try self.numericAttribute(tag, scope, "idx", error.InvalidChartPointIndex);
            self.report.points += 1;
            cache.points += 1;
            if ((try cache.seen.getOrPut(self.allocator, index)).found_existing) self.report.duplicate_point_index += 1;
            self.point_depth = depth;
            self.point_values = 0;
            if (tag.kind == .empty) self.finishPoint();
            return;
        }
        if (self.point_depth) |point_depth| {
            if (depth == point_depth + 1 and try attrs.element(tag, scope, chart_namespace.uri, "v")) {
                self.point_values += 1;
                if (tag.kind == .start) self.value_depth = depth;
            }
        }
    }
};
