const std = @import("std");
const signatures = @import("signatures.zig");
const tags = @import("required_tag_set.zig");
pub const Model = enum { lut, matrix, monochrome, single };
/// Whether the measurement adopted white differs in chromaticity from PCS white.
pub const MeasurementWhite = enum { unknown, same, different };
pub const Context = struct {
    edition: @import("edition.zig").Edition,
    profile_class: signatures.ProfileClass,
    data_space: [4]u8,
    pcs: [4]u8,
    model: Model,
    measurement_white: MeasurementWhite,
};
pub const Plan = struct { required: tags.Set, adaptation_condition_deferred: bool };
/// ICC.1:2022 8.2-8.9 presence obligations, not payload or transform validity.
pub fn build(ctx: Context) !Plan {
    if (ctx.edition != .v4_2022) return error.UnsupportedIccRequiredEdition;
    const channels = try signatures.channels(ctx.data_space);
    _ = try signatures.channels(ctx.pcs);
    if (ctx.profile_class != .device_link and !signatures.isPcs(ctx.pcs)) return error.InvalidIccPcs;
    var required = tags.Set.initMany(&.{ .desc, .cprt });
    const link = ctx.profile_class == .device_link;
    if (!link) {
        required.insert(.wtpt);
        if (ctx.measurement_white == .different) required.insert(.chad);
    }
    switch (ctx.profile_class) {
        .input, .display, .output => switch (ctx.model) {
            .lut => {
                required.insert(.A2B0);
                if (ctx.profile_class != .input) required.insert(.B2A0);
                if (ctx.profile_class == .output) {
                    for ([_]tags.Name{ .A2B1, .A2B2, .B2A1, .B2A2, .gamt }) |tag| required.insert(tag);
                    if (isXclr(ctx.data_space)) required.insert(.clrt);
                }
            },
            .matrix => {
                if (ctx.profile_class == .output or channels != 3 or !std.mem.eql(u8, &ctx.pcs, "XYZ ")) return error.InvalidIccRequiredModel;
                for ([_]tags.Name{ .rXYZ, .gXYZ, .bXYZ, .rTRC, .gTRC, .bTRC }) |tag| required.insert(tag);
            },
            .monochrome => {
                if (!std.mem.eql(u8, &ctx.data_space, "GRAY")) return error.InvalidIccRequiredModel;
                required.insert(.kTRC);
            },
            .single => return error.InvalidIccRequiredModel,
        },
        .device_link, .color_space, .abstract, .named_color => {
            if (ctx.model != .single) return error.InvalidIccRequiredModel;
            switch (ctx.profile_class) {
                .device_link => {
                    required.insert(.pseq);
                    required.insert(.A2B0);
                    if (isXclr(ctx.data_space)) required.insert(.clrt);
                    if (isXclr(ctx.pcs)) required.insert(.clot);
                },
                .color_space => {
                    required.insert(.A2B0);
                    required.insert(.B2A0);
                },
                .abstract => {
                    if (!signatures.isPcs(ctx.data_space)) return error.InvalidIccRequiredModel;
                    required.insert(.A2B0);
                },
                .named_color => required.insert(.ncl2),
                else => unreachable,
            }
        },
    }
    return .{ .required = required, .adaptation_condition_deferred = !link and ctx.measurement_white == .unknown };
}
// Both spaces are validated before this suffix test. CMYK is deliberately distinct.
fn isXclr(space: [4]u8) bool {
    return std.mem.eql(u8, space[1..], "CLR");
}
