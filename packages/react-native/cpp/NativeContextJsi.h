#pragma once
#include "NativeJsiBinding.h"
#include <functional>
namespace hwpjs {
// Both callbacks are supplied by the platform owner. Native tasks must execute in
// FIFO on one native queue. Runtime callbacks execute only while Runtime is alive.
// Neither queue is permitted to wait for the other. No JSI values enter native work.
struct NativeContextSchedulers {
  std::function<void(std::function<void()>)> postNative;
  std::function<void(std::function<void(facebook::jsi::Runtime &)>)> postRuntime;
};
// Low-level packet service, NOT a second EditorRuntime command/projection engine.
// Main's shared provider maps this format-native wire to its canonical projection.
facebook::jsi::Object createNativeContextService(
    facebook::jsi::Runtime &, NativeContextSchedulers,
    std::shared_ptr<NativeRuntimeFence>);
}
namespace hwpjs {
// Product binding with a real Context port plus an optional shared-projection
// transport factory. Raw port availability never implies full editor projection.
facebook::jsi::Object createNativeJsiContextBinding(
    facebook::jsi::Runtime &, NativeContextSchedulers,
    std::shared_ptr<NativeRuntimeFence>, NativeTransportCreator creator = {});
}
