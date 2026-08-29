import type {
  ImportProvider,
  PluginManifest,
  PluginPackage
} from '../plugin-api';
import fictionalPlugin = require('../../examples/fictional-plugin/index.cjs');

const conformingPlugin: PluginPackage = fictionalPlugin;
void conformingPlugin;

const manifest: PluginManifest = {
  apiVersion: 1,
  id: 'example.contract-fixture',
  version: '1.0.0',
  coreCompatibility: '>=1.0.0-rc.1 <2.0.0'
};

const invalidProvider: ImportProvider = {
  id: 'example.invalid-provider',
  label: 'Invalid compile-time fixture',
  input: {
    // @ts-expect-error -- Plugin APIs deliberately reject executable browser inputs.
    type: 'browser-script',
    maxBytes: 1024
  },
  transform: async () => {
    throw new Error('not executed');
  }
};

const invalidContribution: PluginPackage = {
  manifest,
  imports: [invalidProvider],
  // @ts-expect-error -- arbitrary route contributions are outside the Plugin API.
  routes: []
};

void invalidContribution;
