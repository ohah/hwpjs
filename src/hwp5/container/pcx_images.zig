const std = @import("std");
const pcx = @import("../../image/pcx/structure.zig");

pub const Options = pcx.Options;

/// Scalar evidence only; no decoded plane or palette survives the call.
pub const Report = struct {
    images: usize = 0,
    decoded_bytes: usize = 0,
    encoded_bytes: usize = 0,
    palette_images: usize = 0,
    extension_disagreements: usize = 0,

    pub fn plus(self: Report, other: Report) !Report {
        var result: Report = .{};
        inline for (std.meta.fields(Report)) |field| {
            @field(result, field.name) = std.math.add(usize, @field(self, field.name), @field(other, field.name)) catch return error.LimitExceeded;
        }
        return result;
    }
};

pub fn inspect(bytes: []const u8, selected: Options, remaining_decoded: usize) !Report {
    var options = selected;
    options.max_decoded_bytes = @min(options.max_decoded_bytes, remaining_decoded);
    const parsed = try pcx.inspect(bytes, options);
    return .{
        .images = 1,
        .decoded_bytes = parsed.decoded_bytes,
        .encoded_bytes = parsed.encoded_bytes,
        .palette_images = @intFromBool(parsed.has_vga_palette),
    };
}
