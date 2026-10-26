const std = @import("std");
const t = std.testing;
const protocol = @import("protocol.zig");
const measure =
    \\{"operation":"measure","source":"x over y","size":20,"script_scale":0.5,"fraction_scale":0.75}
;
const layout =
    \\{"operation":"layout","source":"x over y","size":20,"script_scale":0.5,"fraction_scale":0.75,"measurements":[{"request":0,"box":{"width":7.5,"ascent":9,"descent":3}},{"request":1,"box":{"width":7.5,"ascent":9,"descent":3}}],"layout":{"fraction":{"padding":0.1,"gap":0.1,"rule_thickness":0.05,"axis":0.25},"script":{"gap":0.1,"superscript_shift":0.5,"subscript_shift":0.3,"clearance":0.1},"normal_space":0.25,"thin_space":0.1}}
;
fn check(a: std.mem.Allocator, input: []const u8) !void {
    const output = try protocol.run(a, input);
    defer a.free(output);
    const parsed = try std.json.parseFromSlice(std.json.Value, a, output, .{});
    defer parsed.deinit();
    if (std.mem.eql(u8, input, measure)) {
        try t.expect(parsed.value.object.get("ready").?.bool);
        try t.expectEqual(@as(usize, 2), parsed.value.object.get("requests").?.array.items.len);
    } else {
        try t.expectEqual(@as(usize, 2), parsed.value.object.get("glyphs").?.array.items.len);
        try t.expectEqual(@as(usize, 1), parsed.value.object.get("rules").?.array.items.len);
        try t.expectEqual(@as(f64, 11.5), parsed.value.object.get("box").?.object.get("width").?.float);
    }
}
test "equation protocol performs both stateless phases and releases every allocation" {
    try @import("../testing/allocation_failures.zig").check(check, .{measure});
    try @import("../testing/allocation_failures.zig").check(check, .{layout});
}
test "equation protocol refuses missing phase inputs and malformed JSON" {
    try t.expectError(error.InvalidEquationProtocolOperation, protocol.run(t.allocator,
        \\{"operation":"layout","source":"x","size":20,"script_scale":0.5,"fraction_scale":0.75}
    ));
    try t.expectError(error.UnknownField, protocol.run(t.allocator,
        \\{"operation":"measure","source":"x","size":20,"script_scale":0.5,"fraction_scale":0.75,"extra":true}
    ));
}
