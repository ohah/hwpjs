const Base = @import("power_preimage_bounds_impl.zig").Of(128);
pub const Coordinate = Base.Coordinate;
pub const Endpoint = Base.Endpoint;
pub const Bounds = Base.Bounds;
pub const Result = Base.Result;
pub const inspect = Base.inspect;
pub const Wide = @import("power_preimage_bounds_impl.zig").Of(512);
