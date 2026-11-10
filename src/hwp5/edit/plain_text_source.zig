//! Source eligibility and metadata validation, separate from mutable splicing.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const children = @import("../body/paragraph_children.zig");
const Version = @import("../version.zig").Version;

pub const validateSection = @import("source_policy.zig").validate;
pub const Validation = struct { ranges: ?body.Ranges, preserved_direct_records: usize };
const Purpose = enum { splice, formula_transaction, hyperlink_transaction, field_transaction, character_format, structure_transaction, retained_company };

/// Request-only immutable section preparation for original root-body formatting.
/// Nested/memo/company/generated/restart routes deliberately keep raw validation.
pub const CharacterContext = struct {
    source: []const u8,
    version: Version,
    tree: ?Tree = null,
    company: ?bool = null,
    memo_lists: ?bool = null,
    policy_checked: bool = false,
    controls_checked: bool = false,
    tree_builds: usize = 0,
    owner_reads: usize = 0,
    fallbacks: usize = 0,
    pub fn deinit(self: *CharacterContext, a: std.mem.Allocator) void {
        if (self.tree) |*tree| tree.deinit(a);
    }
};
pub fn validateCharacterFormatScoped(a: std.mem.Allocator, context: *CharacterContext, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    if (source.ptr != context.source.ptr or source.len != context.source.len or version.raw != context.version.raw) return error.SourceBindingMismatch;
    if (context.company == null) context.company = try @import("company_source.zig").has(source);
    if (context.company.?) {
        context.fallbacks += 1;
        return validateWith(a, source, version, p, char_count, .retained_company);
    }
    if (context.memo_lists == null) context.memo_lists = try @import("memo_source_retention.zig").hasLists(source);
    if (context.memo_lists.? or p.source_node == null or p.parent_node != null or p.restart_control_source != null or p.field_attributes != null or p.formula_results != null) {
        context.fallbacks += 1;
        return validateWith(a, source, version, p, char_count, .character_format);
    }
    context.owner_reads += 1;
    return validatePrepared(a, source, version, p, char_count, .character_format, context, null);
}
fn validateControls(a: std.mem.Allocator, tree: Tree, source: []const u8, version: Version, context: ?*CharacterContext) !void {
    if (context) |scope| if (scope.controls_checked) return;
    try @import("control_source.zig").validateWithSource(a, tree, source, version);
    if (context) |scope| scope.controls_checked = true;
}

pub fn validateStructureTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, .structure_transaction);
}

/// Caller must validate source-backed mixed bindings and formula protection.
pub fn validateFieldTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, .field_transaction);
}

/// Returned ranges borrow source, not the temporary Tree nodes.
pub fn validate(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, .splice);
}

pub fn validateFormulaTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, .formula_transaction);
}

/// Only a section transaction with validated hyperlink spans may use this.
pub fn validateHyperlinkTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, .hyperlink_transaction);
}

/// Formatting retains text positions, including formula and spanning fields.
pub fn validateCharacterFormat(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    // Reuse the exact Company source/link/owner policy; never widen generic fields.
    if (try @import("company_source.zig").has(source))
        return validateWith(a, source, version, p, char_count, .retained_company);
    return validateWith(a, source, version, p, char_count, .character_format);
}

/// Company source/binding 보호가 검증된 section draft 전용.
pub fn validateRetainedCompanyTransaction(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
    return validateWith(a, source, version, p, char_count, .retained_company);
}

fn validateWith(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize, comptime purpose: Purpose) !Validation {
    return validatePrepared(a, source, version, p, char_count, purpose, null, null);
}
fn validatePrepared(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize, comptime purpose: Purpose, context: ?*CharacterContext, ordinary: ?*OrdinaryState) !Validation {
    const generated = p.source_node == null;
    const source_node = if (generated) p.header_template orelse return error.MissingParagraphSource else try p.originalNode();
    if (generated and (p.instance_id == 0 or p.field_attributes != null or p.formula_results != null)) return error.UnsupportedStructuralControl;
    var owned_tree: ?Tree = null;
    const tree = if (ordinary) |scope| scope.tree else if (context) |scope| block: {
        if (scope.tree == null) {
            scope.tree = try Tree.parseTextPreview(a, source, version, .{});
            scope.tree_builds += 1;
        }
        break :block scope.tree.?;
    } else block: {
        owned_tree = try Tree.parseTextPreview(a, source, version, .{});
        break :block owned_tree.?;
    };
    defer if (owned_tree) |*value| value.deinit(a);
    if (source_node >= tree.nodes.len or tree.nodes[source_node].record.value != .header) return error.SourceBindingMismatch;
    const node = tree.nodes[source_node];
    const parent: ?usize = if (p.parent_node) |value| @as(usize, value) else null;
    if (node.parent != parent) return error.SourceBindingMismatch;
    const h = node.record.value.header;
    if (h.extra.len != 0 or (h.merge_tracking orelse 0) != 0) return error.UnsupportedParagraphExtension;
    if (h.control_mask & ~@import("control_boundaries.zig").retained_mask != 0) return error.UnsupportedTextControl;
    if (ordinary) |scope| {
        if (@import("builtin").is_test) scope.work.live_checks += 1;
        const key = @as(u64, source_node) * 2 + @intFromBool(generated);
        if (scope.templates.get(key)) |cached| {
            if (@import("builtin").is_test) scope.work.template_hits += 1;
            try validateCurrent(a, p, cached.plain_current);
            return cached.validation;
        }
        if (@import("builtin").is_test) scope.work.template_misses += 1;
        // memo.target inspects root-owned sibling lists before section policy,
        // even when no memo marker exists. Preserve that selected error order.
        if (node.parent) |parent_node| {
            const parent_entry = tree.nodes[parent_node];
            if (parent_entry.record.value == .header and parent_entry.parent == null) _ = try (try scope.owners()).logical(tree, source_node);
        }
    }
    if (purpose == .structure_transaction) {
        try @import("structure_source_policy.zig").validateParagraph(a, source, version, p, tree);
    } else if (ordinary == null and (try @import("memo_source_retention.zig").target(a, tree, source_node, version) or
        ((purpose == .splice or purpose == .character_format) and context == null and try @import("memo_body_retention.zig").target(a, source, version, source_node))))
    {
        try @import("source_policy.zig").validateMemoTransaction(a, source, version);
    } else switch (purpose) {
        .formula_transaction => _ = try @import("source_policy.zig").hasFormulas(a, source, version),
        .character_format => {
            if (context == null or !context.?.policy_checked) {
                if (try @import("source_policy.zig").hasNamedFields(source)) {
                    try @import("source_policy.zig").validateCharacterFormat(a, source, version);
                } else _ = try @import("source_policy.zig").hasFormulas(a, source, version);
                if (context) |scope| scope.policy_checked = true;
            }
        },
        .retained_company => try @import("company_source.zig").validateParagraph(a, source, version, p),
        .splice, .hyperlink_transaction => {
            if (ordinary == null or !ordinary.?.policy_checked) {
                try validateSection(a, source, version);
                if (ordinary) |scope| {
                    scope.policy_checked = true;
                    if (@import("builtin").is_test) scope.work.policy_validations += 1;
                }
            }
        },
        .field_transaction => try @import("source_policy.zig").validateFieldTextTransaction(a, source, version),
        .structure_transaction => unreachable,
    }
    if (ordinary) |scope| {
        if (tree.nodes[source_node].parent != null) try (try scope.owners()).validate(a, tree, source_node, version);
    } else try @import("paragraph_owner.zig").validate(a, tree, source_node, version);
    var links_checked = false;
    var preserved_direct_records: usize = 0;
    var runs: ?body.Runs = null;
    var ranges: ?body.Ranges = null;
    var lines: ?body.Segments = null;
    var child = @as(usize, source_node) + 1;
    while (child < node.subtree_end) {
        const entry = tree.nodes[child];
        if (ordinary) |scope| if (@import("builtin").is_test) {
            scope.work.direct_records += 1;
        };
        if (entry.parent != source_node) return error.UnsupportedParagraphRecord;
        if (entry.record.framing.tag == @backingInt(body.Tag.memo_list)) {
            var groups = try @import("paragraph_owner.zig").inspectGroups(a, tree, version);
            defer groups.deinit(a);
            try @import("paragraph_owned_list.zig").validateMemoMarker(tree, groups, source_node, child);
            preserved_direct_records += 1;
            child = entry.subtree_end;
            continue;
        }
        if (entry.record.framing.tag == 72 or entry.record.framing.tag == 66) {
            var owned_groups: ?@import("../body/list_groups.zig").Groups = null;
            const groups = if (ordinary) |scope| (try scope.owners()).groups else block: {
                owned_groups = try @import("paragraph_owner.zig").inspectGroups(a, tree, version);
                break :block owned_groups.?;
            };
            defer if (owned_groups) |*g| g.deinit(a);
            const list = if (entry.record.framing.tag == 72) child else (if (ordinary) |scope| try (try scope.owners()).logical(tree, child) else try @import("paragraph_owner.zig").logicalOwner(tree, groups, child)) orelse return error.OrphanListParagraph;
            if (ordinary) |scope| try (try scope.owners()).validateOwned(tree, source_node, list) else try @import("paragraph_owned_list.zig").validate(tree, groups, source_node, list);
            preserved_direct_records += 1;
            child = entry.subtree_end;
            continue;
        }
        if (entry.record.framing.tag == @backingInt(body.Tag.control_header)) {
            preserved_direct_records += 1;
            if (!links_checked) try validateControlsScoped(a, tree, source, version, context, ordinary);
            links_checked = true;
            child = entry.subtree_end;
            continue;
        }
        if (entry.subtree_end != child + 1) return error.UnsupportedParagraphRecord;
        switch (entry.record.framing.tag) {
            @backingInt(body.Tag.paragraph_text) => {},
            @backingInt(body.Tag.char_runs) => {
                if (runs != null) return error.DuplicateParagraphRecord;
                runs = try body.Runs.parse(entry.record.framing.payload);
            },
            @backingInt(body.Tag.range_tags) => {
                if (ranges != null) return error.DuplicateParagraphRecord;
                ranges = try body.Ranges.parse(entry.record.framing.payload);
            },
            @backingInt(body.Tag.line_segments) => {
                if (lines != null) return error.DuplicateParagraphRecord;
                lines = try body.Segments.parse(entry.record.framing.payload);
            },
            else => return error.UnsupportedParagraphRecord,
        }
        child = entry.subtree_end;
    }
    try (body.Metadata{ .runs = runs, .ranges = ranges, .lines = lines }).validate(h, char_count);
    const parts = try children.collect(tree, source_node);
    const column_continuation = generated and preserved_direct_records != 0;
    var restart_count: ?usize = null;
    if (p.restart_control_source != null) {
        var links = try @import("../body/control_links.zig").Links.build(a, tree);
        defer links.deinit(a);
        const index = (try @import("page_restart_source.zig").forParagraph(links.items, p)) orelse return error.SourceBindingMismatch;
        const unit = try @import("page_restart_current.zig").unit(a, tree, links.items, index, p);
        restart_count = if (unit != null) 1 else 0;
    }
    if (column_continuation) @import("column_split_scope.zig").validateTemplate(tree, source_node) catch |err| switch (err) {
        error.UnsupportedStructuralControl => {
            var links = try @import("../body/control_links.zig").Links.build(a, tree);
            defer links.deinit(a);
            const index = @import("page_restart_source.zig").find(links.items, source_node) orelse return err;
            const unit = try @import("page_restart_current.zig").unit(a, tree, links.items, index, p);
            restart_count = if (unit != null) 1 else 0;
        },
        else => return err,
    };
    if (parts.text_node) |text_node| {
        const text = tree.nodes[text_node].record.value.text;
        if (ordinary) |scope| if (@import("builtin").is_test) {
            scope.work.template_text_bytes += text.raw.len;
        };
        try text.validateCount(h);
        if (generated and !column_continuation and restart_count == null) try @import("plain_text_content.zig").validatePlain(text.raw);
        switch (purpose) {
            .retained_company => try @import("plain_text_content.zig").validatePlain(text.raw),
            .formula_transaction, .structure_transaction => try @import("../body/field_span.zig").validateEditable(text.raw),
            .splice => try @import("hyperlink_source.zig").validate(text.raw),
            .hyperlink_transaction, .field_transaction, .character_format => {},
        }
        if (!links_checked) {
            var tokens = text.tokens();
            while (try tokens.next()) |token| {
                if (token.value == .control and token.value.control.kind == .extended) {
                    try validateControlsScoped(a, tree, source, version, context, ordinary);
                    break;
                }
            }
        }
    } else if (h.characterUnits() > 1) return error.UnsupportedMissingText;
    if (ordinary) |scope| {
        const validation: Validation = .{ .ranges = ranges, .preserved_direct_records = restart_count orelse (if (generated) @as(usize, 0) else preserved_direct_records) };
        // Only immutable facts enter the cache. Live generated checks below and
        // every cache hit run validateCurrent against this actual paragraph.
        if (generated) {
            if (preserved_direct_records != 0 and !column_continuation) return error.UnsupportedStructuralControl;
            if (ranges) |value| if (value.count() != 0) return error.UnsupportedRangeSemantics;
        }
        try validateCurrent(a, p, generated and restart_count == null);
        try scope.templates.put(scope.a, @as(u64, source_node) * 2 + @intFromBool(generated), .{ .validation = validation, .plain_current = generated and restart_count == null });
        return validation;
    }
    if (generated) {
        if (preserved_direct_records != 0 and !column_continuation) return error.UnsupportedStructuralControl;
        if (ranges) |value| if (value.count() != 0) return error.UnsupportedRangeSemantics;
        if (p.range_tags) |value| if (value.len != 0) return error.UnsupportedRangeSemantics;
        const current = try @import("plain_text_content.zig").editableTextBytes(a, p);
        defer a.free(current);
        if (restart_count == null) try @import("plain_text_content.zig").validatePlain(current);
    }
    return .{ .ranges = ranges, .preserved_direct_records = restart_count orelse (if (generated) @as(usize, 0) else preserved_direct_records) };
}

fn validateCurrent(a: std.mem.Allocator, p: model.Paragraph, plain_current: bool) !void {
    if (p.source_node != null) return;
    if (p.range_tags) |value| if (value.len != 0) return error.UnsupportedRangeSemantics;
    const current = try @import("plain_text_content.zig").editableTextBytes(a, p);
    defer a.free(current);
    if (plain_current) try @import("plain_text_content.zig").validatePlain(current);
}
fn validateControlsScoped(a: std.mem.Allocator, tree: Tree, source: []const u8, version: Version, character: ?*CharacterContext, ordinary: ?*OrdinaryState) !void {
    if (ordinary) |scope| {
        if (scope.controls_checked) return;
        try @import("control_source.zig").validateWithSource(a, tree, source, version);
        scope.controls_checked = true;
        if (@import("builtin").is_test) scope.work.control_validations += 1;
    } else try validateControls(a, tree, source, version, character);
}

pub const OrdinaryWork = if (@import("builtin").is_test) struct {
    tree_builds: usize = 0,
    source_bytes: usize = 0,
    policy_validations: usize = 0,
    control_validations: usize = 0,
    owner_builds: usize = 0,
    owner_index_steps: usize = 0,
    selected_lists: usize = 0,
    table_inventories: usize = 0,
    template_text_bytes: usize = 0,
    direct_records: usize = 0,
    template_misses: usize = 0,
    template_hits: usize = 0,
    live_checks: usize = 0,
    fallbacks: usize = 0,
} else void;
const OrdinaryState = struct {
    a: std.mem.Allocator,
    binding: []const u8,
    source: []u8,
    version: Version,
    char_count: usize,
    tree: Tree,
    memo_lists: bool,
    policy_checked: bool = false,
    controls_checked: bool = false,
    owner: ?@import("paragraph_owner.zig").Prepared = null,
    templates: std.AutoHashMapUnmanaged(u64, struct { validation: Validation, plain_current: bool }) = .empty,
    work: OrdinaryWork = if (@import("builtin").is_test) .{} else {},
    fn owners(self: *OrdinaryState) !*@import("paragraph_owner.zig").Prepared {
        if (self.owner == null) {
            self.owner = try @import("paragraph_owner.zig").Prepared.init(self.a, self.tree, self.version);
            if (@import("builtin").is_test) self.work.owner_builds += 1;
        }
        return &self.owner.?;
    }
};
/// Constructor-owned, request-only ordinary source proof. Caller source must
/// remain immutable for this request. Binding is exact pointer/length/version/
/// char-count; the context separately owns its source bytes and parsed tree.
/// Never reuse after source replacement or format-resource revision changes.
/// Special memo/restart routes deliberately use the original validator.
pub const OrdinaryContext = opaque {
    fn state(self: *OrdinaryContext) *OrdinaryState {
        return @ptrCast(@alignCast(self));
    }
    pub fn create(a: std.mem.Allocator, source: []const u8, version: Version, char_count: usize) !*OrdinaryContext {
        const self = try a.create(OrdinaryState);
        errdefer a.destroy(self);
        const owned = try a.dupe(u8, source);
        errdefer a.free(owned);
        var tree = try Tree.parseTextPreview(a, owned, version, .{});
        errdefer tree.deinit(a);
        self.* = .{ .a = a, .binding = source, .source = owned, .version = version, .char_count = char_count, .tree = tree, .memo_lists = try @import("memo_source_retention.zig").hasLists(owned) };
        if (@import("builtin").is_test) self.work = .{ .tree_builds = 1, .source_bytes = source.len };
        return @ptrCast(self);
    }
    pub fn destroy(self: *OrdinaryContext) void {
        const s = self.state();
        const a = s.a;
        if (s.owner) |*owner| owner.deinit(a);
        s.templates.deinit(a);
        s.tree.deinit(a);
        a.free(s.source);
        a.destroy(s);
    }
    pub fn validate(self: *OrdinaryContext, a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
        const s = self.state();
        if (s.binding.ptr != source.ptr or s.binding.len != source.len or s.version.raw != version.raw or s.char_count != char_count) return error.SourceBindingMismatch;
        const node = p.source_node orelse p.header_template;
        const restart_template = if (node) |n| n < s.tree.nodes.len and s.tree.nodes[n].record.value == .header and s.tree.nodes[n].record.value.header.control_mask & (@as(u32, 1) << 21) != 0 else false;
        if (s.memo_lists or p.restart_control_source != null or restart_template) {
            if (@import("builtin").is_test) s.work.fallbacks += 1;
            return @This().rawValidate(a, s.source, version, p, char_count);
        }
        return validatePrepared(a, s.source, version, p, char_count, .splice, null, s);
    }
    fn rawValidate(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, char_count: usize) !Validation {
        return validateWith(a, source, version, p, char_count, .splice);
    }
    /// Validated ordinary fields reuse the owned tree, not another section parse.
    pub fn prepareFields(self: *OrdinaryContext, a: std.mem.Allocator, p: model.Paragraph, before: []const u8, starts: []const u32) !?[]model.FieldAttributes {
        return @import("field_attributes.zig").prepareIndependentTree(a, self.state().tree, p, before, starts);
    }
    pub fn measurement(self: *OrdinaryContext) OrdinaryWork {
        if (!@import("builtin").is_test) @compileError("ordinary measurements are test-only");
        const s = self.state();
        var result = s.work;
        if (s.owner) |owner| {
            result.owner_index_steps = owner.work.index_steps;
            result.selected_lists = owner.work.selected_lists;
            result.table_inventories = owner.tables_index.loaded.count();
        }
        return result;
    }
};

test "reference click source eligibility stays scoped to validated field transaction" {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue1891/80250_regulatory_analysis.hwpx", a, .limited(16_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const bound = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(bound);
    const p = doc.sections[0].paragraphs[bound[0].span.begin.paragraph];
    _ = try validateFieldTransaction(a, bytes, source.header.version(), p, 65536);
    try std.testing.expectError(error.UnsupportedSectionControl, validate(a, bytes, source.header.version(), p, 65536));
}
