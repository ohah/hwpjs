const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const Font = @import("font.zig").Font;
const Objects = @import("object_table.zig");
const TextBlock = @import("text_block.zig");
const TextBody = @import("text_block_body.zig").Body;
const TextFormat = @import("text_format.zig");
const ValueBlock = @import("value_block.zig").Block;
const ids = @import("object_ids.zig");
const patches = @import("contents_patch.zig");

pub const BatchRequest = union(enum) {
    font_name: struct { font: *const Font, new_object_id: u32, bytes: []const u8, trailer: u8 },
    text_body: struct { body: *const TextBody, new_object_id: u32, bytes: []const u8, trailer: u8 },
    null_text_body: struct { body: *const TextBody, new_object_id: u32, bytes: []const u8, trailer: u8 },
    nullable_text_block: struct { block: *const TextBlock.NullableBlock, new_object_id: u32, bytes: []const u8, trailer: u8 },
    null_nullable_text_block: struct { block: *const TextBlock.NullableBlock, new_object_id: u32, bytes: []const u8, trailer: u8 },
    null_nullable_text_format: struct { format: *const TextFormat.NullableFormat, new_object_id: u32, bytes: []const u8, trailer: u8 },
    null_text_format_object: struct { block: *const ValueBlock, format_object_id: u32, code_object_id: u32, format_type_id: u32, raw_word: u16, bytes: []const u8, trailer: u8 },
    inline_string: struct { reference: Objects.Reference, new_object_id: u32, bytes: []const u8, trailer: u8 },
    number_payload: struct { number: @import("value_object.zig").Number, bits: u64, trailer: u16 },
    null_grid_string: struct { cell: *const @import("grid_cells.zig").Cell, object_id: u32, string_type_id: u32, value_type_id: u32, bytes: []const u8, trailer: u8 },
    null_grid_number: struct { cell: *const @import("grid_cells.zig").Cell, object_id: u32, number_type_id: u32, value_type_id: u32, bits: u64, trailer: u16 },
    nullify_grid_string: struct { reference: Objects.Reference },
    nullify_grid_number: struct { cell: *const @import("grid_cells.zig").Cell, number: @import("value_object.zig").Number },
};

/// Forks multiple aliases from one original Contents coordinate space.
/// New IDs must be unique across the batch; semantic command order does not
/// affect patch order or output bytes.
pub fn forkMany(a: std.mem.Allocator, value: *const Contents, requests: []const BatchRequest, max_output_bytes: usize) ![]u8 {
    if (requests.len == 0) return error.EmptyChartStringForkBatch;
    // Grid nullification may emit its target, one object relocation and up to
    // three type-declaration relocations from the observed value-object wire.
    const patch_capacity = std.math.mul(usize, requests.len, 5) catch return error.LimitExceeded;
    const output_patches = try a.alloc(patches.Patch, patch_capacity);
    defer a.free(output_patches);
    const replacements = try a.alloc([]u8, patch_capacity);
    defer a.free(replacements);
    const target_spans = try a.alloc(@import("contents_inline_fork.zig").Span, requests.len);
    defer a.free(target_spans);
    for (requests, target_spans) |request, *span| span.* = requestSpan(request);
    var built: usize = 0;
    defer for (replacements[0..built]) |replacement| a.free(replacement);

    var patch_count: usize = 0;
    for (requests, 0..) |request, i| {
        if (request == .inline_string or request == .nullify_grid_string) {
            const is_nullify = request == .nullify_grid_string;
            const reference = if (is_nullify) request.nullify_grid_string.reference else request.inline_string.reference;
            if (is_nullify) {
                const prepared = try @import("contents_inline_fork.zig").prepareNullAvoiding(a, value, &reference, target_spans);
                const type_prepared = @import("type_declaration_relocation.zig").prepare(a, value, .{ .start = reference.start, .end = reference.end }, reference.value.bytes.len + 19, target_spans) catch |err| {
                    prepared.deinit(a);
                    return err;
                };
                defer a.free(type_prepared.relocations);
                replacements[built] = prepared.target;
                built += 1;
                output_patches[patch_count] = .{ .start = prepared.target_start, .end = prepared.target_end, .replacement = prepared.target };
                patch_count += 1;
                if (prepared.relocation) |relocation| {
                    replacements[built] = relocation;
                    built += 1;
                    output_patches[patch_count] = .{ .start = prepared.relocation_start, .end = prepared.relocation_end, .replacement = relocation };
                    patch_count += 1;
                }
                for (type_prepared.relocations) |relocation| {
                    replacements[built] = relocation.replacement;
                    built += 1;
                    output_patches[patch_count] = .{ .start = relocation.start, .end = relocation.end, .replacement = relocation.replacement };
                    patch_count += 1;
                }
                continue;
            }
            const item = request.inline_string;
            for (requests[0..i]) |prior| if (requestHasId(prior, item.new_object_id)) return error.DuplicateChartObjectId;
            const prepared = try @import("contents_inline_fork.zig").prepareAvoiding(a, value, &item.reference, item.new_object_id, item.bytes, item.trailer, target_spans);
            replacements[built] = prepared.target;
            built += 1;
            output_patches[patch_count] = .{ .start = prepared.target_start, .end = prepared.target_end, .replacement = prepared.target };
            patch_count += 1;
            if (prepared.relocation) |relocation| {
                replacements[built] = relocation;
                built += 1;
                output_patches[patch_count] = .{ .start = prepared.relocation_start, .end = prepared.relocation_end, .replacement = relocation };
                patch_count += 1;
            }
            continue;
        }
        if (request == .nullify_grid_number) {
            const item = request.nullify_grid_number;
            const replacement = try @import("grid_cell_nullify.zig").numberReplacement(a, value, item.cell, item.number);
            const type_prepared = @import("type_declaration_relocation.zig").prepare(a, value, .{ .start = item.cell.start, .end = item.cell.end }, 26, target_spans) catch |err| {
                a.free(replacement);
                return err;
            };
            defer a.free(type_prepared.relocations);
            replacements[built] = replacement;
            built += 1;
            output_patches[patch_count] = .{ .start = item.cell.start, .end = item.cell.end, .replacement = replacement };
            patch_count += 1;
            for (type_prepared.relocations) |relocation| {
                replacements[built] = relocation.replacement;
                built += 1;
                output_patches[patch_count] = .{ .start = relocation.start, .end = relocation.end, .replacement = relocation.replacement };
                patch_count += 1;
            }
            continue;
        }
        const prepared = try prepare(a, value, request, requests[0..i]);
        replacements[built] = prepared.replacement;
        built += 1;
        output_patches[patch_count] = .{ .start = prepared.start, .end = prepared.end, .replacement = prepared.replacement };
        patch_count += 1;
    }
    std.mem.sort(patches.Patch, output_patches[0..patch_count], {}, struct {
        fn lessThan(_: void, left: patches.Patch, right: patches.Patch) bool {
            return left.start < right.start;
        }
    }.lessThan);
    return patches.applyOriginal(a, value, output_patches[0..patch_count], max_output_bytes);
}

fn requestSpan(request: BatchRequest) @import("contents_inline_fork.zig").Span {
    return switch (request) {
        .font_name => |item| .{ .start = item.font.name_start, .end = item.font.name_end },
        .text_body => |item| .{ .start = item.body.text_start, .end = item.body.text_end },
        .null_text_body => |item| .{ .start = item.body.text_start, .end = item.body.text_end },
        .nullable_text_block => |item| .{ .start = item.block.text_start, .end = item.block.text_end },
        .null_nullable_text_block => |item| .{ .start = item.block.text_start, .end = item.block.text_end },
        .null_nullable_text_format => |item| .{ .start = item.format.code_start, .end = item.format.code_end },
        .null_text_format_object => |item| .{ .start = item.block.format_start, .end = item.block.format_end },
        .inline_string => |item| .{ .start = item.reference.start, .end = item.reference.end },
        .number_payload => |item| .{ .start = item.number.payload_start, .end = item.number.payload_end },
        .null_grid_string => |item| .{ .start = item.cell.start, .end = item.cell.end },
        .null_grid_number => |item| .{ .start = item.cell.start, .end = item.cell.end },
        .nullify_grid_string => |item| .{ .start = item.reference.start, .end = item.reference.end },
        .nullify_grid_number => |item| .{ .start = item.cell.start, .end = item.cell.end },
    };
}

fn requestHasId(request: BatchRequest, id: u32) bool {
    return switch (request) {
        .font_name => |item| item.new_object_id == id,
        .text_body => |item| item.new_object_id == id,
        .null_text_body => |item| item.new_object_id == id,
        .nullable_text_block => |item| item.new_object_id == id,
        .null_nullable_text_block => |item| item.new_object_id == id,
        .null_nullable_text_format => |item| item.new_object_id == id,
        .null_text_format_object => |item| item.format_object_id == id or item.code_object_id == id,
        .inline_string => |item| item.new_object_id == id,
        .number_payload => false,
        .null_grid_string => |item| item.object_id == id,
        .null_grid_number => |item| item.object_id == id,
        .nullify_grid_string, .nullify_grid_number => false,
    };
}

const Prepared = struct { start: usize, end: usize, replacement: []u8 };

fn prepare(a: std.mem.Allocator, value: *const Contents, request: BatchRequest, previous: []const BatchRequest) !Prepared {
    if (request == .number_payload) {
        const item = request.number_payload;
        const replacement = try @import("contents_number_edit.zig").replacementNumber(a, value, item.number, item.bits, item.trailer);
        return .{ .start = item.number.payload_start, .end = item.number.payload_end, .replacement = replacement };
    }
    if (request == .null_grid_string) {
        const item = request.null_grid_string;
        for (previous) |prior| if (requestHasId(prior, item.object_id)) return error.DuplicateChartObjectId;
        const replacement = try @import("grid_string_materialize.zig").replacement(a, value, item.cell, item.object_id, item.string_type_id, item.value_type_id, item.bytes, item.trailer);
        return .{ .start = item.cell.start, .end = item.cell.end, .replacement = replacement };
    }
    if (request == .null_grid_number) {
        const item = request.null_grid_number;
        for (previous) |prior| if (requestHasId(prior, item.object_id)) return error.DuplicateChartObjectId;
        const replacement = try @import("grid_number_materialize.zig").replacement(a, value, item.cell, item.object_id, item.number_type_id, item.value_type_id, item.bits, item.trailer);
        return .{ .start = item.cell.start, .end = item.cell.end, .replacement = replacement };
    }
    if (request == .null_text_format_object) {
        const item = request.null_text_format_object;
        for (previous) |prior| {
            if (requestHasId(prior, item.format_object_id) or requestHasId(prior, item.code_object_id))
                return error.DuplicateChartObjectId;
        }
        for (previous) |prior| switch (prior) {
            .null_text_format_object => |prior_item| if (prior_item.format_type_id == item.format_type_id) return error.DuplicateChartTypeId,
            else => {},
        };
        const replacement = try @import("format_materialize.zig").replacement(a, value, item.block, item.format_object_id, item.code_object_id, item.format_type_id, item.raw_word, item.bytes, item.trailer);
        return .{ .start = item.block.format_start, .end = item.block.format_end, .replacement = replacement };
    }
    const spec = switch (request) {
        .font_name => |item| Spec{ .target = Target{ .object_id = item.font.name.object_id, .start = item.font.name_start, .end = item.font.name_end, .introduced = item.font.name_introduced }, .enclosing_object_id = item.font.object_id, .new_object_id = item.new_object_id, .bytes = item.bytes, .trailer = item.trailer, .require_original = true },
        .text_body => |item| blk: {
            const string = item.body.text orelse return error.UnsupportedChartStringForkValue;
            break :blk Spec{ .target = Target{ .object_id = string.object_id, .start = item.body.text_start, .end = item.body.text_end, .introduced = item.body.text_introduced }, .enclosing_object_id = null, .new_object_id = item.new_object_id, .bytes = item.bytes, .trailer = item.trailer, .require_original = true };
        },
        .null_text_body => |item| blk: {
            if (item.body.text != null) return error.ExpectedNullChartString;
            break :blk Spec{ .target = Target{ .object_id = 0xffffffff, .start = item.body.text_start, .end = item.body.text_end, .introduced = false }, .enclosing_object_id = null, .new_object_id = item.new_object_id, .bytes = item.bytes, .trailer = item.trailer, .require_original = false };
        },
        .nullable_text_block => |item| blk: {
            const string = item.block.text orelse return error.UnsupportedChartStringForkValue;
            break :blk Spec{ .target = Target{ .object_id = string.object_id, .start = item.block.text_start, .end = item.block.text_end, .introduced = item.block.text_introduced }, .enclosing_object_id = item.block.object_id, .new_object_id = item.new_object_id, .bytes = item.bytes, .trailer = item.trailer, .require_original = true };
        },
        .null_nullable_text_block => |item| blk: {
            if (item.block.text != null) return error.ExpectedNullChartString;
            break :blk Spec{ .target = Target{ .object_id = 0xffffffff, .start = item.block.text_start, .end = item.block.text_end, .introduced = false }, .enclosing_object_id = item.block.object_id, .new_object_id = item.new_object_id, .bytes = item.bytes, .trailer = item.trailer, .require_original = false };
        },
        .null_nullable_text_format => |item| blk: {
            if (item.format.code != null) return error.ExpectedNullChartString;
            break :blk Spec{ .target = Target{ .object_id = 0xffffffff, .start = item.format.code_start, .end = item.format.code_end, .introduced = false }, .enclosing_object_id = item.format.object_id, .new_object_id = item.new_object_id, .bytes = item.bytes, .trailer = item.trailer, .require_original = false };
        },
        .null_text_format_object => unreachable,
        .inline_string => unreachable,
        .number_payload => unreachable,
        .null_grid_string => unreachable,
        .null_grid_number => unreachable,
        .nullify_grid_string => unreachable,
        .nullify_grid_number => unreachable,
    };
    for (previous) |prior| if (requestHasId(prior, spec.new_object_id)) return error.DuplicateChartObjectId;
    const replacement = try makeReplacement(a, value, spec.target, spec.enclosing_object_id, spec.new_object_id, spec.bytes, spec.trailer, spec.require_original);
    return .{ .start = spec.target.start, .end = spec.target.end, .replacement = replacement };
}

/// Replaces one existing Font String alias with a new inline String definition.
/// The caller selects the new object ID; existing aliases remain unchanged.
pub fn forkFontName(a: std.mem.Allocator, value: *const Contents, font: *const Font, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    return fork(a, value, .{ .object_id = font.name.object_id, .start = font.name_start, .end = font.name_end, .introduced = font.name_introduced }, font.object_id, new_object_id, bytes, trailer, max_output_bytes);
}

/// Replaces one existing generic String alias with a new inline definition.
pub fn forkStringReference(a: std.mem.Allocator, value: *const Contents, reference: *const Objects.Reference, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    return fork(a, value, .{ .object_id = reference.value.object_id, .start = reference.start, .end = reference.end, .introduced = reference.introduced }, null, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks the String arm of a generic value reference. Number values are not
/// silently retyped because their inline payload and trailer layout differs.
pub fn forkStringValueReference(a: std.mem.Allocator, value: *const Contents, reference: *const Objects.ValueReference, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    const string = switch (reference.value) {
        .string => |string| string,
        .number => return error.UnsupportedChartStringForkValue,
    };
    return fork(a, value, .{ .object_id = string.object_id, .start = reference.start, .end = reference.end, .introduced = reference.introduced }, null, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks the required text of an enclosing TextBlock.
pub fn forkTextBlockText(a: std.mem.Allocator, value: *const Contents, block: *const TextBlock.Block, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    return fork(a, value, .{ .object_id = block.text.object_id, .start = block.text_start, .end = block.text_end, .introduced = block.text_introduced }, block.object_id, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks non-null text from a nullable enclosing TextBlock.
pub fn forkNullableTextBlockText(a: std.mem.Allocator, value: *const Contents, block: *const TextBlock.NullableBlock, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    const string = block.text orelse return error.UnsupportedChartStringForkValue;
    return fork(a, value, .{ .object_id = string.object_id, .start = block.text_start, .end = block.text_end, .introduced = block.text_introduced }, block.object_id, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks non-null text from a base-class body without an enclosing object ID.
pub fn forkTextBodyText(a: std.mem.Allocator, value: *const Contents, body: *const TextBody, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    const string = body.text orelse return error.UnsupportedChartStringForkValue;
    return fork(a, value, .{ .object_id = string.object_id, .start = body.text_start, .end = body.text_end, .introduced = body.text_introduced }, null, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks the required String code of an enclosing TextFormat.
pub fn forkTextFormatCode(a: std.mem.Allocator, value: *const Contents, format: *const TextFormat.Format, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    return fork(a, value, .{ .object_id = format.code.object_id, .start = format.code_start, .end = format.code_end, .introduced = format.code_introduced }, format.object_id, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks the non-null String code of an enclosing nullable TextFormat.
pub fn forkNullableTextFormatCode(a: std.mem.Allocator, value: *const Contents, format: *const TextFormat.NullableFormat, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    const string = format.code orelse return error.UnsupportedChartStringForkValue;
    return fork(a, value, .{ .object_id = string.object_id, .start = format.code_start, .end = format.code_end, .introduced = format.code_introduced }, format.object_id, new_object_id, bytes, trailer, max_output_bytes);
}

const Target = struct { object_id: u32, start: usize, end: usize, introduced: bool };
const Spec = struct { target: Target, enclosing_object_id: ?u32, new_object_id: u32, bytes: []const u8, trailer: u8, require_original: bool };

fn fork(a: std.mem.Allocator, value: *const Contents, target: Target, enclosing_object_id: ?u32, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    const replacement = try makeReplacement(a, value, target, enclosing_object_id, new_object_id, bytes, trailer, true);
    defer a.free(replacement);
    return patches.applyOriginal(a, value, &.{.{ .start = target.start, .end = target.end, .replacement = replacement }}, max_output_bytes);
}

fn makeReplacement(a: std.mem.Allocator, value: *const Contents, target: Target, enclosing_object_id: ?u32, new_object_id: u32, bytes: []const u8, trailer: u8, require_original: bool) ![]u8 {
    if (bytes.len > std.math.maxInt(u16)) return error.LimitExceeded;
    try ids.requireInline(new_object_id);
    if (value.prefix.objects.entries.contains(new_object_id)) return error.DuplicateChartObjectId;
    if (enclosing_object_id != null and new_object_id == enclosing_object_id.?) return error.UnsupportedChartObjectReference;
    if (target.introduced) return error.UnsupportedChartStringForkTarget;

    const source = value.source;
    if (target.start > target.end or target.end > source.len or target.end - target.start != 4)
        return error.InvalidChartStringReferenceSpan;
    if (std.mem.readInt(u32, source[target.start..][0..4], .little) != target.object_id)
        return error.InvalidChartStringReferenceSpan;
    if (require_original) {
        const original = value.prefix.objects.entries.get(target.object_id) orelse return error.InvalidChartStringReferenceSpan;
        switch (original) {
            .string => |string| if (string.object_id != target.object_id) return error.InvalidChartStringReferenceSpan,
            else => return error.InvalidChartStringReferenceSpan,
        }
    } else if (target.object_id != 0xffffffff) {
        return error.InvalidChartStringReferenceSpan;
    }

    return @import("string_wire.zig").serializeKnown(a, value, new_object_id, bytes, trailer);
}
