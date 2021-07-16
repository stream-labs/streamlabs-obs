const cp = require('child_process');
const fs = require('fs');
const path = require('path');

function signAndCheck(filePath) {
  console.log(`Signing: ${filePath}`);
  cp.execSync(`codesign -fs "Developer ID Application: Streamlabs LLC (UT675MBB9Q)" "${filePath}"`);
  
  // All files need to be writable for update to succeed on mac
  console.log(`Checking Writable: ${filePath}`);
  try {
    fs.accessSync(filePath, fs.constants.W_OK);
  } catch {
    throw new Error(`File ${filePath} is not writable!`);
  }
}

function signBinaries(directory) {
  const files = fs.readdirSync(directory);

  for (const file of files) {
    const fullPath = path.join(directory, file);

    if (fs.statSync(fullPath).isDirectory()) {
      signBinaries(fullPath);
    } else {
      const absolutePath = path.resolve(fullPath);
      const ext = path.extname(absolutePath);

      // Don't follow symbolic links
      if (fs.lstatSync(absolutePath).isSymbolicLink()) continue;

      // Sign dynamic libraries
      if (ext === '.so' || ext === '.dylib') {
        signAndCheck(absolutePath);
        continue;
      }

      // This will allow us to detect and sign executable files that
      // aren't marked by a specific extension.
      try {
        fs.accessSync(absolutePath, fs.constants.X_OK);
      } catch {
        continue;
      }

      signAndCheck(absolutePath);
    }
  }
}

exports.default = async function(context) {
  if (process.platform !== 'darwin') return;

  console.log('Updating dependency paths');
  cp.execSync(
    `install_name_tool -change ./node_modules/node-libuiohook/libuiohook.1.dylib @executable_path/../Resources/app.asar.unpacked/node_modules/node-libuiohook/libuiohook.1.dylib ${context.appOutDir}/Streamlabs\\ OBS.app/Contents/Resources/app.asar.unpacked/node_modules/node-libuiohook/node_libuiohook.node`,
  );

  cp.execSync(
    `cp -R ./node_modules/obs-studio-node/Frameworks \"${context.appOutDir}/${context.packager.appInfo.productName}.app/Contents/\"`,
  );

  cp.execSync(
    `cp -R ./node_modules/obs-studio-node/Frameworks \"${context.appOutDir}/${context.packager.appInfo.productName}.app/Contents/Resources/app.asar.unpacked/node_modules/\"`,
  );

  signBinaries(
    `${context.appOutDir}/${context.packager.appInfo.productName}.app/Contents/Resources/app.asar.unpacked`,
  );
};
