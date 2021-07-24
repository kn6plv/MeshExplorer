const Page = require('./Page');
const Network = require('../aredn/Network');

let id = 1;

class NodeInfo extends Page {

  constructor(root) {
    super(root);

    this.nodesUpdate = this.nodesUpdate.bind(this);
  }

  async select() {
    this.html('info', this.template.NodeInfo());

    Bus.on('aredn.nodes.update', this.nodesUpdate);
  }

  async deselect() {
    Bus.off('aredn.nodes.update', this.nodesUpdate);
  }

  async tabSelect(arg) {
    this.html('node-properties', this.template.NodeProperties({ json: { node: arg } }));
    this.html('node-map-control', this.template.NodeMapControl());
    this.html('node-map-radios', this.template.NodeMapRadios());
    const myId = ++id;
    const node = await Network.getNodeByName(arg);
    if (myId !== id || !node) {
      return;
    }
    this.html('node-properties', this.template.NodeProperties({ json: node }));
    this.html('node-map-control', this.template.NodeMapControl({ json: node }));
    this.html('node-map-radios', this.template.NodeMapRadios({ home: node }));
    const radios = [];
    await Promise.all(Object.keys(node.link_info || {}).map(async ip => {
      const rnode = await Network.getNodeByIP(ip);
      if (myId !== id) {
        return;
      }
      if (rnode) {
        radios.push(rnode);
        this.html('node-map-radios', this.template.NodeMapRadios({ home: node, radios: radios }));
      }
    }));
  }

  nodesUpdate() {
  }
}

module.exports = NodeInfo;
