const path = require('path');
const webpack = require('webpack');
const cp = require('child_process');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const VueLoaderPlugin = require('vue-loader/lib/plugin');
const fs = require('fs');

const plugins = [];

const commit = cp.execSync('git rev-parse --short HEAD').toString().replace('\n', '');

if (!('SLOBS_SENTRY_URL_FE_DSN' in process.env)) {process.env.SLOBS_SENTRY_URL_FE_DSN = '';}
if (!('SLOBS_SENTRY_URL_BE_SERVER' in process.env)) {process.env.SLOBS_SENTRY_URL_BE_SERVER = '';}
if (!('SLOBS_SENTRY_URL_BE_CLIENT' in process.env)) {process.env.SLOBS_SENTRY_URL_BE_CLIENT = '';}

plugins.push(
  new webpack.DefinePlugin({
    SLOBS_BUNDLE_ID: JSON.stringify(commit),
    SLOBS_SENTRY_URL_FE_DSN: JSON.stringify(process.env.SLOBS_SENTRY_URL_FE_DSN),
    SLOBS_SENTRY_URL_BE_SERVER: JSON.stringify(process.env.SLOBS_SENTRY_URL_BE_SERVER),
    SLOBS_SENTRY_URL_BE_CLIENT: JSON.stringify(process.env.SLOBS_SENTRY_URL_BE_CLIENT),
  }),
);
plugins.push(
  new WebpackManifestPlugin({
    filter: file =>
      ['renderer.js', 'vendors~renderer.js', 'renderer.js.map', 'vendors~renderer.js.map'].includes(
        file.name,
      ),
  }),
);

plugins.push(new CleanWebpackPlugin());
plugins.push(new VueLoaderPlugin());

const OUTPUT_DIR = path.join(__dirname, 'bundles');

const tsFiles = [];
const tsxFiles = [];

if (process.env.SLOBS_STRICT_NULLS) {
  const filesPath = 'strict-null-check-files';
  const files = fs.readdirSync(filesPath);
  files.forEach(file => {
    const json = JSON.parse(fs.readFileSync(`${filesPath}/${file}`));
    if (json.ts) tsFiles.push(...json.ts);
    if (json.tsx) tsxFiles.push(...json.tsx);
  });
}

// uncomment and install to analyze bundle size
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
// plugins.push(new BundleAnalyzerPlugin());

module.exports = {
  entry: {
    renderer: './app/app.ts',
    updater: './updater/mac/ui.js',
    'guest-api': './guest-api',
  },

  output: {
    path: OUTPUT_DIR,
    filename: '[name].js',
    publicPath: '',
  },

  target: 'electron-renderer',

  resolve: {
    extensions: ['.js', '.ts', '.json', '.tsx'],
    modules: [path.resolve(__dirname, 'app'), 'node_modules'],
    symlinks: false,
  },

  // We want to dynamically require native addons
  externals: {
    'font-manager': 'require("font-manager")',
    'color-picker': 'require("color-picker")',

    // Not actually a native addons, but for one reason or another
    // we don't want them compiled in our webpack bundle.
    'aws-sdk': 'require("aws-sdk")',
    asar: 'require("asar")',
    'backtrace-node': 'require("backtrace-node")',
    'node-fontinfo': 'require("node-fontinfo")',
    'socket.io-client': 'require("socket.io-client")',
    rimraf: 'require("rimraf")',
    'backtrace-js': 'require("backtrace-js")',
    request: 'require("request")',
    archiver: 'require("archiver")',
    'extract-zip': 'require("extract-zip")',
    'fs-extra': 'require("fs-extra")',
  },

  module: {
    rules: [
      {
        test: /\.vue$/,
        use: [
          {
            loader: 'vue-loader',
            options: {
              esModule: true,
              transformToRequire: {
                video: 'src',
                source: 'src',
              },
            },
          },
        ],
        include: [path.resolve(__dirname, 'app/components'), path.resolve(__dirname, 'updater')],
      },
      {
        test: /\.ts$/,
        exclude: [
          path.resolve(__dirname, 'node_modules'),
          path.resolve(__dirname, 'app', 'components-react'),
        ],
        use: {
          loader: 'ts-loader',
          options: {
            reportFiles: tsFiles,
            compilerOptions: {
              strictNullChecks: !!process.env.SLOBS_STRICT_NULLS,
            },
          },
        },
      },
      {
        test: path => {
          const match = !!path.match(/components[\\/].+\.tsx$/);
          return match;
        },
        include: path.resolve(__dirname, 'app/components'),
        use: [
          'babel-loader',
          {
            loader: 'ts-loader',
            options: {
              reportFiles: tsxFiles,
              compilerOptions: {
                strictNullChecks: !!process.env.SLOBS_STRICT_NULLS,
              },
            },
          },
        ],
      },
      {
        test: path => {
          const match = !!path.match(/react[\\/].+\.tsx?$/);
          return match;
        },
        include: path.resolve(__dirname, 'app/components-react'),
        exclude: /node_modules/,
        use: [
          'babel-loader',
          {
            loader: 'ts-loader',
            options: {
              reportFiles: ['app/components-react/**/*'],
              configFile: 'app/components-react/tsconfig.json',
              instance: 'react-tsx',
              compilerOptions: {
                jsx: 'react',
              },
            },
          },
        ],
      },
      {
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
      },
      {
        test: /(?<!\.[mg])\.less$/, // Vue style tags
        include: [
          path.resolve(__dirname, 'app/components'),
          path.resolve(__dirname, 'app/components-react'),
          path.resolve(__dirname, 'updater'),
        ],
        use: [
          'vue-style-loader',
          'css-loader',
          {
            loader: 'less-loader',
            options: {
              lessOptions: {
                javascriptEnabled: true,
              },
            },
          },
        ],
      },
      {
        test: /\.m.less$/, // Local style modules
        include: [
          path.resolve(__dirname, 'app/components'),
          path.resolve(__dirname, 'app/components-react'),
        ],
        use: [
          { loader: 'style-loader', options: { attributes: { name: 'local' } } },
          {
            loader: 'css-loader',
            options: {
              camelCase: true,
              localIdentName: '[local]___[hash:base64:5]',
              modules: true,
              importLoaders: 1,
            },
          },
          {
            loader: 'less-loader',
            options: {
              lessOptions: {
                javascriptEnabled: true,
              },
            },
          },
        ],
      },
      {
        test: /\.lazy.less$/, // antd themes
        include: [path.resolve(__dirname, 'app/styles/antd')],
        use: [
          {
            loader: 'style-loader',
            options: { injectType: 'lazyStyleTag', attributes: { name: 'antd' } },
          },
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
            },
          },
          {
            loader: 'less-loader',
            options: {
              lessOptions: {
                javascriptEnabled: true,
              },
            },
          },
        ],
      },
      {
        test: /\.g\.less$/, // Global styles
        include: [
          path.resolve(__dirname, 'app/app.g.less'),
          path.resolve(__dirname, 'app/themes.g.less'),
        ],
        use: [
          { loader: 'style-loader', options: { attributes: { name: 'global' } } },
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
            },
          },
          {
            loader: 'less-loader',
            options: {
              lessOptions: {
                javascriptEnabled: true,
              },
            },
          },
        ],
      },
      {
        test: /\.less$/, // Local style modules
        exclude: [
          path.resolve(__dirname, 'updater'),
          path.resolve(__dirname, 'app/components'),
          path.resolve(__dirname, 'app/components-react'),
          path.resolve(__dirname, 'app/app.g.less'),
          path.resolve(__dirname, 'app/themes.g.less'),
          path.resolve(__dirname, 'app/styles/antd'),
        ],
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
            },
          },
          {
            loader: 'less-loader',
            options: {
              lessOptions: {
                javascriptEnabled: true,
              },
            },
          },
        ],
      },
      {
        test: /\.(png|jpe?g|gif|svg|mp4|ico|wav|webm|icns)(\?.*)?$/,
        loader: 'file-loader',
        options: {
          name: '[name]-[hash].[ext]',
          outputPath: 'media/',
          publicPath: 'bundles/media/',
        },
      },
      // Handles custom fonts. Currently used for icons.
      {
        test: /\.woff$/,
        loader: 'file-loader',
        options: {
          name: '[name].[ext]',
          outputPath: 'fonts/',
          publicPath: 'bundles/fonts/',
        },
      },
      // Used for loading WebGL shaders
      {
        test: /\.(vert|frag)$/,
        loader: 'raw-loader',
      },
    ],
  },

  optimization: {
    splitChunks: {
      chunks: chunk => chunk.name === 'renderer',
      name: 'vendors~renderer',
    },
    moduleIds: 'deterministic',
  },

  plugins,
};
