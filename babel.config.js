module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['babel-plugin-react-compiler', { target: '19' }],
    'react-native-worklets/plugin',
  ],
};
