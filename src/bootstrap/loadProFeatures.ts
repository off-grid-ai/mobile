import { refreshProStatus, onProStatusChange } from '../services/proLicenseService';
import { registerToolExtension } from '../services/tools/extensions';
import { registerScreen } from '../navigation/screenRegistry';
import { registerSettingsSection } from '../components/settings/sectionRegistry';

export async function loadProFeatures(): Promise<void> {
  let pro: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pro = require('@offgrid/pro');
  } catch (err) {
    console.warn('[loadProFeatures] require(@offgrid/pro) threw:', err);
    return; // free / contributor build: package not installed
  }
  if (!pro) {
    console.warn('[loadProFeatures] @offgrid/pro resolved to null (stub build)');
    return; // proStub.js returns null — free build via metro extraNodeModules
  }

  // Run synchronously before any await so screens are registered before the
  // navigator renders (App.tsx doesn't await loadProFeatures).
  const activate = () => {
    pro.activate({ registerToolExtension, registerScreen, registerSettingsSection });
  };
  activate();
  console.log('[loadProFeatures] pro activated, registered screens');

  // Async: refresh receipt so pro-gated UI can react.
  await refreshProStatus();
  onProStatusChange(activate);
}
