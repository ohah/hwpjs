const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");

pub const chart_uri = "http://schemas.openxmlformats.org/drawingml/2006/chart";
pub const ProblemKind = enum { invalid_path, missing_entry };

pub const Options = struct {
    max_chart_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_chart_xml_bytes: usize = 128 * 1024 * 1024,
    max_chart_parts: usize = 100_000,
    xml: document_xml.Options = .{},
};

pub const Report = struct {
    sections: usize = 0,
    section_xml_bytes: usize = 0,
    chart_xml_bytes: usize = 0,
    chart_parts: usize = 0,
    observed_sites: usize = 0,
    chart_sites: usize = 0,
    absent: usize = 0,
    empty: usize = 0,
    invalid_path: usize = 0,
    missing_entry: usize = 0,
    resolved: usize = 0,
    unclassified_attribute_sites: usize = 0,
    first_problem_ref: ?[]u8 = null,
    first_problem_kind: ?ProblemKind = null,
    first_problem_item_index: ?usize = null,
    first_unclassified_ref: ?[]u8 = null,
    first_unclassified_item_index: ?usize = null,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        if (self.first_problem_ref) |value| a.free(value);
        if (self.first_unclassified_ref) |value| a.free(value);
        self.* = undefined;
    }
};

const Root = struct {
    fn onTag(_: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        if (tag.kind == .end or depth != 1) return;
        if (!try attrs.element(tag, scope, chart_uri, "chartSpace")) return error.InvalidChartRoot;
    }
};

pub const Resolver = struct {
    allocator: std.mem.Allocator,
    archive: zip.Archive,
    options: Options,
    report: *Report,
    remaining: usize,
    by_path: std.StringHashMapUnmanaged(usize) = .empty,
    checked: std.StringHashMapUnmanaged(void) = .empty,

    pub fn init(a: std.mem.Allocator, archive: zip.Archive, report: *Report, options: Options) !Resolver {
        var self: Resolver = .{ .allocator = a, .archive = archive, .options = options, .report = report, .remaining = options.max_total_chart_xml_bytes };
        errdefer self.deinit();
        for (archive.entries, 0..) |entry, index| try self.by_path.put(a, entry.name, index);
        return self;
    }

    pub fn deinit(self: *Resolver) void {
        self.by_path.deinit(self.allocator);
        self.checked.deinit(self.allocator);
        self.* = undefined;
    }

    fn rememberProblem(self: *Resolver, value: []const u8, source_item_index: usize, kind: ProblemKind) !void {
        if (self.report.first_problem_ref == null) {
            self.report.first_problem_ref = try self.allocator.dupe(u8, value);
            self.report.first_problem_kind = kind;
            self.report.first_problem_item_index = source_item_index;
        }
    }

    pub fn noteUnclassified(self: *Resolver, source_item_index: usize, raw_ref: []u8) !void {
        defer self.allocator.free(raw_ref);
        self.report.unclassified_attribute_sites += 1;
        if (self.report.first_unclassified_ref == null) {
            self.report.first_unclassified_ref = try self.allocator.dupe(u8, raw_ref);
            self.report.first_unclassified_item_index = source_item_index;
        }
    }

    /// Consumes an XML-normalized chartIDRef. Unlike binaryItemIDRef, this is
    /// an exact ZIP member path, not an OPF manifest item ID.
    pub fn note(self: *Resolver, source_item_index: usize, raw_ref: ?[]u8) !void {
        defer if (raw_ref) |value| self.allocator.free(value);
        self.report.chart_sites += 1;
        const value = raw_ref orelse {
            self.report.absent += 1;
            return;
        };
        if (value.len == 0) {
            self.report.empty += 1;
            return;
        }
        if (!zip.validPath(value)) {
            self.report.invalid_path += 1;
            try self.rememberProblem(value, source_item_index, .invalid_path);
            return;
        }
        const entry_index = self.by_path.get(value) orelse {
            self.report.missing_entry += 1;
            try self.rememberProblem(value, source_item_index, .missing_entry);
            return;
        };
        const entry = self.archive.entries[entry_index];
        if (!self.checked.contains(entry.name)) {
            if (self.report.chart_parts == self.options.max_chart_parts) return error.LimitExceeded;
            const bytes = try self.archive.decode(entry, @min(self.options.max_chart_xml_bytes, self.remaining));
            defer self.archive.allocator.free(bytes);
            var root: Root = .{};
            _ = try document_xml.visitBytes(self.allocator, bytes, bytes.len, self.options.xml, .{ .context = &root, .on_tag = Root.onTag });
            try self.checked.put(self.allocator, entry.name, {});
            self.remaining -= bytes.len;
            self.report.chart_parts += 1;
            self.report.chart_xml_bytes += bytes.len;
        }
        self.report.resolved += 1;
    }
};
