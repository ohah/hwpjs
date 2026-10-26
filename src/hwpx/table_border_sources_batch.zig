//! Request-local source projection. No current model, cache, or Session mutation.
const std = @import("std");
const single = @import("table_border_sources.zig");
const package = @import("package.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Session = @import("editor_session.zig").Session;

pub const Result = union(enum) {
    value: single.Report,
    unavailable: anyerror,
};
pub const Entry = struct { section: usize, result: Result };
pub const Report = struct {
    entries: []Entry,
    /// Use the same caller allocator passed to read. Each value owns independent
    /// cells/styles (including duplicate requests); no tree/session is borrowed.
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.entries) |*entry| switch (entry.result) {
            .value => |*value| value.deinit(a),
            .unavailable => {},
        };
        a.free(self.entries);
        self.* = undefined;
    }
};

/// Preserves request order, multiplicity, section-local style indices, and the
/// single-read error precedence (range before package/header before cells).
/// Package/header errors are shared unavailable results for valid indices.
/// OutOfMemory always aborts the request and frees all completed projections.
/// Other errors, including the single-read LimitExceeded, remain per section.
/// Empty/all-invalid requests never inspect the source. Otherwise inspection
/// and header parsing occur once, even when that shared operation fails.
pub fn read(a: std.mem.Allocator, session: *const Session, sections: []const usize) !Report {
    const entries = try a.alloc(Entry, sections.len);
    var report: Report = .{ .entries = entries[0..0] };
    errdefer {
        for (report.entries) |*entry| switch (entry.result) {
            .value => |*value| value.deinit(a),
            .unavailable => {},
        };
        a.free(entries);
    }
    var header: ?Tree = null;
    defer if (header) |*tree| tree.deinit(a);
    var attempted = false;
    var shared_error: ?anyerror = null;
    var profile_attempted = false;
    var selected_profile: @import("source_color_profile.zig").Profile = .{};
    var profile_error: ?anyerror = null;
    for (sections, 0..) |section, index| {
        const result: Result = blk: {
            if (section >= session.sections.len) break :blk .{ .unavailable = error.InvalidSectionIndex };
            if (!attempted) {
                attempted = true;
                header = readHeader(a, session.source) catch |err| failed: {
                    if (err == error.OutOfMemory) return err;
                    shared_error = err;
                    break :failed null;
                };
            }
            if (shared_error) |err| break :blk .{ .unavailable = err };
            var value = single.readTrees(a, &session.sections[section].tree, &header.?) catch |err| {
                if (err == error.OutOfMemory) return err;
                break :blk .{ .unavailable = err };
            };
            var owns_value = true;
            defer if (owns_value) value.deinit(a);
            if (!profile_attempted) {
                profile_attempted = true;
                selected_profile = @import("document_provenance.zig").profile(session) catch |err| failed: {
                    if (err == error.OutOfMemory) return err;
                    profile_error = err;
                    break :failed .{};
                };
            }
            if (profile_error) |err| break :blk .{ .unavailable = err };
            @import("source_color_projection.zig").enrichReport(&value, selected_profile) catch |err| {
                if (err == error.OutOfMemory) return err;
                break :blk .{ .unavailable = err };
            };
            owns_value = false;
            break :blk .{ .value = value };
        };
        entries[index] = .{ .section = section, .result = result };
        report.entries = entries[0 .. index + 1];
    }
    return report;
}

fn readHeader(a: std.mem.Allocator, source: []const u8) !Tree {
    var document = try package.inspectDocument(a, source, .{});
    defer document.deinit(a);
    return document.readHeaderTree(a, .{});
}
