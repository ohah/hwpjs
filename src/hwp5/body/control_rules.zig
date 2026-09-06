/// MAKE_4CHID is numeric, not a trimmed string or wildcard pattern.
pub fn id(comptime name: *const [4]u8) u32 {
    return @as(u32, name[0]) << 24 | @as(u32, name[1]) << 16 | @as(u32, name[2]) << 8 | name[3];
}
pub const section_id = id("secd");
pub const column_id = id("cold");
pub const table_id = id("tbl ");
pub const drawing_id = id("gso ");
pub const equation_id = id("eqed");
pub const Rule = struct { control_id: u32, code: u16 };
/// Official tables 6, 127, 128; equation is an object control.
pub const rules = [_]Rule{
    .{ .control_id = section_id, .code = 2 },
    .{ .control_id = column_id, .code = 2 },
    .{ .control_id = id("%unk"), .code = 3 },
    .{ .control_id = id("%dte"), .code = 3 },
    .{ .control_id = id("%ddt"), .code = 3 },
    .{ .control_id = id("%pat"), .code = 3 },
    .{ .control_id = id("%bmk"), .code = 3 },
    .{ .control_id = id("%mmg"), .code = 3 },
    .{ .control_id = id("%xrf"), .code = 3 },
    .{ .control_id = id("%fmu"), .code = 3 },
    .{ .control_id = id("%clk"), .code = 3 },
    .{ .control_id = id("%smr"), .code = 3 },
    .{ .control_id = id("%usr"), .code = 3 },
    .{ .control_id = id("%hlk"), .code = 3 },
    .{ .control_id = id("%sig"), .code = 3 },
    .{ .control_id = id("%%*d"), .code = 3 },
    .{ .control_id = id("%%*a"), .code = 3 },
    .{ .control_id = id("%%*C"), .code = 3 },
    .{ .control_id = id("%%*S"), .code = 3 },
    .{ .control_id = id("%%*T"), .code = 3 },
    .{ .control_id = id("%%*P"), .code = 3 },
    .{ .control_id = id("%%*L"), .code = 3 },
    .{ .control_id = id("%%*c"), .code = 3 },
    .{ .control_id = id("%%*h"), .code = 3 },
    .{ .control_id = id("%%*A"), .code = 3 },
    .{ .control_id = id("%%*i"), .code = 3 },
    .{ .control_id = id("%%*t"), .code = 3 },
    .{ .control_id = id("%%*r"), .code = 3 },
    .{ .control_id = id("%%*l"), .code = 3 },
    .{ .control_id = id("%%*n"), .code = 3 },
    .{ .control_id = id("%%*e"), .code = 3 },
    .{ .control_id = id("%spl"), .code = 3 },
    .{ .control_id = id("%%mr"), .code = 3 },
    .{ .control_id = id("%%me"), .code = 3 },
    .{ .control_id = id("%cpr"), .code = 3 },
    .{ .control_id = id("%toc"), .code = 3 },
    .{ .control_id = table_id, .code = 11 },
    .{ .control_id = drawing_id, .code = 11 },
    .{ .control_id = equation_id, .code = 11 },
    .{ .control_id = id("tcmt"), .code = 15 },
    .{ .control_id = id("head"), .code = 16 },
    .{ .control_id = id("foot"), .code = 16 },
    .{ .control_id = id("fn  "), .code = 17 },
    .{ .control_id = id("en  "), .code = 17 },
    .{ .control_id = id("atno"), .code = 18 },
    .{ .control_id = id("nwno"), .code = 21 },
    .{ .control_id = id("pghd"), .code = 21 },
    .{ .control_id = id("pgct"), .code = 21 },
    .{ .control_id = id("pgnp"), .code = 21 },
    .{ .control_id = id("idxm"), .code = 22 },
    .{ .control_id = id("bokm"), .code = 22 },
    .{ .control_id = id("tcps"), .code = 23 },
    .{ .control_id = id("tdut"), .code = 23 },
};
pub fn expectedCode(control_id: u32) ?u16 {
    for (rules) |r| if (r.control_id == control_id) return r.code;
    return null;
}
pub const CodeMatch = enum { specified, observed_hidden_comment, unknown, invalid };
/// Keep table 6's code 15 and the observed tcmt/code 23 representation distinct.
pub fn classifyCode(control_id: u32, code: u16) CodeMatch {
    const expected = expectedCode(control_id) orelse return .unknown;
    if (code == expected) return .specified;
    if (control_id == id("tcmt") and code == 23) return .observed_hidden_comment;
    return .invalid;
}
