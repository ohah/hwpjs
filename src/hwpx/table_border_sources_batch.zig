//! Request-local source projection. No current model, cache, or Session mutation.
const std = @import("std");
const single = @import("table_border_sources.zig");
const package = @import("package.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const background = @import("table_cell_background_save.zig");
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
    var prepared: ?background.CurrentHeader = null;
    defer if (prepared) |plan| {
        a.free(plan.replacement.bytes);
        a.free(plan.ids);
        a.free(plan.offsets);
        a.free(plan.indices);
    };
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
                header = prepareHeader(a, session, &prepared) catch |err| failed: {
                    if (err == error.OutOfMemory) return err;
                    shared_error = err;
                    break :failed null;
                };
            }
            if (shared_error) |err| break :blk .{ .unavailable = err };
            var value = readSection(a, session, section, &header.?, if (prepared) |*plan| plan else null) catch |err| {
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

// The entire batch shares one COW plan/header; only section reference overlays
// are temporary. No session allocator/state is mutated by the request.
fn prepareHeader(a: std.mem.Allocator, session: *const Session, prepared: *?background.CurrentHeader) !Tree {
    if (session.cell_backgrounds.items.len == 0) return readHeader(a, session.source);
    var view = session.*;
    view.allocator = a;
    prepared.* = try background.currentHeader(&view);
    return @import("header_tree.zig").parse(a, prepared.*.?.replacement.bytes, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
}

fn readSection(a: std.mem.Allocator, session: *const Session, index: usize, header: *const Tree, prepared: ?*const background.CurrentHeader) !single.Report {
    const source = &session.sections[index].tree;
    const plan = prepared orelse return single.readTrees(a, source, header);
    const indices = plan.forSection(index);
    if (indices.len == 0) return single.readTrees(a, source, header);
    const changed = try background.section(a, source, source.source, session.cell_backgrounds.items, plan.ids, indices, index, session.options.max_xml_bytes);
    defer a.free(changed);
    var current = try @import("section_tree.zig").parse(a, changed, index, source.item_index, .{});
    defer current.deinit(a);
    return single.readTrees(a, &current, header);
}
