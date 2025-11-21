// Placeholder implementation for Node.js bindings
// This will be properly initialized with NAPI-RS CLI

use hwp_core::HwpParser;

/// Hello World placeholder function
#[no_mangle]
pub extern "C" fn hello_from_rust() -> *const u8 {
    b"Hello from hwp-node Rust!\0".as_ptr()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hello() {
        let _parser = HwpParser::new();
        assert!(true);
    }
}
