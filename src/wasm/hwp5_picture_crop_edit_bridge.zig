//! Same portable handler is used by the optional exports and focused Native probes.
const std = @import("std");
const crop = @import("../hwp5/edit/picture_crop.zig");
const wire = @import("hwp5_picture_crop_edit_wire.zig");
const Session = @import("../hwp5/edit/style_preservation.zig").Session;
const History = @import("../hwp5/edit/editor_history.zig").History;
const Generation = @import("../model/document_text_read_generation.zig").State;
const Epoch = @import("editor_view_epoch.zig").Epoch;
pub const Frame = struct { instance: usize, view_epoch: u64, read_generation: u64, history_revision: u32 };
pub const Lease = struct { id: u64, before: crop.Observation, frame: Frame };
pub const Store = struct {
    serial: u64 = 0,
    retained: ?Lease = null,
    pub fn clear(self: *Store) void {
        self.retained = null;
    }
    pub fn retain(self: *Store, before: crop.Observation, frame: Frame) !u64 {
        self.clear();
        const id = std.math.add(u64, self.serial, 1) catch return error.PictureCropLeaseExhausted;
        self.serial = id;
        self.retained = .{ .id = id, .before = before, .frame = frame };
        return id;
    }
    /// Wrong keys never consume the current lease. Matching keys consume before value/epoch checks.
    pub fn take(self: *Store, id: u64) !Lease {
        const lease = self.retained orelse return error.StalePictureCropLease;
        if (id == 0 or lease.id != id) return error.StalePictureCropLease;
        self.clear();
        return lease;
    }
    pub fn release(self: *Store, id: u64) bool {
        if (self.retained) |lease| if (lease.id == id) {
            self.clear();
            return true;
        };
        return false;
    }
};
pub const Context = struct {
    session: ?*Session,
    history: ?*History,
    generation: *Generation,
    view: *Epoch,
    fn frame(self: Context) !Frame {
        const session = self.session orelse return error.EditorNotOpen;
        const history = self.history orelse return error.HistoryNotEnabled;
        const managed = history.owned orelse return error.HistoryProtocol2Required;
        if (!managed.managed) return error.HistoryProtocol2Required;
        if (history.stats().poisoned) return error.HistoryMutationUncertain;
        if (history.owner != session) return error.SourceBindingMismatch;
        if (session.historyTransactionActive()) return error.MutationInProgress;
        _ = try session.historyTicket();
        return .{ .instance = @intFromPtr(session), .view_epoch = try self.view.current(), .read_generation = try self.generation.current(), .history_revision = history.revision() };
    }
};
pub fn version(context: Context) u32 {
    _ = context.frame() catch return 0;
    return wire.version;
}
pub fn capture(a: std.mem.Allocator, store: *Store, context: Context, section: u32, picture: u32) ![]u8 {
    store.clear();
    errdefer store.clear();
    const frame = try context.frame();
    const before = try context.session.?.pictureCrop(.{ .section = section, .picture_node = picture });
    const id = try store.retain(before, frame);
    return wire.capture(a, id, before, frame.history_revision);
}
pub fn release(a: std.mem.Allocator, store: *Store, bytes: []const u8) !bool {
    return store.release(try wire.release(a, bytes));
}
pub fn commit(a: std.mem.Allocator, store: *Store, context: Context, bytes: []const u8) !bool {
    const id = wire.key(a, bytes) catch |err| {
        store.clear();
        return err;
    };
    const lease = try store.take(id);
    const parsed = try wire.parse(a, bytes);
    defer parsed.deinit();
    if (!std.meta.eql(lease.frame, try context.frame())) return error.StalePictureCropLease;
    const request: crop.Request = .{ .before = lease.before, .rect = parsed.value.crop };
    // Complete source/resource/ticket/owner validation even for an identical rectangle.
    if (!try context.session.?.validatePictureCrop(request)) return false;
    const next_view = try context.view.next();
    try context.generation.enterMutation();
    const changed = try context.history.?.apply(context.session.?, .{ .set_picture_crop = request });
    if (changed) context.view.value = next_view;
    return changed;
}
