//! Ephemeral formatting intent. No document, resource or history cache.
const std = @import("std");
const model = @import("document.zig");
pub const limits = struct {
    pub const projection_bytes = 32 * 1024 * 1024;
    pub const request_bytes = 65536;
    pub const reply_bytes = 2097152;
    pub const targets = 4096;
    pub const ranges = 4096;
    pub const commands = 4096;
    pub const font_name_bytes = 4096;
};
pub const Range = struct { startUnit: u32, endUnit: u32 };
pub const Binding = struct { session: []const u8, revision: ?u32 };
pub const Target = struct { ref: []const u8, ranges: []const Range = &.{} };
pub const Font = union(enum) { id: u32, name: []const u8 };
pub const Alignment = enum { LEFT, RIGHT, CENTER, JUSTIFY, DISTRIBUTE, DISTRIBUTE_SPACE };
pub const ResetScope = enum { character, paragraph, all };
pub const ResetResources = struct { style_id: u32, character: ?u32 = null, paragraph: ?u32 = null };
pub const Paragraph = struct {
    border_fill: @import("border_fill_patch.zig").Patch = .{},
    alignment: ?Alignment = null,
    margins: model.ParagraphMarginPatch = .{},
    spacing: ?model.ParagraphSpacing = null,
    flags: @import("paragraph_flags.zig").Patch = .{},
};
pub const Patch = struct {
    reset: ?ResetScope = null,
    character: model.CharacterPropertyPatch = .{},
    fonts: [7]?Font = @splat(null),
    paragraph: Paragraph = .{},
    pub fn hasCharacter(self: Patch) bool {
        if (self.reset) |v| return v != .paragraph;
        inline for (@import("../reflection.zig").fields(model.CharacterPropertyPatch)) |field| {
            if (@field(self.character, field.name) != null) return true;
        }
        for (self.fonts) |font| if (font != null) return true;
        return false;
    }
    pub fn hasParagraph(self: Patch) bool {
        if (self.reset) |v| return v != .character;
        if (@import("border_fill_patch.zig").has(self.paragraph.border_fill)) return true;
        if (@import("paragraph_flags.zig").has(self.paragraph.flags) or self.paragraph.alignment != null or self.paragraph.spacing != null) return true;
        inline for (@import("../reflection.zig").fields(model.ParagraphMarginPatch)) |field| {
            if (@field(self.paragraph.margins, field.name) != null) return true;
        }
        return false;
    }
};
pub const Apply = struct { binding: Binding, targets: []const Target, patch: Patch };
/// The owner comes from the live Native SSOT resolver, never decoded client IDs.
pub const Owner = struct { section: usize, paragraph: usize };
pub const Operation = union(enum) {
    character_resource: struct { owner: Owner, range: Range, id: u32 },
    paragraph_resource: struct { owner: Owner, id: u32 },
    paragraph_border_fill: struct { owner: Owner, value: @import("border_fill_patch.zig").Patch, flags: @import("paragraph_flags.zig").Patch = .{} },
    character: struct { owner: Owner, range: Range, patch: model.CharacterPropertyPatch },
    font_name: struct { owner: Owner, range: Range, language: @import("character_fonts.zig").Language, name: []const u8 },
    paragraph_flags: struct { owner: Owner, value: @import("paragraph_flags.zig").Patch },
    alignment: struct { owner: Owner, value: Alignment },
    margins: struct { owner: Owner, value: model.ParagraphMarginPatch },
    spacing: struct { owner: Owner, value: model.ParagraphSpacing },
};
// 요청/plan은 같은 borrowed ref 집합 검사를 사용합니다. 평균 O(T), 입력 순서는 불변입니다.
pub fn requireDistinctTargets(a: std.mem.Allocator, targets: []const Target) !void {
    var seen: std.StringHashMapUnmanaged(void) = .empty;
    defer seen.deinit(a);
    try seen.ensureTotalCapacity(a, @intCast(targets.len));
    for (targets) |target| if (seen.getOrPutAssumeCapacity(target.ref).found_existing) return error.DuplicateFormattingTarget;
}
/// Resolver must verify binding, revision, original owner, scalar boundaries,
/// protection and format-specific writable fields BEFORE any mutation.
/// The returned plan is consumed by exactly one format History.applyBatch.
pub fn plan(a: std.mem.Allocator, input: Apply, resolver: anytype) ![]Operation {
    if (input.binding.revision == null) return error.InvalidFormattingBinding;
    if (input.patch.reset != null) {
        var without = input.patch;
        without.reset = null;
        if (without.hasCharacter() or without.hasParagraph()) return error.ConflictingFormattingReset;
    }
    try resolver.checkBinding(input.binding);
    if (input.targets.len == 0 or input.targets.len > limits.targets) return error.LimitExceeded;
    var total_ranges: usize = 0;
    try requireDistinctTargets(a, input.targets);
    for (input.targets) |target| {
        total_ranges = try std.math.add(usize, total_ranges, target.ranges.len);
        if (total_ranges > limits.ranges) return error.LimitExceeded;
        var previous_end: u32 = 0;
        for (target.ranges, 0..) |range, i| {
            if (range.startUnit >= range.endUnit or (i != 0 and range.startUnit < previous_end)) return error.InvalidTextPosition;
            previous_end = range.endUnit;
        }
    }
    // Reject expanded command budget before any source projections/dry runs.
    _ = try operationCount(input);
    var ops: std.ArrayList(Operation) = .empty;
    errdefer ops.deinit(a);
    for (input.targets) |target| {
        const owner = try resolver.resolve(target.ref);
        try resolver.validate(owner, target.ranges, input.patch);
        if (input.patch.reset) |reset| {
            const ResolverType = if (@typeInfo(@TypeOf(resolver)) == .pointer) @typeInfo(@TypeOf(resolver)).pointer.child else @TypeOf(resolver);
            if (comptime @hasDecl(ResolverType, "resolveReset")) {
                const resources = try resolver.resolveReset(owner);
                if (reset != .paragraph) {
                    const id = resources.character orelse return error.MissingResetStyleCharacter;
                    for (target.ranges) |range| try append(a, &ops, .{ .character_resource = .{ .owner = owner, .range = range, .id = id } });
                }
                if (reset != .character) try append(a, &ops, .{ .paragraph_resource = .{ .owner = owner, .id = resources.paragraph orelse return error.MissingResetStyleParagraph } });
            } else return error.UnsupportedFormattingReset;
            continue;
        }
        var character = input.patch.character;
        var ids = character.font_ids orelse @as(@import("character_fonts.zig").Values, @splat(null));
        var has_ids = character.font_ids != null;
        for (input.patch.fonts, 0..) |font, language| if (font) |intent| switch (intent) {
            .id => |id| {
                ids[language] = id;
                has_ids = true;
            },
            .name => {},
        };
        if (has_ids) character.font_ids = ids;
        if (input.patch.hasCharacter()) {
            if (target.ranges.len == 0) return error.EmptyCharacterSelection;
            for (target.ranges) |range| {
                var has_properties = false;
                inline for (@import("../reflection.zig").fields(model.CharacterPropertyPatch)) |field| {
                    has_properties = has_properties or @field(character, field.name) != null;
                }
                if (has_properties) try append(a, &ops, .{ .character = .{ .owner = owner, .range = range, .patch = character } });
                for (input.patch.fonts, 0..) |font, language| if (font) |intent| switch (intent) {
                    .id => {},
                    .name => |name| try append(a, &ops, .{ .font_name = .{ .owner = owner, .range = range, .language = @fromBackingInt(@intCast(language)), .name = name } }),
                };
            }
        }
        if (@import("border_fill_patch.zig").has(input.patch.paragraph.border_fill)) try append(a, &ops, .{ .paragraph_border_fill = .{ .owner = owner, .value = input.patch.paragraph.border_fill, .flags = input.patch.paragraph.flags } });
        if (@import("paragraph_flags.zig").has(input.patch.paragraph.flags) and !@import("border_fill_patch.zig").has(input.patch.paragraph.border_fill)) try append(a, &ops, .{ .paragraph_flags = .{ .owner = owner, .value = input.patch.paragraph.flags } });
        if (input.patch.paragraph.alignment) |value| try append(a, &ops, .{ .alignment = .{ .owner = owner, .value = value } });
        var margins = false;
        inline for (@import("../reflection.zig").fields(model.ParagraphMarginPatch)) |field| {
            margins = margins or @field(input.patch.paragraph.margins, field.name) != null;
        }
        if (margins) try append(a, &ops, .{ .margins = .{ .owner = owner, .value = input.patch.paragraph.margins } });
        if (input.patch.paragraph.spacing) |value| try append(a, &ops, .{ .spacing = .{ .owner = owner, .value = value } });
    }
    return ops.toOwnedSlice(a);
}
pub fn operationCount(input: Apply) !usize {
    if (input.patch.reset) |reset| {
        var total: usize = 0;
        for (input.targets) |target| {
            if (reset != .paragraph and target.ranges.len == 0) return error.EmptyCharacterSelection;
            const count = (if (reset != .paragraph) target.ranges.len else @as(usize, 0)) + @as(usize, @intFromBool(reset != .character));
            total = std.math.add(usize, total, count) catch return error.LimitExceeded;
            if (total > limits.commands) return error.LimitExceeded;
        }
        return total;
    }

    var character = false;
    inline for (@import("../reflection.zig").fields(model.CharacterPropertyPatch)) |field| character = character or @field(input.patch.character, field.name) != null;
    var names: usize = 0;
    for (input.patch.fonts) |font| if (font) |intent| switch (intent) {
        .id => {
            character = true;
        },
        .name => {
            names += 1;
        },
    };
    var margins = false;
    inline for (@import("../reflection.zig").fields(model.ParagraphMarginPatch)) |field| margins = margins or @field(input.patch.paragraph.margins, field.name) != null;
    const per_range: usize = @as(usize, @intFromBool(character)) + names;
    const per_owner: usize = @as(usize, @intFromBool(@import("border_fill_patch.zig").has(input.patch.paragraph.border_fill))) + @as(usize, @intFromBool(@import("paragraph_flags.zig").has(input.patch.paragraph.flags) and !@import("border_fill_patch.zig").has(input.patch.paragraph.border_fill))) + @as(usize, @intFromBool(input.patch.paragraph.alignment != null)) + @as(usize, @intFromBool(margins)) + @as(usize, @intFromBool(input.patch.paragraph.spacing != null));
    var total: usize = 0;
    for (input.targets) |target| {
        const ranges = std.math.mul(usize, target.ranges.len, per_range) catch return error.LimitExceeded;
        total = std.math.add(usize, total, ranges) catch return error.LimitExceeded;
        total = std.math.add(usize, total, per_owner) catch return error.LimitExceeded;
        if (total > limits.commands) return error.LimitExceeded;
    }
    return total;
}
fn append(a: std.mem.Allocator, ops: *std.ArrayList(Operation), op: Operation) !void {
    if (ops.items.len == limits.commands) return error.LimitExceeded;
    try ops.append(a, op);
}
