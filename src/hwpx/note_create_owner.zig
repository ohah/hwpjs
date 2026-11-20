//! Native-created placement observation. Binding strings alone grant no authority.
const std = @import("std");
const editor = @import("editor_session.zig");
const placement = @import("inline_object_placement.zig");
pub const Lease = struct { session: usize, source: usize, serial: u64, revision: u32 };
pub const Observation = struct {
    placement: placement.Observation,
    selector: placement.Selector,
    lease: Lease,
    unit: u32,
    session_text: []u8,
    serial_text: []u8,
    identity: ?[]u8,
    pub fn deinit(self: *Observation, a: std.mem.Allocator) void {
        self.placement.deinit(a);
        a.free(self.session_text);
        a.free(self.serial_text);
        if (self.identity) |value| a.free(value);
        self.* = undefined;
    }
    pub fn target(self: *const Observation) @import("inline_object_insert.zig").Target {
        return .{ .section = self.selector.section, .paragraph = self.selector.paragraph orelse 0, .owner = self.placement.owner, .unit = self.unit, .expected_text = self.placement.text };
    }
};
pub fn observe(session: *const editor.Session, selector: placement.Selector, unit: u32, revision: u32) !Observation {
    const a = session.allocator;
    const session_text = try std.fmt.allocPrint(a, "{d}", .{@intFromPtr(session)});
    errdefer a.free(session_text);
    const serial_text = try std.fmt.allocPrint(a, "{d}", .{session.mutation_serial});
    errdefer a.free(serial_text);
    const identity = if (selector.created_cell) |cell| try a.dupe(u8, cell.identity) else null;
    errdefer if (identity) |value| a.free(value);
    var owned_selector = selector;
    if (owned_selector.created_cell) |*cell| cell.identity = identity.?;
    var current = try placement.current(session, owned_selector, .{ .session = session_text, .serial = serial_text, .revision = revision });
    errdefer current.deinit(a);
    _ = try @import("../image/image_insertion.zig").byteOffset(current.text, unit);
    return .{ .placement = current, .selector = owned_selector, .lease = .{ .session = @intFromPtr(session), .source = @intFromPtr(session.source.ptr), .serial = session.mutation_serial, .revision = revision }, .unit = unit, .session_text = session_text, .serial_text = serial_text, .identity = identity };
}
pub fn validate(session: *const editor.Session, lease: Lease, target: @import("inline_object_insert.zig").Target, revision: u32) !void {
    if (lease.session != @intFromPtr(session) or lease.source != @intFromPtr(session.source.ptr) or lease.serial != session.mutation_serial or lease.revision != revision) return error.StaleNoteCreateOwner;
    if (target.physical_paragraph != null or target.anchor_insertion) return error.InvalidNoteCreateOwner;
    const owner = target.owner orelse return error.InvalidNoteCreateOwner;
    const decimal = @import("../model/formatting_binding.zig").decimal;
    if (try decimal(owner.binding.session) != lease.session or try decimal(owner.binding.serial) != lease.serial or owner.binding.revision != revision) return error.StaleNoteCreateOwner;
    try placement.checkCurrent(session, target.section, target.paragraph, owner, target.expected_text);
    _ = try @import("../image/image_insertion.zig").byteOffset(target.expected_text, target.unit);
}
