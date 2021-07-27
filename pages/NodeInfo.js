const Page = require('./Page');
const Network = require('../aredn/Network');
const Log = require('debug')('nodeinfo');

const REFRESH_TIMEOUT = 10 * 1000;

class NodeInfo extends Page {

  constructor(root) {
    super(root);
    this.currentName = null;
    this._running = false;

    this.nodesUpdate = this.nodesUpdate.bind(this);
  }

  async select() {
    super.select();
    this.html('info', this.template.NodeInfo());

    Bus.on('aredn.nodes.update', this.nodesUpdate);
  }

  async deselect() {
    super.deselect();
    Bus.off('aredn.nodes.update', this.nodesUpdate);
    this._stopRefresh();
    this.currentName = null;
  }

  async tabSelect(tab) {
    super.tabSelect(tab);
    if (tab !== this.currentName) {
      this.currentName = tab;
      this._setupProps();
      await this._updateProps();
      this._startRefresh();
    }
  }

  async 'ui.visible' (args) {
    if (args.value) {
      this._startRefresh(true);
    }
    else {
      this._stopRefresh();
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
    const tun = Network.getTUNLinks(node);
    const rf = Network.getRFLinks(node);
    const revrf = Network.getReverseLinks(node, 'RF');
    revrf.forEach(rrf => {
      if (!rf.find(lk => lk.name === rrf.rname)) {
        rf.push({ name: rrf.rname });
      }
    });
    const service = Network.getServices(node);
    this.html('node-properties', this.template.NodeProperties({ node: node, dtd: dtd, rf: rf, tun: tun, service: service }));
    this.html('node-map-control', this.template.NodeMapControl({ node: node }));
    this.html('node-map-radios', this.template.NodeMapRadios({ home: node }));
    const radios = [];
    await Promise.all(rf.map(async link => {
      const rnode = await Network.getNodeByName(link.name);
      if (name !== this.currentName) {
        return;
      }
      if (rnode) {
        radios.push(rnode);
        this.html('node-map-radios', this.template.NodeMapRadios({ home: node, radios: radios }));
        link.rlink = Object.values(rnode.link_info).find(lk => lk.name === name && lk.linkType === 'RF');
        this.html('node-properties', this.template.NodeProperties({ node: node, dtd: dtd, rf: rf, tun: tun, service: service }));
      }
    }));
  }

  _startRefresh(immediate) {
    const refresh = async () => {
      const node = await Network.getNodeByName(this.currentName);
      if (!this._running || !node) {
        return;
      }
      const rf = Network.getRFLinks(node);
      const start = Date.now();
      if (rf.length) {
        await Network.refreshNodesByNames([ this.currentName ].concat(rf.map(link => link.name)));
        if (!this._running) {
          return;
        }
      }
      this._refreshTimer = setTimeout(refresh, Math.max(0, REFRESH_TIMEOUT - (Date.now() - start)));
    }
    this._stopRefresh();
    if (this.currentName) {
      this._running = true;
      this._refreshTimer = setTimeout(refresh, immediate ? 0 : REFRESH_TIMEOUT);
    }
  }

  _stopRefresh() {
    this._running = false;
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }
}

module.exports = NodeInfo;
