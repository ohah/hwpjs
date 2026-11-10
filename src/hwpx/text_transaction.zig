//! Typed Native boundary over current HWPX source and the existing owned History.
//! No ABI, serializer, persistent inventory, reference issuer or second History.
const std = @import("std");
const editor = @import("editor_session.zig");
const history_mod = @import("editor_history.zig");
const lifetime = @import("../model/formatting_binding.zig");
const m = @import("../model/text_transaction.zig");
const refs = @import("../model/text_transaction_binding.zig");
const formatting = @import("../model/formatting_patch.zig");
const Context = @import("independent_text_session.zig").Context;

pub const Row = struct { owner: formatting.Owner, ref: []u8, before_units: u32 };
pub const Snapshot = struct {
    allocator: std.mem.Allocator,
    binding: formatting.Binding,
    coverage: m.Coverage,
    rows: []Row,
    pub fn deinit(self: *Snapshot) void {
        for (self.rows) |row| self.allocator.free(row.ref);
        self.allocator.free(self.rows);
        self.allocator.free(self.binding.session);
        self.allocator.free(self.coverage.sections);
        self.* = undefined;
    }
};
pub const Service = struct {
    session: *editor.Session,
    history: *history_mod.History,
    lifetime: *lifetime.State,

    /// Caller keeps all three handles alive and one lifetime State exclusively
    /// associated with this editor; advance it after successful reopen/rebind.
    pub fn currentRevision(self: Service) !u32 {
        if (!self.lifetime.opened) return error.EditorNotOpen;
        const owned = self.history.owned orelse return error.HistoryProtocolRequired;
        if (!owned.ownsSession(self.session) or self.history.source_pointer != self.session.source.ptr or owned.source != self.session.source.ptr) return error.SourceBindingMismatch;
        if (owned.poisoned) return error.HistoryMutationUncertain;
        if (!owned.managed or !self.session.history_delta_managed) return error.HistoryProtocolRequired;
        if (self.session.history_transaction_active) return error.MutationInProgress;
        if (owned.observed_serial != self.session.mutation_serial) return error.HistoryCurrentMismatch;
        if (self.session.mutation_serial == std.math.maxInt(u64)) return error.HistoryRevisionExhausted;
        const revision = self.history.revision();
        if (revision == std.math.maxInt(u32)) return error.InvalidTextTransactionRevision;
        return revision;
    }
    fn checkBinding(self: Service, binding: formatting.Binding) !u32 {
        const revision = try self.currentRevision();
        if (binding.revision == null) return error.InvalidTextTransactionBinding;
        try self.lifetime.check(binding, revision);
        return revision;
    }
    /// Global paragraph ordinals are HWPX Native 1-based. Selectors are requests,
    /// never ownership grants. Returned rows own refs and retain selector order.
    pub fn query(self: Service, a: std.mem.Allocator, binding: formatting.Binding, owners: []const formatting.Owner) !Snapshot {
        const revision = try self.checkBinding(binding);
        if (owners.len > m.limits.snapshot_paragraphs) return error.LimitExceeded;
        const coverage = try self.session.independentTextCoverage(a);
        errdefer a.free(coverage.sections);
        const session_id = try self.lifetime.session(a);
        errdefer a.free(session_id);
        const rows = try a.alloc(Row, owners.len);
        errdefer a.free(rows);
        var initialized: usize = 0;
        errdefer for (rows[0..initialized]) |row| a.free(row.ref);
        var seen: std.AutoHashMapUnmanaged(formatting.Owner, void) = .empty;
        defer seen.deinit(a);
        // Coverage-only queries must work even when pending tables cannot be edited.
        var context: ?Context = if (owners.len != 0) try Context.init(self.session) else null;
        defer if (context) |*value| value.deinit();
        for (owners, rows) |owner, *row| {
            if ((try seen.getOrPut(a, owner)).found_existing) return error.DuplicateTextTransactionTarget;
            const units = try context.?.inspect(owner.section, owner.paragraph);
            const ref = try refs.reference(self.lifetime.*, a, revision, .{ .owner = owner, .kind = .plain });
            row.* = .{ .owner = owner, .ref = ref, .before_units = units };
            initialized += 1;
        }
        if (context) |*value| try value.validatePrepared();
        _ = try self.checkBinding(binding);
        return .{ .allocator = a, .binding = .{ .session = session_id, .revision = revision }, .coverage = coverage, .rows = rows };
    }
    /// All Native source/expected/scalar/metadata preflight precedes History.
    /// Dry-run Values are discarded; existing History owns the sole live apply.
    pub fn apply(self: Service, a: std.mem.Allocator, input: m.Apply) !bool {
        const revision = try self.checkBinding(input.binding);
        var resolver: Resolver = .{ .service = self, .allocator = a };
        defer resolver.deinit();
        const plan = try @import("../model/text_transaction_admission.zig").prepare(a, self.lifetime.*, revision, input, &resolver);
        defer a.free(plan);
        if (resolver.context) |*value| try value.validatePrepared();
        var rich = false;
        for (plan) |item| rich = rich or item.request.insertion.hasCharacter();
        if (rich) try resolver.context.?.validateInsertionFormatting(a, self.lifetime, self.history, input.binding, plan);
        const commands = try a.alloc(history_mod.Command, plan.len);
        defer a.free(commands);
        for (plan, commands) |*item, *command| command.* = .{
            .kind = .independent_text,
            .section = item.target.owner.section,
            .paragraph = item.target.owner.paragraph,
            .start = 0,
            .deleted = 0,
            .inserted = "",
            .independent_text_edits = item.request.edits,
            .independent_text_insertion = if (item.request.insertion.hasCharacter()) &item.request.insertion else null,
        };
        // Retire every dry-run candidate before entering the actual owner.
        resolver.deinit();
        _ = try self.checkBinding(input.binding);
        if (!rich) return self.history.applyBatch(self.session, commands);
        // Resource creation and text/style commits belong exclusively to this
        // one existing History owner, including rollback and redo preservation.
        var batch: @import("formatting_batch_context.zig").Context = .{};
        try self.session.beginFormattingBatch(&batch);
        defer self.session.endFormattingBatch(&batch);
        return self.history.applyBatch(self.session, commands);
    }
};
const Resolver = struct {
    service: Service,
    allocator: std.mem.Allocator,
    context: ?Context = null,
    fn deinit(self: *Resolver) void {
        if (self.context) |*value| value.deinit();
        self.context = null;
    }
    pub fn checkCoverage(self: *Resolver, claimed: m.Coverage) !void {
        const actual = try self.service.session.independentTextCoverage(self.allocator);
        defer self.allocator.free(actual.sections);
        if (claimed.paragraphs != actual.paragraphs or claimed.created_cell_paragraphs != actual.created_cell_paragraphs or claimed.sections.len != actual.sections.len) return error.IncompleteTextTransactionCoverage;
        for (claimed.sections, actual.sections) |left, right| if (!std.meta.eql(left, right)) return error.IncompleteTextTransactionCoverage;
    }
    pub fn validate(self: *Resolver, target: refs.Target, group: m.Group) !void {
        if (target.kind != .plain or target.begin_element != 0) return error.UnsupportedTextTransactionTarget;
        for (group.insertion.fonts) |font| if (font) |value| switch (value) {
            .name => |name| try @import("../model/font_name.zig").validate(name, formatting.limits.font_name_bytes),
            .id => {},
        };
        for (group.edits) |edit| if (std.mem.indexOfAny(u8, edit.text, "\r\n") != null) return error.UnsupportedTextInsertionNewline;
        if (self.context == null) self.context = try Context.init(self.service.session);
        try self.context.?.preflight(target.owner.section, target.owner.paragraph, group.before_units, group.edits);
    }
};
