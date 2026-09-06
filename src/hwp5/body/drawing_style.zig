const Reader = @import("../../binary/reader.zig").Reader;
const border = @import("shape_border.zig");
const Fill = @import("../docinfo/fill.zig").Fill;
const Alpha = @import("../docinfo/fill_alpha.zig").Alpha;
const Shadow = @import("shadow.zig").Shadow;
pub const Tail = union(enum) {
    known: struct { alpha: Alpha, shadow: Shadow, extra: []const u8 },
    unknown: []const u8,
};
/// Explicit observed drawing style: border, existing Fill envelope, per-type bytes, shadow.
/// Kind-specific selection and document integration belong to the caller.
pub const Style = struct {
    border: border.Border,
    fill: Fill,
    tail: Tail,
    pub fn parse(bytes: []const u8, layout: border.Layout) !Style {
        var r: Reader = .{ .bytes = bytes };
        const line = try border.Border.read(&r, layout);
        const fill = try Fill.parse(bytes[r.offset..]);
        const tail: Tail = switch (fill.data) {
            .unknown => |raw| .{ .unknown = raw },
            .known => |known| blk: {
                var rest: Reader = .{ .bytes = known.extra };
                const alpha = try Alpha.read(&rest, fill.flags);
                const shadow = try Shadow.read(&rest);
                break :blk .{ .known = .{ .alpha = alpha, .shadow = shadow, .extra = known.extra[rest.offset..] } };
            },
        };
        return .{ .border = line, .fill = fill, .tail = tail };
    }
};
