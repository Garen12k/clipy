Pod::Spec.new do |s|
  s.name           = 'ClipyVideo'
  s.version        = '0.1.0'
  s.summary        = 'Clipy native video engine (AVFoundation)'
  s.description    = 'Swift Expo module that will wrap AVFoundation for preview, export and captions.'
  s.author         = 'Clipy'
  s.homepage       = 'https://github.com/clipy/clipy'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
