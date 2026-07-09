const { buildCasaOSCompose } = require('./backend/utils/yamlBuilder');

const data = {
  name: 'my-app',
  image: 'nginx',
  tag: 'latest',
  ports: {
    '80/tcp': [ { HostPort: '8080' } ]
  },
  env: [ 'TZ=Europe/Rome' ],
  webUI: { scheme: 'http', port: '8080', path: '/' },
  volumes: ['/mnt/data:/data']
};

console.log(buildCasaOSCompose(data));
