const tag = @import("xyz_tag.zig");
const signatures = @import("signatures.zig");
const illuminant = @import("pcs_illuminant.zig");
pub const Report = struct {
    /// Other tags, measurement data, or a computational model still need checking.
    context_deferred: bool,
    /// Diagnostic for the NOTE in ICC.1:2022 9.2.33, not a normative hard error.
    luminance_unused_nonzero: bool,
};
/// Explicit ICC.1:2022 policy, not inferred from a profile's major version.
/// Does not validate header identifiers, tag presence, or the whole profile.
pub fn inspectV4(class: signatures.ProfileClass, value: tag.Value) !Report {
    if (value.kind == .white_point and class == .display) {
        try illuminant.validateV4(value.xyz);
        return .{ .context_deferred = false, .luminance_unused_nonzero = false };
    }
    return .{
        .context_deferred = true,
        .luminance_unused_nonzero = value.kind == .luminance and (value.xyz[0] != 0 or value.xyz[2] != 0),
    };
}
