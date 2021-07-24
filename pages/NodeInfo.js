const Page = require('./Page');
const Network = require('../aredn/Network');

let id = 1;

class NodeInfo extends Page {

  constructor(root) {
    super(root);
    this.currentName = null;

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
    if (arg !== this.currentName) {
      this.currentName = arg;
      this._setupProps();
      this._updateProps().catch(() => {});
    }
  }

  nodesUpdate() {
    this._updateProps();
  }

  _setupProps() {
    this.html('node-properties', this.template.NodeProperties({ node: { node: this.currentName } }));
    this.html('node-map-control', this.template.NodeMapControl());
    this.html('node-map-radios', this.template.NodeMapRadios());
  }

  async _updateProps() {
    const name = this.currentName;
    const node = await Network.getNodeByName(name);
    if (name !== this.currentName || !node) {
      return;
    }
    const dtd = Network.getDTDLinks(node);
    const rf = Network.getRFLinks(node);
    this.html('node-properties', this.template.NodeProperties({ node: node, dtd: dtd, rf: rf }));
    this.html('node-map-control', this.template.NodeMapControl({ node: node }));
    this.html('node-map-radios', this.template.NodeMapRadios({ home: node }));
    const radios = [];
    await Promise.all(rf.map(async link => {
      const rnode = await Network.getNodeByName(link.hostname);
      if (name !== this.currentName) {
        return;
      }
      if (rnode) {
        radios.push(rnode);
        this.html('node-map-radios', this.template.NodeMapRadios({ home: node, radios: radios }));
        link.rlink = Object.values(rnode.link_info).find(link => link.name === name && link.linkType === 'RF');
        this.html('node-properties', this.template.NodeProperties({ node: node, dtd: dtd, rf: rf }));
      }
    }));
  }
}

module.exports = NodeInfo;
