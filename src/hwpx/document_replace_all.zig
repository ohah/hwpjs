//! Literal whole-document intent through the existing managed History owner.
//! Public callers submit query/replacement, never a selected owner subset.
const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("../model/document_replace_all.zig");
const lifetime = @import("../model/formatting_binding.zig");
pub const Intent = struct {
    owner: *editor.Session,
    source: [*]u8,
    sections: [*]editor.Section,
    serial: u64,
    lifetime: lifetime.State,
    request: model.Request,
};
pub const Service = struct {
    session: *editor.Session,
    history: *@import("editor_history.zig").History,
    lifetime: *lifetime.State,
    pub fn apply(self: Service, a: std.mem.Allocator, request: model.Request) !bool {
        const existing: @import("text_transaction.zig").Service = .{ .session = self.session, .history = self.history, .lifetime = self.lifetime };
        const revision = try existing.currentRevision();
        try self.lifetime.check(request.binding, revision);
        const changed = try preflight(self.session, a, self.lifetime.*, revision, request);
        // Retire every dry-run candidate before the real History admission.
        try self.lifetime.check(request.binding, try existing.currentRevision());
        if (!changed) return false;
        const intent: Intent = .{ .owner = self.session, .source = self.session.source.ptr, .sections = self.session.sections.ptr, .serial = self.session.mutation_serial, .lifetime = self.lifetime.*, .request = request };
        return self.history.apply(self.session, .{ .kind = .document_text, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .document_text_intent = &intent });
    }
};
fn preflight(session: *editor.Session, a: std.mem.Allocator, state: lifetime.State, revision: u32, request: model.Request) !bool {
    var observation = try @import("document_text_snapshot.zig").observe(a, session, state, revision);
    defer observation.deinit();
    var plan = try model.prepare(a, &observation.snapshot, request);
    defer plan.deinit();
    if (plan.groups.len == 0) return false;
    var prepared = try @import("document_text_session.zig").prepare(session, &observation, &plan);
    defer prepared.deinit();
    return prepared.changed;
}

/// Called synchronously by the already admitted owned History transaction.
/// Recompute current observation and every target; no retained dry-run model is
/// promoted into live state and no client can omit a protected match.
pub fn applyWithinHistory(session: *editor.Session, intent: *const Intent) !bool {
    if (!session.history_delta_managed or !session.history_transaction_active) return error.HistoryProtocolRequired;
    if (session != intent.owner or session.source.ptr != intent.source or session.sections.ptr != intent.sections or
        session.mutation_serial != intent.serial) return error.StaleDocumentTextSnapshot;
    const revision = intent.request.binding.revision orelse return error.InvalidTextTransactionBinding;
    try intent.lifetime.check(intent.request.binding, revision);
    var observation = try @import("document_text_snapshot.zig").observe(session.allocator, session, intent.lifetime, revision);
    defer observation.deinit();
    var plan = try model.prepare(session.allocator, &observation.snapshot, intent.request);
    defer plan.deinit();
    if (plan.groups.len == 0) return false;
    var prepared = try @import("document_text_session.zig").prepare(session, &observation, &plan);
    defer prepared.deinit();
    return prepared.commit();
}
