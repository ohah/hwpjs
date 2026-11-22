//! Portable Native handler called by the optional WASM exports and focused Native probes.
const std = @import("std");
const crop = @import("../hwpx/picture_crop_edit.zig");
const wire = @import("hwpx_picture_crop_edit_wire.zig");
const Session = @import("../hwpx/editor_session.zig").Session;
const History = @import("../hwpx/editor_history.zig").History;
const Generation = @import("../model/document_text_read_generation.zig").State;
pub const Frame = struct { instance_epoch: u64, view_epoch: u64, history_revision: u32 };
pub const Lease = struct { id: u64, before: crop.Observation, frame: Frame };
pub const Store = struct {
    serial: u64 = 0,
    retained: ?Lease = null,
    pub fn clear(self: *Store, a: std.mem.Allocator) void {
        if (self.retained) |*lease| lease.before.deinit(a);
        self.retained = null;
    }
    pub fn retain(self: *Store, a: std.mem.Allocator, before: crop.Observation, frame: Frame) !u64 {
        self.clear(a);
        const id = std.math.add(u64, self.serial, 1) catch return error.PictureCropLeaseExhausted;
        self.serial = id;
        self.retained = .{ .id = id, .before = before, .frame = frame };
        return id;
    }
    /// Ownership transfers only on an exact key match. An old release cannot cancel a new lease.
    pub fn take(self: *Store, id: u64) !Lease {
        const value = self.retained orelse return error.StalePictureCropLease;
        if (id == 0 or value.id != id) return error.StalePictureCropLease;
        self.retained = null;
        return value;
    }
    pub fn release(self: *Store, a: std.mem.Allocator, id: u64) bool {
        if (self.retained) |lease| if (lease.id == id) {
            self.clear(a);
            return true;
        };
        return false;
    }
};
pub const Context = struct {
    session: *Session,
    history: *History,
    generation: *Generation,
    instance_epoch: u64,
    read_scope_active: bool = false,
    fn frame(self: Context) !Frame {
        if (self.read_scope_active) return error.ReadObservationScopeActive;
        if (self.instance_epoch == 0) return error.EditorNotOpen;
        const managed = self.history.owned orelse return error.HistoryProtocol2Required;
        if (!managed.managed) return error.HistoryProtocol2Required;
        if (managed.poisoned) return error.HistoryMutationUncertain;
        if (!self.history.ownsSession(self.session)) return error.SourceBindingMismatch;
        return .{ .instance_epoch = self.instance_epoch, .view_epoch = try self.generation.current(), .history_revision = self.history.revision() };
    }
};
pub fn capture(a: std.mem.Allocator, store: *Store, context: Context, section: u32, picture: u32) ![]u8 {
    store.clear(a);
    errdefer store.clear(a);
    const frame = try context.frame();
    var observed = try context.history.pictureCrop(context.session, a, section, picture);
    const id = store.retain(a, observed, frame) catch |err| {
        observed.deinit(a);
        return err;
    };
    return wire.capture(a, id, store.retained.?.before);
}
pub fn release(a: std.mem.Allocator, store: *Store, bytes: []const u8) !bool {
    return store.release(a, try wire.release(a, bytes));
}
pub fn commit(a: std.mem.Allocator, store: *Store, context: Context, bytes: []const u8) !bool {
    const id = wire.key(a, bytes) catch |err| {
        store.clear(a);
        return err;
    };
    var lease = try store.take(id);
    defer lease.before.deinit(a);
    // Matching authority is consumed before crop parsing, guards, stale checks or no-op.
    const parsed = try wire.parse(a, bytes);
    defer parsed.deinit();
    if (!std.meta.eql(lease.frame, try context.frame())) return error.StalePictureCropLease;
    const request: crop.Request = .{ .before = lease.before, .value = parsed.value.crop };
    if (!try context.history.validatePictureCrop(context.session, request)) return false;
    // Capture has already bound the History-issued complete ticket. History
    // checks its actual current scope/epoch again even for no-op and before apply.
    const cmd: @import("../hwpx/editor_history.zig").Command = .{ .kind = .picture_crop, .section = lease.before.owner.section, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .picture_crop = &request };
    // Do not advance view generation for a validated identical rectangle.
    try context.generation.enterMutation();
    return @import("../hwpx/display_resource_generation.zig").applyOwned(context.history, context.session, &.{cmd});
}
