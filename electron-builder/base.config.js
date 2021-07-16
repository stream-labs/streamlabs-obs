const signtool = require('signtool');

const base = {
  appId: 'com.streamlabs.slobs',
  productName: 'Streamlabs OBS',
  icon: 'media/images/icon.ico',
  files: [
    'bundles',
    '!bundles/*.js.map',
    'node_modules',
    'vendor',
    'app/i18n',
    'media/images/game-capture',
    'updater/build/bootstrap.js',
    'updater/build/bundle-updater.js',
    'updater/index.html',
    'index.html',
    'main.js',
    'obs-api',
    'updater/mac/index.html',
    'updater/mac/Updater.js',
  ],
  directories: {
    buildResources: '.',
  },
  nsis: {
    license: 'AGREEMENT',
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    include: 'installer.nsh',
  },
  publish: {
    provider: 'generic',
    url: 'https://slobs-cdn.streamlabs.com',
  },
  win: {
    extraFiles: ['LICENSE', 'AGREEMENT', 'shared-resources/**/*', '!shared-resources/README'],
    extraResources: [
      'node_modules/ffmpeg-ffprobe-static/ffmpeg.exe',
      'node_modules/ffmpeg-ffprobe-static/ffprobe.exe',
    ],
    rfc3161TimeStampServer: 'http://timestamp.digicert.com',
    timeStampServer: 'http://timestamp.digicert.com',
    async sign(config) {
      if (process.env.SLOBS_NO_SIGN) return;

      if (
        config.path.indexOf('node_modules\\obs-studio-node\\data\\obs-plugins\\win-capture') !== -1
      ) {
        console.log(`Skipping ${config.path}`);
        return;
      }

      console.log(`Signing ${config.hash} ${config.path}`);
      await signtool.sign(config.path, {
        subject: 'Streamlabs (General Workings, Inc.)',
        rfcTimestamp: 'http://timestamp.digicert.com',
        algorithm: config.hash,
        append: config.isNest,
        description: config.name,
        url: config.site,
      });
    },
  },
  mac: {
    extraFiles: [
      'shared-resources/**/*',
      '!shared-resources/README',
      // {
      //   "from": "node_modulesdwadawd/obs-studio-node/Frameworks/*",
      //   "to": "Frameworks/",
      //   "filter": ["**/*"]
      // },
      // {
      //   "from": "node_modules/obs-studio-node/Frameworks/*",
      //   "to": "Resources/app.asar.unpacked/node_modules/",
      //   "filter": ["**/*"]
      // }
    ],
    icon: 'media/images/icon-mac.icns',
    hardenedRuntime: true,
    entitlements: 'electron-builder/entitlements.plist',
    entitlementsInherit: 'electron-builder/entitlements.plist',
    extendInfo: {
      CFBundleURLTypes: [
        {
          CFBundleURLName: 'Streamlabs OBS Link',
          CFBundleURLSchemes: ['slobs'],
        },
      ],
    },
  },
  dmg: {
    background: 'media/images/dmg-bg.png',
    iconSize: 100,
    contents: [
      {
        x: 112,
        y: 165,
      },
      {
        type: 'link',
        path: '/Applications',
        x: 396,
        y: 165,
      },
    ],
  },
  extraMetadata: {
    env: 'production',
    sentry_url_fe_dsn:process.env.SLOBS_SENTRY_URL_FE_DSN,
    sentry_url_be_server:process.env.SLOBS_SENTRY_URL_BE_SERVER,
    sentry_url_be_client:process.env.SLOBS_SENTRY_URL_BE_CLIENT,
  },
  afterPack: './electron-builder/afterPack.js',
  afterSign: './electron-builder/notarize.js',
};

module.exports = base;
