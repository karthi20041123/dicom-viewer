const { Client, Status } = require('dcmjs-dimse');

function sendCStoreToDestination(aet, ip, port, fileBuffer) {
  const client = new Client();
  client.addPeer({ aet, ip, port });
  client.associate(() => {
    client.cStoreRequest(fileBuffer, () => {
      client.release();
    });
  });
}

module.exports = { sendCStoreToDestination };