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
    const rf = {};
    const bands = {
      gray: [], blue: [], purple: [], orange: [], magenta: []
    };
    const tun = {};
    const radios = nodes.filter(node => {
      if (!node.lat || !node.lon) {
        return false;
      }
      const from = node.canonicalName;
      Network.getRFLinks(node).forEach(link => {
        const to = link.canonicalName;
        const key = `${from}:${to}`;
        if (!rf[key] && !rf[`${to}:${from}`]) {
          const lnode = Network.getNodeByNameImmediate(to);
          if (lnode && lnode.lat && lnode.lon) {
            rf[key] = true;
            bands[node.icon].push([ [ node.lat, node.lon ], [ lnode.lat, lnode.lon ] ]);
          }
        }
      });
      Network.getTUNLinks(node).forEach(link => {
        const to = link.canonicalName;
        const key = `${from}:${to}`;
        if (!tun[key] && !tun[`${to}:${from}`]) {
          const lnode = Network.getNodeByNameImmediate(to);
          if (lnode && lnode.lat && lnode.lon) {
            tun[key] = [ [ node.lat, node.lon ], [ lnode.lat, lnode.lon ] ];
          }
        }
      });
      return true;
    });
    this.html('node-all-map-radios', this.template.NodeAllMapRadios({ radios: radios, bands: bands, tun: Object.values(tun) }));
  }

}

module.exports = NodeAll;
