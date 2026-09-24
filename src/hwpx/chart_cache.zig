const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const chart_namespace = @import("chart_namespace.zig");
const xstring = @import("xstring.zig");

pub const Options = struct {
    max_data_containers: usize = 100_000,
    max_levels: usize = 100_000,
    max_points: usize = 1_000_000,
    max_attribute_bytes: usize = 4096,
    max_value_bytes: usize = 1024 * 1024,
    max_total_value_bytes: usize = 64 * 1024 * 1024,
};

pub const Report = struct {
    numeric_caches: usize = 0,
    string_caches: usize = 0,
    numeric_literals: usize = 0,
    string_literals: usize = 0,
    multilevel_string_caches: usize = 0,
    levels: usize = 0,
    empty_multilevel_caches: usize = 0,
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
    value_text_bytes: usize = 0,
    empty_values: usize = 0,
    max_observed_value_bytes: usize = 0,
    xstring_escape_sequences: usize = 0,
    xstring_decoded_values: usize = 0,
    xstring_decoded_bytes: usize = 0,
    unsupported_xstring_surrogates: usize = 0,

    pub fn caches(self: Report) usize {
        return self.numeric_caches + self.string_caches + self.multilevel_string_caches;
    }

    pub fn containers(self: Report) usize {
        return self.caches() + self.numeric_literals + self.string_literals;
    }

    pub fn issues(self: Report) usize {
        return self.missing_point_count + self.duplicate_point_count + self.point_count_disagreement +
            self.duplicate_point_index + self.out_of_range_point_index + self.missing_value_element + self.duplicate_value_element + self.nested_value_element + self.unsupported_xstring_surrogates;
    }
};

const Cache = struct {
    depth: usize,
    multilevel: bool = false,
    declared: ?u32 = null,
    point_count_elements: usize = 0,
    points: usize = 0,
    levels: usize = 0,
    level_depth: ?usize = null,
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
    value_bytes: usize = 0,
    value_text: std.ArrayList(u8) = .empty,

    fn finishValue(self: *Scanner) !void {
        if (self.value_bytes == 0) self.report.empty_values += 1;
        self.report.max_observed_value_bytes = @max(self.report.max_observed_value_bytes, self.value_bytes);
        var decoded = try xstring.decode(self.allocator, self.value_text.items, self.options.max_value_bytes);
        defer decoded.deinit(self.allocator);
        self.report.xstring_escape_sequences += decoded.escapes;
        self.report.unsupported_xstring_surrogates += decoded.unsupported_surrogates;
        if (decoded.text) |value| {
            self.report.xstring_decoded_values += 1;
            self.report.xstring_decoded_bytes += value.len;
        }
        self.value_text.clearRetainingCapacity();
        self.value_depth = null;
        self.value_bytes = 0;
    }

    pub fn onContent(self: *Scanner, value: xml.text_content.View, depth: usize) !void {
        if (self.value_depth != depth) return;
        const remaining_leaf = self.options.max_value_bytes - self.value_bytes;
        const remaining_total = self.options.max_total_value_bytes - self.report.value_text_bytes;
        const bytes = try value.toUtf8(self.allocator, @min(remaining_leaf, remaining_total));
        defer self.allocator.free(bytes);
        try self.value_text.appendSlice(self.allocator, bytes);
        self.value_bytes += bytes.len;
        self.report.value_text_bytes += bytes.len;
    }

    pub fn deinit(self: *Scanner) void {
        if (self.current) |*cache| cache.seen.deinit(self.allocator);
        self.value_text.deinit(self.allocator);
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

    fn finishLevel(self: *Scanner) void {
        const cache = &self.current.?;
        if (cache.declared) |declared| {
            if (cache.points != declared) self.report.point_count_disagreement += 1;
            var it = cache.seen.keyIterator();
            while (it.next()) |index| if (index.* >= declared) {
                self.report.out_of_range_point_index += 1;
            };
        }
        cache.seen.clearRetainingCapacity();
        cache.points = 0;
        cache.level_depth = null;
    }

    fn finishCache(self: *Scanner) !void {
        var cache = self.current.?;
        defer cache.seen.deinit(self.allocator);
        self.current = null;
        if (cache.point_count_elements == 0) self.report.missing_point_count += 1;
        if (cache.multilevel and cache.levels == 0) self.report.empty_multilevel_caches += 1;
        if (cache.declared) |declared| {
            self.report.declared_points = std.math.add(usize, self.report.declared_points, declared) catch return error.LimitExceeded;
            if (!cache.multilevel) {
                if (cache.points != declared) self.report.point_count_disagreement += 1;
                var it = cache.seen.keyIterator();
                while (it.next()) |index| if (index.* >= declared) {
                    self.report.out_of_range_point_index += 1;
                };
            }
        }
    }

    pub fn onTag(self: *Scanner, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) !void {
        if (tag.kind == .end) {
            if (self.value_depth == depth) try self.finishValue();
            if (self.point_depth == depth) self.finishPoint();
            if (self.current) |cache| {
                if (cache.level_depth == depth) self.finishLevel();
            }
            if (self.current) |cache| {
                if (cache.depth == depth) try self.finishCache();
            }
            return;
        }
        if (self.value_depth) |value_depth| {
            if (depth > value_depth) self.report.nested_value_element += 1;
        }
        const multilevel_cache = try attrs.element(tag, scope, chart_namespace.uri, "multiLvlStrCache");
        const numeric_cache = try attrs.element(tag, scope, chart_namespace.uri, "numCache");
        const string_cache = try attrs.element(tag, scope, chart_namespace.uri, "strCache");
        const numeric_literal = try attrs.element(tag, scope, chart_namespace.uri, "numLit");
        const string_literal = try attrs.element(tag, scope, chart_namespace.uri, "strLit");
        if (numeric_cache or string_cache or numeric_literal or string_literal or multilevel_cache) {
            if (self.current != null) return error.NestedChartCache;
            if (self.report.containers() == self.options.max_data_containers) return error.LimitExceeded;
            if (numeric_cache) self.report.numeric_caches += 1 else if (string_cache) self.report.string_caches += 1 else if (numeric_literal) self.report.numeric_literals += 1 else if (string_literal) self.report.string_literals += 1 else self.report.multilevel_string_caches += 1;
            self.current = .{ .depth = depth, .multilevel = multilevel_cache };
            if (tag.kind == .empty) try self.finishCache();
            return;
        }
        const cache = if (self.current) |*value| value else return;
        if (depth == cache.depth + 1 and try attrs.element(tag, scope, chart_namespace.uri, "ptCount")) {
            if (cache.multilevel and cache.levels != 0) return error.InvalidChartPointCountOrder;
            cache.point_count_elements += 1;
            if (cache.point_count_elements > 1) self.report.duplicate_point_count += 1;
            const declared = try self.numericAttribute(tag, scope, "val", error.InvalidChartPointCount);
            if (cache.declared == null) cache.declared = declared;
            return;
        }
        if (cache.multilevel and depth == cache.depth + 1 and try attrs.element(tag, scope, chart_namespace.uri, "lvl")) {
            if (self.report.levels == self.options.max_levels) return error.LimitExceeded;
            self.report.levels += 1;
            cache.levels += 1;
            cache.level_depth = depth;
            if (tag.kind == .empty) self.finishLevel();
            return;
        }
        const expected_point_depth = if (cache.multilevel) if (cache.level_depth) |level_depth| level_depth + 1 else 0 else cache.depth + 1;
        if (depth == expected_point_depth and try attrs.element(tag, scope, chart_namespace.uri, "pt")) {
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
                self.value_bytes = 0;
                self.value_text.clearRetainingCapacity();
                if (tag.kind == .start) self.value_depth = depth else try self.finishValue();
            }
        }
    }
};
