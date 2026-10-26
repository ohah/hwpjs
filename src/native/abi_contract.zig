//! Additive Canvas capability metadata. No document, handle or pointer is exposed.
pub const abi_version: u32 = 1;
pub const capability_version: u32 = 1;
pub const snapshot_version: u32 = 2;
pub const render_sources_version: u32 = 3;
pub const history_v2: u32 = 4;
pub const snapshot_v2: u32 = 1;
pub const render_sources: u32 = 2;
pub const CapabilityInfo = extern struct {
    version: u32,
    struct_size: u32,
    abi_version: u32,
    snapshot_version: u32,
    render_sources_version: u32,
    flags: u32,
};
// Header generation reads the declarations and actual exported signatures.
pub const CanvasExport = struct { name: []const u8, guard: enum { always, snapshot, render } };
pub const canvas_exports = [_]CanvasExport{
    .{ .name = "hwp_native_capabilities", .guard = .always },
    .{ .name = "hwp_native_snapshot_v2", .guard = .snapshot },
    .{ .name = "hwp_native_snapshot_window_v2", .guard = .snapshot },
    .{ .name = "hwp_native_render_sources", .guard = .render },
    .{ .name = "hwp_native_picture_bytes", .guard = .render },
};
