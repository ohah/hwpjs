require 'json'
require 'digest'
require 'pathname'

module HwpjsNativeCanvasSpec
  def self.build(source_root, spec_root)
    source_root = File.realpath(source_root)
    spec_root = File.realpath(spec_root)
    prefix = Pathname.new(source_root).relative_path_from(Pathname.new(spec_root)).to_s
    manifest_path = ENV.fetch('HWPJS_NATIVE_ARTIFACT_MANIFEST', File.join(source_root, 'native-artifacts.json'))
    raise 'NativeArtifactsRequired' unless Pathname.new(manifest_path).absolute? && File.file?(manifest_path)
    artifact = JSON.parse(File.read(manifest_path))
    source = artifact.fetch('source', {})
    raise 'NativeArtifactProfileMismatch' unless artifact['schemaVersion'] == 1 && artifact['profile'] == 'hwpjs.native-canvas/1' && artifact['abiVersion'] == 1 && %w[ios-simulator ios-device].include?(artifact['platform']) && artifact['architecture'] == 'arm64'
    raise 'NativeArtifactSourceRequired' unless source['revision'].is_a?(String) && source['revision'].match?(/\A[0-9a-f]{40}\z/) && source['fingerprint'].is_a?(String) && source['fingerprint'].match?(/\A[0-9a-f]{64}\z/)
    root = File.realpath(File.dirname(manifest_path))
    files = artifact.fetch('files')
    raise 'InvalidNativeArtifactManifest' unless files.is_a?(Array) && !files.empty?
    verified = {}
    files.each do |item|
      relative = item.fetch('path')
      raise 'NativeArtifactPathEscape' unless relative.is_a?(String) && !Pathname.new(relative).absolute?
      path = File.realpath(File.join(root, relative))
      raise 'NativeArtifactPathEscape' unless path.start_with?(root + '/')
      raise 'NativeArtifactMismatch' unless item['sha256'].is_a?(String) && item['sha256'].match?(/\A[0-9a-f]{64}\z/) && Digest::SHA256.file(path).hexdigest == item['sha256']
      raise 'DuplicateNativeArtifactPath' if verified.key?(relative)
      verified[relative] = path
    end
    archive = verified.fetch(artifact.fetch('archive').fetch('path'))
    raise 'NativeArtifactArchiveMismatch' unless File.extname(archive) == '.a' && File.binread(archive, 8) == "!<arch>\n"
    headers = artifact.fetch('headers')
    %w[hwp_native.h NativeCanvasAbi.h].each do |name|
      supplied = verified.fetch(headers.fetch(name))
      expected = File.join(source_root, 'cpp', name)
      raise 'NativeHeaderMismatch' unless Digest::SHA256.file(expected).hexdigest == Digest::SHA256.file(supplied).hexdigest
    end
    flags = %w[HWPJS_NATIVE_SHARED_SNAPSHOT HWPJS_NATIVE_RENDER_SOURCES].map do |name|
      value = ENV.fetch(name, '0')
      raise 'InvalidNativeCapabilityFlag' unless %w[0 1].include?(value)
      raise 'NativeArtifactFlagMismatch' unless artifact.fetch('bridgeFlags').fetch(name) == value.to_i
      value == '1' ? "#{name}=1" : nil
    end.compact

    # 이전 두 플래그 manifest는 그대로 지원합니다. V2 노출은 새 archive에서만 명시합니다.
    history_flag = ENV.fetch('HWPJS_NATIVE_HISTORY_V2', '0')
    raise 'InvalidNativeCapabilityFlag' unless %w[0 1].include?(history_flag)
    raise 'NativeArtifactFlagMismatch' unless artifact.fetch('bridgeFlags').fetch('HWPJS_NATIVE_HISTORY_V2', 0) == history_flag.to_i
    flags << 'HWPJS_NATIVE_HISTORY_V2=1' if history_flag == '1'

    Pod::Spec.new do |s|
      s.name = 'HwpjsNativeCanvas'; s.version = '0.1.0'
      s.summary = 'Opt-in UIKit Canvas and JSI source integration'
      s.homepage = 'https://github.com/ohah/hwpjs'; s.license = { :type => 'MIT' }; s.author = 'hwpjs'
      s.source = { :git => 'https://github.com/ohah/hwpjs.git', :branch => 'main' }
      s.platforms = { :ios => '17.0' }
      s.source_files = ['cpp/{NativeJsiBinding,NativeCanvasContextJsi}.{h,cpp}', 'cpp/{NativeContextJsi,NativeCanvasAbi,hwp_native}.h', 'ios/canvas/*.{h,mm}'].map { |pattern| File.join(prefix, pattern) }
      s.frameworks = 'UIKit', 'CoreGraphics', 'CoreText', 'ImageIO'; s.libraries = 'c++'
      # CocoaPods ignores vendored globs outside the Pod root. Propagate the verified external archive explicitly.
      s.user_target_xcconfig = { 'OTHER_LDFLAGS' => '$(inherited) ' + '"' + archive + '"' }
      s.pod_target_xcconfig = {
        'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
        'GCC_PREPROCESSOR_DEFINITIONS' => (['$(inherited)'] + flags).join(' '),
        'HEADER_SEARCH_PATHS' => '$(inherited) "${PODS_TARGET_SRCROOT}/' + File.join(prefix, 'cpp') + '"',
        'SUPPORTED_PLATFORMS' => artifact['platform'] == 'ios-simulator' ? 'iphonesimulator' : 'iphoneos'
      }
      install_modules_dependencies(s)
    end
  end
end
