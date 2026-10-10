Pod::Spec.new do |s|
  s.name           = 'ClipyVideo'
  s.version        = '0.1.0'
  s.summary        = 'Clipy native video engine (AVFoundation)'
  s.description    = 'Swift Expo module that will wrap AVFoundation for preview, export and captions.'
  s.author         = 'Clipy'
  s.homepage       = 'https://github.com/Garen12k/clipy'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Speech', 'Accelerate', 'BackgroundTasks'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }

  s.source_files = "*.{h,m,mm,swift}"

  s.test_spec 'Tests' do |test_spec|
    test_spec.source_files = 'Tests/**/*.swift'
  end
end
