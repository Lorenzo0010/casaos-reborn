const { parseCasaOSMetadata } = require('./backend/utils/yamlBuilder.js');
const yaml = require('js-yaml');
const yamlStr = `
name: myapp
x-casaos:
  title:
    custom: 'My Custom Title'
    en_US: 'myapp'
  icon: 'https://example.com/icon.png'
`;
console.log(parseCasaOSMetadata(yamlStr));
