const Page = require('./Page');
const Network = require('../aredn/Network');
const { nodes } = require('../aredn/Network');
const Log = require('debug')('nodeall');

const HOME = { lat: 37.85, lon: -122.35 };

class NodeAll extends Page {

  constructor(root) {
    super(root);

    this._updateRadios = this._updateRadios.bind(this);
  }

  async select() {
    super.select();

    this.html('info', this.template.NodeAll({ home: HOME }));
    this._updateRadios();

    Bus.on('aredn.node.update', this._updateRadios);
  }

  async deselect() {
    super.deselect();
    Bus.off('aredn.node.update', this._updateRadios);
  }

  async 'ui.visible' (args) {
  }

  _updateRadios() {
    const nodes = Network.getAllAvailableNodes();
    const links = {};
    nodes.forEach(node => {
      if (!node.lat || !node.lon) {
        return;
      }
      const from = node.node;
      Network.getRFLinks(node).forEach(link => {
        const to = link.name;
        const key = `${from}:${to}`;
        if (!links[key] && !links[`${to}:${from}`]) {
          const lnode = Network.getNodeByNameImmediate(to);
          if (lnode && lnode.lat && lnode.lon) {
            links[key] = [ [ node.lat, node.lon ], [ lnode.lat, lnode.lon ] ];
          }
        }
      });
    });
    this.html('node-all-map-radios', this.template.NodeAllMapRadios({ radios: nodes, links: Object.values(links) }));
  }

}

module.exports = NodeAll;
