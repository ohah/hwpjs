#pragma once
#include "NativeContextJsi.h"
namespace hwpjs {
facebook::jsi::Object createNativeCanvasContextService(facebook::jsi::Runtime &, NativeContextSchedulers, std::shared_ptr<NativeRuntimeFence>);
facebook::jsi::Object createNativeJsiCanvasBinding(facebook::jsi::Runtime &, NativeContextSchedulers, std::shared_ptr<NativeRuntimeFence>, NativeTransportCreator creator = {});
}
