const std = @import("std");
const samples = @import("progressive_samples.zig");
const render = @import("jfif_render.zig");
const Report = @import("progressive.zig").Report;

pub const Options = struct { samples: samples.Options, render: render.Options };
pub const Result = struct {
    image: render.Image,
    components: u8,
    progression: Report,
    /// Only the first components entries are active; 255 means unseen.
    levels: [4][64]u8,

    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        self.image.deinit(a);
        self.* = undefined;
    }
};

/// Explicit progressive JFIF interpretation, not process/colour guessing.
/// Completion policy, interpolation and unmanaged colour must be selected.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Result {
    var prepared = try render.Prepared.init(a, bytes, options.samples.frame.structure, options.render);
    defer prepared.deinit(a);
    var planes = try samples.decode(a, bytes, options.samples);
    defer planes.deinit(a);
    return .{
        .image = try prepared.render(a, planes.image),
        .components = @intCast(planes.image.planes.len),
        .progression = planes.progression,
        .levels = planes.levels,
    };
}
