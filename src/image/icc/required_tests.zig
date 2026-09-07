const std = @import("std");
const t = std.testing;
const plan = @import("required_plan.zig");
const presence = @import("required_presence.zig");
const tags = @import("required_tag_set.zig");
fn context(class: @import("signatures.zig").ProfileClass, model: plan.Model) plan.Context {
    return .{ .edition = .v4_2022, .profile_class = class, .model = model, .data_space = "RGB ".*, .pcs = "XYZ ".*, .measurement_white = .unknown };
}
test "required v4 obligations distinguish class models and unknown measurement" {
    const cases = .{ .{ .input, .lut, 4 }, .{ .display, .lut, 5 }, .{ .output, .lut, 10 }, .{ .input, .matrix, 9 }, .{ .display, .matrix, 9 }, .{ .device_link, .single, 4 }, .{ .color_space, .single, 5 }, .{ .abstract, .single, 4 }, .{ .named_color, .single, 4 } };
    inline for (cases) |c| {
        var ctx = context(c[0], c[1]);
        if (c[0] == .abstract) ctx.data_space = "Lab ".*;
        const p = try plan.build(ctx);
        try t.expectEqual(@as(usize, c[2]), p.required.count());
        try t.expectEqual(c[0] != .device_link, p.adaptation_condition_deferred);
        ctx.measurement_white = .different;
        const q = try plan.build(ctx);
        try t.expectEqual(c[0] != .device_link, q.required.contains(.chad));
    }
}
test "required xCLR input output obligations and model constraints" {
    var ctx = context(.device_link, .single);
    ctx.data_space = "4CLR".*;
    ctx.pcs = "CMYK".*;
    var p = try plan.build(ctx);
    try t.expect(p.required.contains(.clrt) and !p.required.contains(.clot));
    ctx.data_space = "CMYK".*;
    ctx.pcs = "FCLR".*;
    p = try plan.build(ctx);
    try t.expect(!p.required.contains(.clrt) and p.required.contains(.clot));
    ctx = context(.input, .matrix);
    ctx.data_space = "3CLR".*;
    _ = try plan.build(ctx);
    ctx.pcs = "Lab ".*;
    try t.expectError(error.InvalidIccRequiredModel, plan.build(ctx));
    ctx = context(.output, .matrix);
    try t.expectError(error.InvalidIccRequiredModel, plan.build(ctx));
    ctx = context(.input, .monochrome);
    try t.expectError(error.InvalidIccRequiredModel, plan.build(ctx));
    ctx.data_space = "GRAY".*;
    ctx.pcs = "Lab ".*;
    try t.expect((try plan.build(ctx)).required.contains(.kTRC));
    ctx.edition = .v2_2001;
    try t.expectError(error.UnsupportedIccRequiredEdition, plan.build(ctx));
}
test "presence never certifies payloads and does not guess white from tags" {
    const ctx = context(.input, .lut);
    const inventory = [_][4]u8{ "A2B0".*, "cprt".*, "wtpt".*, "desc".*, "chad".*, "zzzz".* };
    const r = try presence.inspect(ctx, &inventory);
    try t.expectEqual(@as(usize, 0), r.missing.count());
    try t.expect(r.adaptation_condition_deferred and r.payloads_deferred and r.computational_model_deferred);
    for (inventory[0..4], 0..) |name, omit| {
        var reduced: [3][4]u8 = undefined;
        var pos: usize = 0;
        for (inventory[0..4], 0..) |v, i| if (i != omit) {
            reduced[pos] = v;
            pos += 1;
        };
        const result = try presence.inspect(ctx, &reduced);
        try t.expectEqual(@as(usize, 1), result.missing.count());
        try t.expect(result.missing.contains(tags.identify(name).?));
    }
}
