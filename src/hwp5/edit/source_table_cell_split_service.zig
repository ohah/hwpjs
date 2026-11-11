//! Native-only typed command boundary. The host owns Session/managed History.
//! Tickets are the existing non-rewinding History mutation epoch, not new refs.
const std = @import("std");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;
const epoch = @import("../../model/history_mutation_epoch.zig");
pub const Edit = struct {
    section: usize,
    table_node: usize,
    list_node: usize,
    expected_rows: u32,
    expected_columns: u32,
    row: u32,
    column: u32,
    rows: u32,
    columns: u32,
    row_span: u32 = 1,
    column_span: u32 = 1,
};
pub const Target = struct {
    session_epoch: u64,
    ticket: epoch.Ticket,
    revision: u32,
    section: usize,
    table_node: usize,
    list_node: usize,
    expected_rows: u32,
    expected_columns: u32,
    row: u32,
    column: u32,
    row_span: u32 = 1,
    column_span: u32 = 1,
};
pub const Service = struct {
    session: *Session,
    history: *History,
    lifetime: *@import("../../model/formatting_binding.zig").State,
    fn check(self: Service) !epoch.Ticket {
        if (!self.lifetime.opened) return error.EditorNotOpen;
        if (self.history.owner != self.session) return error.SourceBindingMismatch;
        const owned = self.history.owned orelse return error.HistoryProtocolRequired;
        if (owned.owner != self.session) return error.SourceBindingMismatch;
        if (owned.poisoned) return error.HistoryMutationUncertain;
        if (!owned.managed or !self.session.historyDeltaEnabled()) return error.HistoryProtocolRequired;
        if (self.session.historyTransactionActive()) return error.MutationInProgress;
        const ticket = try self.session.historyTicket();
        if (owned.observed == null or !std.meta.eql(ticket, owned.observed.?)) return error.HistoryCurrentMismatch;
        return ticket;
    }
    pub fn currentRevision(self: Service) !u32 {
        _ = try self.check();
        return self.history.revision();
    }
    /// Coordinate capture proves the current source owner; source eligibility is
    /// checked again by the ordinary immutable writer before the one commit.
    /// Existing H ABI/capability promises a single unmerged source cell.
    /// Keep that admission until the public profile and complete span witness
    /// are integrated together; both routes share the same source issuer.
    pub fn capture(self: Service, a: std.mem.Allocator, section: usize, table_node: usize, row: u32, column: u32) !Target {
        return self.captureCurrent(a, section, table_node, row, column, false);
    }
    /// Native-only opt-in. This is not a new public ABI/profile issuer.
    pub fn captureWithSpans(self: Service, a: std.mem.Allocator, section: usize, table_node: usize, row: u32, column: u32) !Target {
        return self.captureCurrent(a, section, table_node, row, column, true);
    }
    fn captureCurrent(self: Service, a: std.mem.Allocator, section: usize, table_node: usize, row: u32, column: u32, comptime allow_spans: bool) !Target {
        const ticket = try self.check();
        const bindings = try self.session.tableBindings(a, section);
        defer a.free(bindings);
        var result: ?Target = null;
        var unmerged_table = true;
        for (bindings) |binding| {
            if (binding.table_node == table_node and (binding.row_span != 1 or binding.column_span != 1)) unmerged_table = false;
            if (binding.table_node != table_node or binding.row != row or binding.column != column) continue;
            if ((!allow_spans and (binding.row_span != 1 or binding.column_span != 1)) or binding.row_span == 0 or binding.column_span == 0) return error.UnsupportedSourceTableGrid;
            const target: Target = .{ .session_epoch = self.lifetime.epoch, .ticket = ticket, .revision = self.history.revision(), .section = section, .table_node = table_node, .list_node = binding.list_node, .expected_rows = binding.rows, .expected_columns = binding.columns, .row = row, .column = column, .row_span = binding.row_span, .column_span = binding.column_span };
            if (result) |prior| {
                if (!std.meta.eql(prior, target)) return error.SourceBindingMismatch;
            } else result = target;
        }
        if (!std.meta.eql(ticket, try self.check())) return error.StaleMutationEpoch;
        if (!allow_spans and result != null and !unmerged_table) return error.UnsupportedSourceTableGrid;
        return result orelse error.InvalidSourceTableCellSplitTarget;
    }
    pub fn apply(self: Service, a: std.mem.Allocator, target: Target, rows: u32, columns: u32) !bool {
        const ticket = try self.check();
        if (target.session_epoch != self.lifetime.epoch) return error.StaleFormattingBinding;
        if (!std.meta.eql(ticket.binding, target.ticket.binding)) return error.SourceBindingMismatch;
        if (!std.meta.eql(ticket, target.ticket) or target.revision != self.history.revision()) return error.StaleMutationEpoch;
        const current = try self.captureWithSpans(a, target.section, target.table_node, target.row, target.column);
        if (!std.meta.eql(current, target)) return error.SourceBindingMismatch;
        _ = try @import("source_table_cell_split.zig").create(target.expected_rows, target.expected_columns, .{ .row = target.row, .column = target.column, .rows = rows, .columns = columns }, 4096);
        return self.history.apply(self.session, .{ .split_source_table_cell = .{ .section = target.section, .table_node = target.table_node, .list_node = target.list_node, .expected_rows = target.expected_rows, .expected_columns = target.expected_columns, .row = target.row, .column = target.column, .rows = rows, .columns = columns, .row_span = target.row_span, .column_span = target.column_span } });
    }
};

/// Session uses the same current source binding even for direct typed commands.
/// Layout remains explicitly observed8, matching Session's existing table view.
pub fn validateOwner(session: *const Session, a: std.mem.Allocator, edit: Edit) !void {
    _ = try @import("source_table_cell_split.zig").create(edit.expected_rows, edit.expected_columns, .{ .row = edit.row, .column = edit.column, .rows = edit.rows, .columns = edit.columns }, 4096);
    const bindings = try session.tableBindings(a, edit.section);
    defer a.free(bindings);
    var found = false;
    for (bindings) |binding| {
        if (binding.table_node != edit.table_node or binding.row != edit.row or binding.column != edit.column) continue;
        if (binding.list_node != edit.list_node or binding.rows != edit.expected_rows or binding.columns != edit.expected_columns or binding.row_span != edit.row_span or binding.column_span != edit.column_span)
            return error.SourceBindingMismatch;
        if (binding.row_span == 0 or binding.column_span == 0) return error.UnsupportedSourceTableGrid;
        found = true;
    }
    if (!found) return error.InvalidSourceTableCellSplitTarget;
}
