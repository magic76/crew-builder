import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    console.error('Contract check failed:', message);
    process.exitCode = 1;
  }
};

const forge = read('forge.js');
const appSpec = read('appspec-runtime.js');
const next = read('builder-next.js');
const ux = read('builder-ux.js');
const nativeAdapter = read('native-adapter.js');
const mainActivity = read('android/app/src/main/java/com/magic76/crewforge/MainActivity.kt');
const gradle = read('android/app/build.gradle.kts');
const index = read('index.html');

assert(!/window\.createApp\s*=/.test(appSpec), 'AppSpec must not monkey-patch createApp');
assert(!/window\.buildCreatePrompt\s*=/.test(appSpec), 'AppSpec must not monkey-patch buildCreatePrompt');
assert(!/addNativePromptContext/.test(next), 'Builder must not mutate user prompts to inject native context');
assert(!/injectLanguage/.test(ux), 'Builder UX must not mutate user prompts to inject language context');

assert(/event\.source\s*!==\s*preview\?\.contentWindow/.test(forge), 'Runtime requests must be bound to the active preview frame');
assert(/Capability not granted/.test(forge), 'Runtime requests must enforce AppSpec capabilities');
assert(/CrewStorage\.runtimeGet/.test(forge), 'Generated app runtime state must use IndexedDB-backed CrewStorage');

assert(!/CrewNative|CrewDevice/.test(nativeAdapter), 'Web runtime must not call direct JavaScript interfaces');
assert(!/addJavascriptInterface/.test(mainActivity), 'Android must not expose addJavascriptInterface to generated frames');
assert(/WEB_MESSAGE_LISTENER/.test(mainActivity), 'Android must use origin-scoped WebMessageListener');
assert(/isMainFrame/.test(mainActivity), 'Native host messaging must reject non-main frames');

for (const file of ['storage-runtime.js','forge.js','native-adapter.js','live-runtime.js','ui-runtime.js','builder-ux.js','builder-next.js','language-prompts.js','appspec-runtime.js']) {
  assert(index.includes(`./${file}`), `${file} must be referenced by index.html`);
  assert(gradle.includes(`repoRoot.file("${file}")`), `${file} must be packaged into Android assets`);
}

assert(/compileSdk=36/.test(gradle) && /targetSdk=36/.test(gradle), 'Android compile/target SDK must remain 36');

if (!process.exitCode) console.log('Crew Builder contract checks passed.');
