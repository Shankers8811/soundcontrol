const path = require('path');

module.exports = {
  entry: {
    widgetProvider: './src/widgetProvider.js',
    SoundControlWidget: './src/SoundControlWidget.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    library: {
      type: 'module'
    }
  },
  experiments: {
    outputModule: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js'],
    alias: {
      '@microsoft/windows-widgets': path.resolve(__dirname, 'node_modules/@microsoft/windows-widgets')
    }
  },
  externals: {
    '@microsoft/windows-widgets': 'commonjs @microsoft/windows-widgets'
  },
  target: 'node',
  mode: 'production'
};