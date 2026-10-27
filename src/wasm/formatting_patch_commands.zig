//! Lower the validated ephemeral plan, then call History.applyBatch once.
const std = @import("std");
const m = @import("../model/formatting_patch.zig");
const Format = @import("../model/document.zig").Format;
pub fn Command(comptime format: Format) type {
    return if (format == .hwp5) @import("../hwp5/edit/style_preservation.zig").Command else @import("../hwpx/editor_history.zig").Command;
}
pub fn build(comptime format: Format, a: std.mem.Allocator, operations: []const m.Operation) ![]Command(format) {
    if (operations.len > m.limits.commands) return error.LimitExceeded;
    const output = try a.alloc(Command(format), operations.len);
    errdefer a.free(output);
    for (operations, output) |op, *command| {
        command.* = if (format == .hwp5) switch (op) {
            .character_resource => |v| .{ .set_character_format = .{ .section = v.owner.section, .paragraph = v.owner.paragraph, .start_unit = v.range.startUnit, .end_unit = v.range.endUnit, .char_shape_id = v.id } },
            .paragraph_resource => |v| .{ .set_paragraph_format = .{ .section = v.owner.section, .paragraph = v.owner.paragraph, .para_shape_id = std.math.cast(u16, v.id) orelse return error.InvalidParagraphShapeReference } },
            .paragraph_border_fill => |v| .{ .set_paragraph_border_fill = .{ .section = v.owner.section, .paragraph = v.owner.paragraph, .patch = v.value, .flags = v.flags } },
            .character => |v| .{ .set_character_properties = .{ .section = v.owner.section, .paragraph = v.owner.paragraph, .start_unit = v.range.startUnit, .end_unit = v.range.endUnit, .properties = v.patch } },
            .font_name => |v| .{ .set_character_font_name = .{ .section = v.owner.section, .paragraph = v.owner.paragraph, .start_unit = v.range.startUnit, .end_unit = v.range.endUnit, .language = v.language, .name = v.name } },
            .paragraph_flags => |v| .{ .set_paragraph_flags = .{ .section = v.owner.section, .paragraph = v.owner.paragraph, .flags = v.value } },
            .alignment => |v| .{ .set_paragraph_alignment = .{ .section = v.owner.section, .paragraph = v.owner.paragraph, .alignment = hwp5Alignment(v.value) } },
            .margins => |v| .{ .set_paragraph_margins = .{ .section = v.owner.section, .paragraph = v.owner.paragraph, .margins = v.value } },
            .spacing => |v| .{ .set_paragraph_spacing = .{ .section = v.owner.section, .paragraph = v.owner.paragraph, .spacing = v.value } },
        } else switch (op) {
            .character_resource => |v| .{ .kind = .format, .section = v.owner.section, .paragraph = v.owner.paragraph, .start = v.range.startUnit, .deleted = v.range.endUnit - v.range.startUnit, .inserted = "", .char_shape_id = v.id },
            .paragraph_resource => |v| .{ .kind = .paragraph_format, .section = v.owner.section, .paragraph = v.owner.paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_shape_id = v.id },
            .paragraph_border_fill => |v| .{ .kind = .paragraph_border_fill, .section = v.owner.section, .paragraph = v.owner.paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_border_fill = v.value, .paragraph_flags = v.flags },
            .character => |v| .{ .kind = .character_properties, .section = v.owner.section, .paragraph = v.owner.paragraph, .start = v.range.startUnit, .deleted = v.range.endUnit - v.range.startUnit, .inserted = "", .character_properties = v.patch },
            .font_name => |v| .{ .kind = .character_font_name, .section = v.owner.section, .paragraph = v.owner.paragraph, .start = v.range.startUnit, .deleted = v.range.endUnit - v.range.startUnit, .inserted = "", .font_language = @fromBackingInt(@backingInt(v.language)), .font_name = v.name },
            .paragraph_flags => |v| .{ .kind = .paragraph_flags, .section = v.owner.section, .paragraph = v.owner.paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_flags = v.value },
            .alignment => |v| .{ .kind = .paragraph_alignment, .section = v.owner.section, .paragraph = v.owner.paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_alignment = std.meta.stringToEnum(@import("../hwpx/paragraph_resource_clone.zig").Alignment, @tagName(v.value)).? },
            .margins => |v| .{ .kind = .paragraph_margins, .section = v.owner.section, .paragraph = v.owner.paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_margins = v.value },
            .spacing => |v| .{ .kind = .paragraph_spacing, .section = v.owner.section, .paragraph = v.owner.paragraph, .start = 0, .deleted = 0, .inserted = "", .paragraph_spacing = v.value },
        };
    }
    return output;
}
pub fn apply(comptime format: Format, a: std.mem.Allocator, history: anytype, session: anytype, operations: []const m.Operation) !bool {
    if (operations.len == 0) return false;
    const commands = try build(format, a, operations);
    defer a.free(commands);
    // No loop over exported setters. The existing owned history controls rollback,
    // final save validation, checkpoint budget and poison on uncertain recovery.
    return history.applyBatch(session, commands);
}
fn hwp5Alignment(value: m.Alignment) u32 {
    return switch (value) {
        .JUSTIFY => 0,
        .LEFT => 1,
        .RIGHT => 2,
        .CENTER => 3,
        .DISTRIBUTE => 4,
        .DISTRIBUTE_SPACE => 5,
    };
}
