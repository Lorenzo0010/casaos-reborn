const si = require('systeminformation');
async function test() {
  const containers = await si.dockerContainers('all');
  console.log(containers[0]);
}
test();
