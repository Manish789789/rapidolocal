// build-modules.ts
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises'; // For creating directories

// Declare Bun global for TypeScript to avoid "Cannot find name 'Bun'" compile errors.
// When running in Bun, the runtime provides the Bun object; this declaration keeps TypeScript happy.
declare const Bun: any;

const modulesSrcDir = './src/modules';
const modulesOutDir = './dist/modules'; // Output location for module bundles

async function buildIndividualModules() {
  try {
    await mkdir(modulesOutDir, { recursive: true }); // Ensure output directory exists
    const moduleFolders = await readdir(modulesSrcDir);

    for (const moduleName of moduleFolders) {



      const routeFile = join(modulesSrcDir, moduleName, 'route.ts');
      const moduleOutDir = join(modulesOutDir, moduleName);
      const file = Bun.file(routeFile);
      if (await file.exists()) {

        await mkdir(moduleOutDir, { recursive: true });

        await Bun.build({
          entrypoints: [routeFile],
          outdir: moduleOutDir,
          target: 'bun',
          // You can add other options here like minify: true for production
        });
        console.log(`Built module: ${moduleName}`);
      }
    }
  } catch (error) {
    console.error('Error building individual modules:', error);
    process.exit(1); // Exit if module build fails
  }
}

buildIndividualModules();
