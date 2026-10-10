//! Compatibility entrypoint; shared numeric syntax belongs to the model layer.
const shared = @import("../../model/formula_range.zig");
pub const Function = shared.Function;
pub const Axis = shared.Axis;
pub const Address = shared.Address;
pub const Cell = shared.Cell;
pub const Rectangle = shared.Rectangle;
pub const Range = shared.Range;
pub const resolveAddress = shared.resolveAddress;
