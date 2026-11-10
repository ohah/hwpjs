//! Ordinary H5 source-backed text transactions. This service owns no document,
//! history, lifetime issuer or persistent source cache. Public feature remains
//! disabled until the special-purpose/created-host and insertion writers exist.
const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const lifetime = @import("../../model/formatting_binding.zig");
const m = @import("../../model/text_transaction.zig");
const refs = @import("../../model/text_transaction_binding.zig");
const formatting = @import("../../model/formatting_patch.zig");
const Context = @import("plain_text_source.zig").OrdinaryContext;
pub const Row = struct {
    owner: formatting.Owner,
    current: @import("created_table_paragraphs.zig").Reference,
    ref: []u8,
    before_units: u32,
};
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
const Sources = struct {
    allocator: std.mem.Allocator,
    session: *edit.Session,
    map: std.AutoHashMapUnmanaged(usize, *Context) = .empty,
    policy: ?*@import("text_source_policy.zig").UnselectedContext = null,
    fn deinit(self: *Sources) void {
        var values = self.map.valueIterator();
        while (values.next()) |context| context.*.destroy();
        self.map.deinit(self.allocator);
        if (self.policy) |scope| scope.destroy();
    }
    fn get(self: *Sources, section: usize) !*Context {
        if (self.map.get(section)) |context| return context;
        const context = try self.session.prepareIndependentSourceContextScoped(section, &self.policy);
        errdefer context.destroy();
        try self.map.put(self.allocator, section, context);
        return context;
    }
};
pub const Service = struct {
    session: *edit.Session,
    history: *History,
    lifetime: *lifetime.State,

    /// Caller owns the three handles and keeps one State associated exclusively
    /// with this editor instance; advance it on successful open/reopen/rebind.
    /// Managed HistoryV2 supplies the live mutation ticket in addition to refs'
    /// shared lifetime/revision syntax. No second owner/reference issuer lives here.
    fn check(self: Service) !u32 {
        if (!self.lifetime.opened) return error.EditorNotOpen;
        if (self.history.owner != self.session) return error.SourceBindingMismatch;
        const owned = self.history.owned orelse return error.HistoryProtocolRequired;
        if (owned.owner != self.session) return error.SourceBindingMismatch;
        if (owned.poisoned) return error.HistoryMutationUncertain;
        if (!owned.managed or !self.session.historyDeltaEnabled()) return error.HistoryProtocolRequired;
        if (self.session.historyTransactionActive()) return error.MutationInProgress;
        const ticket = try self.session.historyTicket();
        if (owned.observed == null or !std.meta.eql(ticket, owned.observed.?)) return error.HistoryCurrentMismatch;
        const revision = self.history.revision();
        if (revision == std.math.maxInt(u32)) return error.InvalidTextTransactionRevision;
        return revision;
    }
    /// Readonly state/protocol/ticket check; capabilities need no inventory scan.
    pub fn currentRevision(self: Service) !u32 {
        return self.check();
    }
    fn checkBinding(self: Service, binding: formatting.Binding) !u32 {
        const revision = try self.check();
        if (binding.revision == null) return error.InvalidTextTransactionBinding;
        try self.lifetime.check(binding, revision);
        return revision;
    }
    /// Coordinates are requested, not trusted. Issue refs only after the same
    /// empty-edit ordinary validation used by apply, against the actual live ref.
    /// Output owns every slice; no source context/request slice survives return.
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
        var sources: Sources = .{ .allocator = a, .session = self.session };
        defer sources.deinit();
        for (owners, rows) |owner, *row| {
            if ((try seen.getOrPut(a, owner)).found_existing) return error.DuplicateTextTransactionTarget;
            const context = try sources.get(owner.section);
            const units = try self.session.editableTextLength(a, owner.section, owner.paragraph);
            try self.session.validateIndependentTextTarget(context, owner.section, owner.paragraph, units, &.{});
            const current = try self.session.currentSourceParagraphReference(owner.section, owner.paragraph);
            const ref = try refs.reference(self.lifetime.*, a, revision, .{ .owner = owner, .kind = .plain });
            row.* = .{ .owner = owner, .current = current, .ref = ref, .before_units = units };
            initialized += 1;
        }
        _ = try self.checkBinding(binding);
        return .{ .allocator = a, .binding = .{ .session = session_id, .revision = revision }, .coverage = coverage, .rows = rows };
    }
    /// Admission resolves all refs/duplicates/global limits first. Every target
    /// dry-run finishes before ONE existing History command; no new queue/history.
    pub fn apply(self: Service, a: std.mem.Allocator, input: m.Apply) !bool {
        const revision = try self.checkBinding(input.binding);
        var resolver: Resolver = .{ .service = self, .sources = .{ .allocator = a, .session = self.session } };
        defer resolver.sources.deinit();
        const plan = try @import("../../model/text_transaction_admission.zig").prepare(a, self.lifetime.*, revision, input, &resolver);
        defer a.free(plan);
        const groups = try a.alloc(@import("independent_text_session.zig").Group, plan.len);
        defer a.free(groups);
        for (plan, groups) |item, *group| group.* = .{ .section = item.target.owner.section, .paragraph = item.target.owner.paragraph, .edits = item.request.edits };
        _ = try self.checkBinding(input.binding);
        return self.history.apply(self.session, .{ .splice_independent_text = groups });
    }
};
const Resolver = struct {
    service: Service,
    sources: Sources,
    pub fn checkCoverage(self: *Resolver, claimed: m.Coverage) !void {
        const a = self.sources.allocator;
        const actual = try self.service.session.independentTextCoverage(a);
        defer a.free(actual.sections);
        if (claimed.paragraphs != actual.paragraphs or claimed.created_cell_paragraphs != actual.created_cell_paragraphs or claimed.sections.len != actual.sections.len) return error.IncompleteTextTransactionCoverage;
        for (claimed.sections, actual.sections) |left, right| if (!std.meta.eql(left, right)) return error.IncompleteTextTransactionCoverage;
    }
    pub fn validate(self: *Resolver, target: refs.Target, group: m.Group) !void {
        if (target.kind != .plain or target.begin_element != 0) return error.UnsupportedTextTransactionTarget;
        if (group.insertion.hasCharacter()) return error.UnsupportedTextInsertionFormatting;
        const context = try self.sources.get(target.owner.section);
        try self.service.session.validateIndependentTextTarget(context, target.owner.section, target.owner.paragraph, group.before_units, group.edits);
    }
};
