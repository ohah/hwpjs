use craby::{prelude::*, throw};

use crate::ffi::bridging::*;
use crate::generated::*;
use hwp_core::HwpParser;

pub struct ReactNative {
    ctx: Context,
}

#[craby_module]
impl ReactNativeSpec for ReactNative {
    fn hwp_parser(&mut self, data: Array<Number>) -> String {
        // Array<Number> (Vec<f64>)를 Vec<u8>로 변환
        let data: Vec<u8> = data.iter().map(|&n| n as u8).collect();

        let parser = HwpParser::new();
        let document = parser.parse(&data)
            .unwrap_or_else(|e| throw!("{}", e));

        serde_json::to_string(&document)
            .unwrap_or_else(|e| throw!("Failed to serialize to JSON: {}", e))
    }

    fn add(&mut self, a: Number, b: Number) -> Number {
        a + b
    }

    fn divide(&mut self, a: Number, b: Number) -> Number {
        if b == 0.0 {
            throw!("Division by zero");
        }
        a / b
    }

    fn multiply(&mut self, a: Number, b: Number) -> Number {
        a * b
    }

    fn subtract(&mut self, a: Number, b: Number) -> Number {
        a - b
    }
}
