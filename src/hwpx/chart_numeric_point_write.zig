//! Compatibility boundary: this entrypoint still accepts numeric points only.
pub const Edit = @import("chart_point_write.zig").Edit;
pub const validate = @import("chart_point_write.zig").validateNumeric;
pub const write = @import("chart_point_write.zig").writeNumeric;
