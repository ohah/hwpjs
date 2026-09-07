const core = @import("hwpjs");
pub fn read(r: *core.Reader) !?core.hwp5.form_validation.Options {
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidMode;
    const forms = try r.readInt(u32);
    const bytes = try r.readInt(u32);
    const nodes = try r.readInt(u32);
    const depth = try r.readInt(u32);
    return if (mode == 0) null else .{ .max_forms = forms, .properties = .{ .max_input_bytes = bytes, .max_nodes = nodes, .max_depth = depth } };
}
