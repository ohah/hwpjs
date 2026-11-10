//! Ordinary H5 source-backed text transactions. This service owns no document,
//! history, lifetime issuer or persistent source cache. Public feature remains
//! limited to ordinary source owners; special-purpose/created-host remain unsupported.
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
        return self.applyInner(a, input, if (@import("builtin").is_test) null else {});
    }
    pub const Testing = if (@import("builtin").is_test) struct {
        pub const Work = @import("character_property_apply.zig").Work;
        pub fn applyMeasured(self: Service, a: std.mem.Allocator, input: m.Apply, work: *Work) !bool {
            work.* = .{};
            return self.applyInner(a, input, work);
        }
    } else struct {};
    fn applyInner(self: Service, a: std.mem.Allocator, input: m.Apply, work: if (@import("builtin").is_test) ?*@import("character_property_apply.zig").Work else void) !bool {
        const revision = try self.checkBinding(input.binding);
        var resolver: Resolver = .{ .service = self, .sources = .{ .allocator = a, .session = self.session } };
        defer resolver.sources.deinit();
        const plan = try @import("../../model/text_transaction_admission.zig").prepare(a, self.lifetime.*, revision, input, &resolver);
        defer a.free(plan);
        const groups = try a.alloc(@import("independent_text_session.zig").Group, plan.len);
        defer a.free(groups);
        for (plan, groups) |item, *group| group.* = .{ .section = item.target.owner.section, .paragraph = item.target.owner.paragraph, .edits = item.request.edits };
        var rich: std.ArrayList(edit.Command) = .empty;
        defer {
            for (rich.items) |command| a.free(command.set_character_grouped_insertion.ranges);
            rich.deinit(a);
        }
        var operation_count: usize = 0;
        for (plan) |item| {
            if (!item.request.insertion.hasCharacter()) continue;
            const ranges = try @import("../../model/text_transaction_insertions.zig").prepare(a, item.request.edits, item.request.before_units);
            errdefer a.free(ranges);
            // Preserve the prior expanded operation budget, even though the
            // writer now consumes a whole group in one command.
            const count = try formatting.operationCount(.{ .binding = input.binding, .targets = &.{.{ .ref = item.request.ref, .ranges = ranges }}, .patch = item.request.insertion });
            if (count > formatting.limits.commands - operation_count) return error.LimitExceeded;
            operation_count += count;
            try rich.append(a, .{ .set_character_grouped_insertion = .{ .section = item.target.owner.section, .paragraph = item.target.owner.paragraph, .ranges = ranges, .insertion = item.request.insertion } });
        }
        _ = try self.checkBinding(input.binding);
        if (rich.items.len == 0) return self.history.apply(self.session, .{ .splice_independent_text = groups });
        const commands = try a.alloc(edit.Command, rich.items.len + 1);
        defer a.free(commands);
        commands[0] = .{ .splice_independent_text = groups };
        @memcpy(commands[1..], rich.items);
        var formatting_context: edit.FormattingBatch = .{};
        try self.session.beginFormattingBatch(&formatting_context);
        defer self.session.endFormattingBatch(&formatting_context);
        defer if (@import("builtin").is_test) {
            if (work) |measurement| measurement.* = formatting_context.grouped_work;
        };
        _ = try self.checkBinding(input.binding);
        return self.history.applyBatch(self.session, commands);
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
        if (group.insertion.hasCharacter()) try validateInsertion(group.insertion);
        const context = try self.sources.get(target.owner.section);
        try self.service.session.validateIndependentTextTarget(context, target.owner.section, target.owner.paragraph, group.before_units, group.edits);
    }
};

// Pure sparse intent checks only. Range/resource/source-version permission is
// enforced by the existing writers AFTER the text command, inside ONE History.
fn validateInsertion(patch: formatting.Patch) !void {
    try @import("../../model/character_properties.zig").validate(patch.character);
    if (patch.character.font_ids) |ids| try @import("../../model/character_fonts.zig").validateHwp5(ids);
    for (patch.fonts) |intent| if (intent) |font| switch (font) {
        .id => |id| if (id > std.math.maxInt(u16)) return error.InvalidFontId,
        .name => |name| try @import("../../model/font_name.zig").validate(name, formatting.limits.font_name_bytes),
    };
}
