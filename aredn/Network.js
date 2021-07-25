const fetch = require('node-fetch');
const Geo = require('../maps/Geo');
const Radios = require('../radios/Radios');
const Log = require('debug')('aredn');

const NODE_AGE = 10 * 60 * 1000; // 10 minutes

class AREDNNetwork {

  constructor() {
    this.hostname = 'localnode';
    this.links = {};
    this.names = {};
    this.nodes = {};
    this.radios = {};
    this.ages = {};
    this.pending = {};
  }

  start() {
    this._getRoot().catch(e => {
      Log(e);
    });
  }

  async _getRoot() {
    const req = await fetch('http://localnode.local.mesh/cgi-bin/sysinfo.json?link_info=1&hosts=1');
    const json = await req.json();

    this.json = json;
    this.hostname = json.node;
    this.names = {};
    json.hosts.forEach(host => {
      this.names[host.name] = host;
    });
    this.nodes[this.hostname] = json;
    this.ages[this.hostname] = Date.now();
    await this._updateRadios();

    Bus.emit('aredn.nodes.update');

    await this._populate();
  }

  async _populate() {
    if (await this._populateNodes(this.getLocalNames())) {
      if (this._updateRadios()) {
        Bus.emit('aredn.nodes.update');
      }
    }
    await this._populateNodes(this.getAllNames());
  }

  async _populateNodes(names) {
    Log('populateNodes:', names);
    let change = false;
    const update = async name => {
      try {
        Log('get:', name);
        const req = await fetch(`http://${name}.local.mesh/cgi-bin/sysinfo.json?link_info=1`);
        Log('   :', name);
        let valid = false;
        const json = await req.json();
        switch (json.api_version) {
          case '1.6':
            json.extra = {
              address: await Geo.latlon2address(json.lat, json.lon),
              radio: Radios.lookup(json.node_details.model)
            };
            json.link_info = {};
            valid = true;
            break;
          case '1.7':
          case '1.8':
            json.extra = {
              address: await Geo.latlon2address(json.lat, json.lon),
              radio: Radios.lookup(json.node_details.model)
            };
            for (let ip in json.link_info) {
              json.link_info[ip].name = this.canonicalHostname(json.link_info[ip].hostname);
            }
            valid = true;
            break;
          default:
            Log('Unknown API', json.api_version);
            break;
        }
        if (valid && (!this.nodes[name] || JSON.stringify(json) != JSON.stringify(this.nodes[name]))) {
          this.nodes[name] = json;
          this.ages[name] = Date.now();
          change = true;
        }
      }
      catch (e) {
        Log(e);
      }
      finally {
        delete this.pending[name];
      }
    };
    await Promise.all(names.map(name => {
      let p = this.pending[name];
      if (!p) {
        p = update(name);
        this.pending[name] = p;
      }
      return p;
    }));
    return change;
  }

  _updateRadios() {
    Log('updateRadios:');
    let changed = false;
    const localNames = this.getLocalNames();
    for (let i = 0; i < localNames.length; i++) {
      const node = this.nodes[localNames[i]];
      if (!node) {
        continue;
      }
      for (let ip in node.link_info) {
        const link = node.link_info[ip];
        if (link.linkType !== 'RF') {
          continue;
        }
        const radioName = this.canonicalHostname(link.hostname);
        const entry = { name: radioName, ip: ip };
        if (!this.radios[radioName] || JSON.stringify(this.radios[radioName]) != JSON.stringify(entry)) {
          this.radios[radioName] = entry;
          changed = true;
        }
      }
    }
    return changed;
  }

  getTypeLinks(type) {
    return this.getNodeTypeLinks(this.json, type);
  }

  getLocalNames() {
    return ([ this.hostname ].concat(this.getTypeLinks('DTD').map(link => this.canonicalHostname(link.hostname)))).sort((a,b) => a.localeCompare(b));
  }

  getRFNames() {
    return Object.keys(this.radios).sort((a,b) => a.localeCompare(b));
  }

  getTUNNames() {
    return this.getTypeLinks('TUN').map(link => this.canonicalHostname(link.hostname)).sort((a,b) => a.localeCompare(b));
  }

  getAllNames() {
    return Object.keys(this.names).sort((a,b) => a.localeCompare(b));
  }

  getNodeTypeLinks(node, type) {
    const links = [];
    for (let ip in node.link_info) {
      const link = node.link_info[ip];
      if (link.linkType == type) {
        links.push(Object.assign({ ip: ip }, link));
      }
    }
    return links;
  }

  getDTDLinks(node) {
    return this.getNodeTypeLinks(node, 'DTD').sort((a,b) => a.hostname.localeCompare(b.hostname));
  }

  getRFLinks(node) {
    return this.getNodeTypeLinks(node, 'RF').sort((a,b) => a.hostname.localeCompare(b.hostname));
  }

  async getNodeByName(name) {
    name = this.canonicalHostname(name);
    if (!this.nodes[name]) {
      await this._populateNodes([ name ]);
    }
    else {
      if (this.ages[name] + NODE_AGE < Date.now()) {
        setTimeout(async () => {
          await this.refreshNodesByNames([ name ]);
        }, 0);
      }
    }
    return this.nodes[name];
  }

  async refreshNodesByNames(names) {
    Log('refreshNodesByNames:', names);
    try {
      if (await this._populateNodes(names)) {
        Bus.emit('aredn.nodes.update');
      }
    }
    catch (e) {
      Log(e);
    }
  }

  canonicalHostname(name) {
    return name.replace(/\.local\.mesh$/i, '');
  }

}

module.exports = new AREDNNetwork();
