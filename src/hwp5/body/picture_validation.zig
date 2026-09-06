const Tree = @import("tree.zig").Tree;
const picture = @import("shape_picture.zig");
const tail = @import("picture_tail.zig");
pub const TailOptions = struct { additional: ?tail.additional.Layout = null };
pub const Options = struct {
    layout: picture.Layout = .interleaved,
    prefix: picture.Prefix = .base73,
    tail: ?TailOptions = null,
    pub fn validate(self: Options) !void {
        if (self.tail != null and self.prefix != .with_instance78) return error.InvalidPictureOptions;
    }
};
pub const Report = struct { pictures: usize = 0, unknown_image_effects: usize = 0, pending_references: usize = 0, parsed_tails: usize = 0, additional_properties: usize = 0, alpha_values: usize = 0, extra_bytes: usize = 0 };
pub fn inspect(tree: Tree, options: Options) !Report {
    try options.validate();
    var report: Report = .{};
    for (0..tree.nodes.len) |index| {
        const child = (@import("owned_record.zig").componentChild(tree, index, @import("control_rules.zig").id("$pic"), picture.tag) catch |err| return switch (err) {
            error.OrphanChildRecord => error.OrphanPicture,
            error.MissingChildRecord => error.MissingPicture,
            error.DuplicateChildRecord => error.DuplicatePicture,
            else => err,
        }) orelse continue;
        const p = try picture.Picture.parse(tree.nodes[child].record.framing.payload, options.layout, options.prefix);
        report.pictures += 1;
        report.unknown_image_effects += @intFromBool(p.image.effect > 3);
        report.pending_references += 1;
        var r: @import("../../binary/reader.zig").Reader = .{ .bytes = p.extra };
        if (options.tail) |selection| {
            const parsed = try tail.Tail.read(&r, selection.additional);
            report.parsed_tails += 1;
            if (parsed.properties) |properties| {
                report.additional_properties += 1;
                report.alpha_values += @intFromBool(properties.alpha != null);
            }
        }
        report.extra_bytes += r.bytes.len - r.offset;
    }
    return report;
}
