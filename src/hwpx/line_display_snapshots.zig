//! Optional node-isolated display batch; pending ABI/JS/single integration.
const std = @import("std");
const editor = @import("editor_session.zig");
const current = @import("display_current_paragraphs.zig");
const geometry = @import("line_display_geometry_values.zig");
const stroke = @import("line_stroke_values.zig");

pub const Paint = union(enum) { value: stroke.Values, unavailable: anyerror };
pub const Value = struct { geometry: geometry.Values, paint: Paint };
pub const Result = union(enum) { value: Value, unavailable: anyerror };
pub const Entry = struct { node: usize, result: Result };
pub const Report = struct {
    entries: []Entry,
    /// Only this slice is owned. All geometry/stroke fields are detached values.
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.entries);
        self.* = undefined;
    }
};

/// Preserves request order/duplicates. Geometry refusal is node-local. Paint
/// refusal retains successful geometry without retry or invented default stroke.
/// OOM is request-fatal at every stage; partial results and the view are freed.
/// A shared view refusal becomes unavailable for each requested node, matching
/// single-read precedence (view construction precedes node validation).
/// Invalid sections fail even for empty requests; empty valid requests skip view.
pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, nodes: []const usize) !Report {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const entries = try a.alloc(Entry, nodes.len);
    errdefer a.free(entries);
    if (nodes.len == 0) return .{ .entries = entries };
    const section = &session.sections[section_index];
    var view = current.read(a, section, session.options) catch |err| {
        if (err == error.OutOfMemory) return err;
        for (entries, nodes) |*entry, node| entry.* = .{ .node = node, .result = .{ .unavailable = err } };
        return .{ .entries = entries };
    };
    defer view.deinit(a);
    for (entries, nodes) |*entry, node| {
        const value = geometry.readWithView(a, section, &view, node) catch |err| {
            if (err == error.OutOfMemory) return err;
            entry.* = .{ .node = node, .result = .{ .unavailable = err } };
            continue;
        };
        const paint: Paint = blk: {
            const source = stroke.read(a, &section.tree, node) catch |err| {
                if (err == error.OutOfMemory) return err;
                break :blk .{ .unavailable = err };
            };
            break :blk .{ .value = source };
        };
        entry.* = .{ .node = node, .result = .{ .value = .{ .geometry = value, .paint = paint } } };
    }
    return .{ .entries = entries };
}
