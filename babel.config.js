const isTest = process.env.NODE_ENV === 'test';

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    !isTest && ['babel-plugin-react-compiler', { target: '19' }],
    'react-native-worklets/plugin',
  ].filter(Boolean),
};
