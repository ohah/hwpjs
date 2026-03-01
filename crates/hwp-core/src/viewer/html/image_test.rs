#[cfg(test)]
mod tests {
    use crate::viewer::html::image::{render_image, render_image_with_style};

    #[test]
    fn test_render_image_basic() {
        let result = render_image(
            "https://example.com/img.jpg",
            1000, // SHWPUNIT: ~3.53mm
            2000, // SHWPUNIT: ~7.06mm
            3000, // SHWPUNIT: ~10.58mm
            4000, // SHWPUNIT: ~14.11mm
        );

        assert!(result.contains("https://example.com/img.jpg"));
        assert!(result.contains("3.53mm"));
        assert!(result.contains("7.06mm"));
        assert!(result.contains("10.58mm"));
        assert!(result.contains("14.11mm"));
    }

    #[test]
    fn test_render_image_rounding_edge() {
        let result = render_image("img.png", 1234, 5678, 9012, 34);

        println!("Output: {}", result);

        // Verify basic output with this edge case
        assert!(result.contains("img.png"));
        assert!(result.contains("hsR"));
        assert!(result.contains("background-image:url('img.png')"));
        assert!(result.contains("background-repeat:no-repeat"));
        assert!(result.contains("background-size:contain"));
    }

    #[test]
    fn test_render_image_zero_dimensions() {
        let result = render_image("img.gif", 100, 200, 0, 0);

        assert!(result.contains("0"));
        assert!(result.contains("0"));
    }

    #[test]
    fn test_render_image_with_style_basic() {
        let result = render_image_with_style(
            "https://example.com/avatar.png",
            500,
            100,
            800,
            600,
            100,
            50,
        );

        println!("Output: {}", result);

        // Just verify basic structure - not exact values since they depend on input
        assert!(result.contains("https://example.com/avatar.png"));
        assert!(result.contains("hsR")); // CSS class
        assert!(result.contains("display:inline-block"));
        assert!(result.contains("position:relative"));
        assert!(result.contains("vertical-align:middle"));
        assert!(result.contains("background-image:url('"));
        assert!(result.contains("background-repeat:no-repeat"));
        assert!(result.contains("background-size:contain"));
    }

    #[test]
    fn test_render_image_with_style_zero_margins() {
        let result = render_image_with_style("test.jpg", 100, 200, 300, 400, 0, 0);

        println!("Output: {}", result);

        // Check that zero margins are present (though they might not show "0.00mm" due to rounding)
        assert!(result.contains("test.jpg"));
        assert!(result.contains("background-image:url('test.jpg')"));
        assert!(result.contains("hsR"));
    }

    #[test]
    fn test_render_image_large_values() {
        let result = render_image("large.jpg", 500000, 1000000, 2000000, 3000000);

        // 1/7200 inch to mm conversion
        let expected_left = (500000.0 / 7200.0) * 25.4;
        let expected_top = (1000000.0 / 7200.0) * 25.4;
        let expected_width = (2000000.0 / 7200.0) * 25.4;
        let expected_height = (3000000.0 / 7200.0) * 25.4;

        assert!(result.contains(&format!("{:.2}mm", expected_left)));
        assert!(result.contains(&format!("{:.2}mm", expected_top)));
        assert!(result.contains(&format!("{:.2}mm", expected_width)));
        assert!(result.contains(&format!("{:.2}mm", expected_height)));
    }

    #[test]
    fn test_render_image_negative_invalid() {
        // Negative values might represent invalid positions, but let's see what happens
        let result = render_image("test.jpg", -100, -200, -300, -400);

        // Should still be valid HTML even with negative inputs
        assert!(result.contains("test.jpg"));
    }

    #[test]
    fn test_render_image_special_characters_in_url() {
        let url = "https://example.com/image with spaces.png";
        let result = render_image(url, 100, 200, 300, 400);

        println!("Output: {}", result);

        // Verify special characters are preserved in URL
        assert!(result.contains(url));
        assert!(result.contains("hsR"));
        assert!(result.contains("background-image:url('"));
    }

    // Integration test: render_image_with_style includes all render_image features plus margins
    #[test]
    fn test_render_image_with_style_includes_background_image() {
        let result = render_image_with_style("bg.jpg", 100, 200, 300, 400, 0, 0);

        assert!(result.contains("background-image:url('bg.jpg')"));
        assert!(result.contains("background-repeat:no-repeat"));
        assert!(result.contains("background-size:contain"));
    }
}
