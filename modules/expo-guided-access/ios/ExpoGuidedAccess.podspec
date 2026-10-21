Pod::Spec.new do |s|
  s.name = 'ExpoGuidedAccess'
  s.version = '1.0.0'
  s.summary = 'Read-only Guided Access status for the examination app'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'TCC Guidance Office'
  s.homepage = 'https://masterexam.pro'
  s.platform = :ios, '15.1'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.swift'
end
