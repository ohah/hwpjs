const core = @import("hwpjs");
const Options = @FieldType(core.image.bmp_pixels.Options, "rle");
pub fn read(r: *core.Reader) !Options {
    const enabled = try r.readInt(u8);
    const fill = try r.readInt(u8);
    const padding = try r.readInt(u8);
    const full = try r.readInt(u8);
    const trailing = try r.readInt(u8);
    const indices = try r.readInt(u32);
    const commands = try r.readInt(u32);
    const compressed = try r.readInt(u32);
    if (enabled > 1 or fill > 2 or padding > 1 or full > 1 or trailing > 1) return error.InvalidMode;
    if (enabled == 0) return null;
    return .{ .unwritten = switch (fill) {
        0 => .reject,
        1 => .palette_zero,
        else => .transparent,
    }, .raster = .{
        .commands = .{ .padding = if (padding == 0) .require_zero else .preserve, .max_commands = commands, .max_bytes = compressed },
        .completion = if (full == 1) .require_full else .preserve_unwritten,
        .allow_trailing_bytes = trailing == 1,
        .max_index_bytes = indices,
    } };
}
