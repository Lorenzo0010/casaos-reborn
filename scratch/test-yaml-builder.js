const { buildCasaOSCompose } = require('../backend/utils/yamlBuilder');

const testData = {
  name: "test-container",
  image: "nginx",
  tag: "latest",
  ports: {
    "80/tcp": [{ HostPort: "8080" }]
  },
  env: [
    "TEST_ENV=hello_world"
  ]
};

const yaml = buildCasaOSCompose(testData);
console.log(yaml);
