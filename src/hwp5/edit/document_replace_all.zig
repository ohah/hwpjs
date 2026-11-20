//! Full-document literal replacement through ONE existing History command.
//! Native re-derives every match; the client supplies no target subset or grant.
const std = @import("std");
const edit = @import("style_preservation.zig");
pub const Service = struct {
    session: *edit.Session,
    history: *@import("editor_history.zig").History,
    lifetime: *@import("../../model/formatting_binding.zig").State,
    pub fn apply(self: Service, a: std.mem.Allocator, request: @import("../../model/document_replace_all.zig").Request) !bool {
        const existing: @import("text_transaction.zig").Service = .{ .session = self.session, .history = self.history, .lifetime = self.lifetime };
        const revision = try existing.currentRevision();
        try self.lifetime.check(request.binding, revision);
        var snapshot = try self.session.documentTextSnapshot(a, self.lifetime.*, revision);
        defer snapshot.deinit();
        var intent = try @import("../../model/document_replace_all.zig").prepare(a, &snapshot, request);
        defer intent.deinit();
        var plan = try self.session.prepareDocumentTextPlan(a, intent);
        defer plan.deinit();
        // The existing managed ticket is checked again before History admission.
        // No await, callback, target cache or second mutation authority is used.
        try self.lifetime.check(request.binding, try existing.currentRevision());
        if (plan.groups.len == 0) return false;
        return self.history.apply(self.session, .{ .splice_document_text = plan.groups });
    }
};
