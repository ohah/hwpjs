#pragma once
#import "HwpNativeCanvas.h"
#include <jsi/jsi.h>
#include <functional>
#include <memory>
#include <atomic>
// Explicit prototype injection from the app's runtime executor. The app must
// invalidate alive before shutting that executor down. No globals/autolink claim.
facebook::jsi::Object createHwpCanvasHost(facebook::jsi::Runtime &,HwpNativeCanvas *,CGRect initialBounds,
 std::function<void(std::function<void(facebook::jsi::Runtime &)>)> postRuntime,
 std::shared_ptr<std::atomic<bool>> alive);
