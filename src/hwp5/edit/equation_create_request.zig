//! Native request-only values. No UI lease, raw blob, or paragraph ordinal.
const std = @import("std");
pub const Profile = @import("equation_create_profile.zig").Profile;
pub const Box = struct { width: u32, height: u32 };
pub const Target = struct {
    section: usize,
    binding: ?@import("../../model/history_mutation_epoch.zig").Ticket = null,
    anchor: @import("created_table_anchor.zig").Anchor,
};
pub const Request = struct {
    target: Target,
    script: []const u8,
    font_size: u32,
    box: Box,
    color_rgb: u32,
    baseline: i16,
    line_mode: bool,
    profile: Profile,
};
pub const max_script_bytes: usize = 65535 * 4;
pub fn validate(request: Request) !usize {
    if (request.script.len == 0) return error.EmptyEquationScript;
    if (request.script.len > max_script_bytes) return error.LimitExceeded;
    if (!std.unicode.utf8ValidateSlice(request.script)) return error.InvalidEquationScriptEncoding;
    const units = std.unicode.calcUtf16LeLen(request.script) catch return error.InvalidEquationScriptEncoding;
    if (units > 65535) return error.LimitExceeded;
    if (request.font_size == 0 or request.font_size > std.math.maxInt(i32)) return error.InvalidEquationFontSize;
    if (request.box.width == 0 or request.box.height == 0 or request.box.width > std.math.maxInt(i32) or request.box.height > std.math.maxInt(i32)) return error.InvalidEquationBox;
    try @import("../../model/rgb_color.zig").validate(request.color_rgb);
    switch (request.target.anchor.host) {
        .original_node => {}, // Native physical source node zero is valid.
        .generated_instance => |id| if (id == 0) return error.SourceBindingMismatch,
    }
    return units;
}
