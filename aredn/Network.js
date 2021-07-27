const fetch = require('node-fetch');
const URL = require('url');
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
    if (await this._populateNodes(this.getAllNames())) {
      Bus.emit('aredn.nodes.update');
    }
  }

  async _populateNodes(names) {
    Log('populateNodes:', names);
    let change = false;
    const update = async name => {
      try {
        Log('get:', name);
        const req = await fetch(`http://${name}.local.mesh/cgi-bin/sysinfo.json?link_info=1&services_local=1`);
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
        if (valid) {
          json.icon = 'gray';
          if (json.meshrf) {
            if (json.meshrf.channel >= 3380 && json.meshrf.channel <= 3495) {
              json.icon = 'blue';
            }
            else if (json.meshrf.channel >= 131 && json.meshrf.channel <= 184) {
              json.icon = 'orange';
            }
            else if (json.meshrf.freq) {
              if (json.meshrf.freq.indexOf('2.') == 0) {
                json.icon = 'purple';
              }
              else if (json.meshrf.freq.indexOf('5.') == 0) {
                json.icon = 'orange';
              }
              else if (json.meshrf.freq.indexOf('3.') == 0) {
                json.icon = 'blue';
              }
              else if (json.meshrf.freq.indexOf('900') == 0) {
                json.icon = 'magenta';
              }
            }
          }
          if (json.services_local) {
            json.services_local.forEach(service => {
              const url = new URL.URL(service.link);
              if (url.port === '0') {
                service.link = null;
              }
              else if (url.hostname.indexOf('.') === -1) {
                url.hostname = `${url.hostname}.local.mesh`;
                service.link = url.toString();
              }
            });
          }
          if (!this.nodes[name] || JSON.stringify(json) != JSON.stringify(this.nodes[name])) {
            this.nodes[name] = json;
            this.ages[name] = Date.now();
            change = true;
            Bus.emit('aredn.node.update', { name: name });
          }
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

  getLocalNames() {
    return ([ this.hostname ].concat(this.getNodeTypeLinks(this.json, 'DTD').map(link => this.canonicalHostname(link.hostname)))).sort((a,b) => a.localeCompare(b));
  }

  getRFNames() {
    return Object.keys(this.radios).sort((a,b) => a.localeCompare(b));
  }

  getTUNNames() {
    return this.getNodeTypeLinks(this.json, 'TUN').map(link => this.canonicalHostname(link.hostname)).sort((a,b) => a.localeCompare(b));
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
    return this.getNodeTypeLinks(node, 'DTD').sort((a,b) => a.name.localeCompare(b.name));
  }

  getRFLinks(node) {
    return this.getNodeTypeLinks(node, 'RF').sort((a,b) => a.name.localeCompare(b.name));
  }

  getTUNLinks(node) {
    return this.getNodeTypeLinks(node, 'TUN').sort((a,b) => a.name.localeCompare(b.name));
  }

  getReverseLinks(node, type) {
    const name = node.node;
    const rlinks = [];
    for (let rname in this.nodes) {
      const rnode = this.nodes[rname];
      if (!rnode || !rnode.link_info) {
        continue;
      }
      for (let ip in rnode.link_info) {
        const link = rnode.link_info[ip];
        if (link.name === name && link.linkType === type) {
          rlinks.push(Object.assign({ rname: rname, ip: ip }, link));
          break;
        }
      }
    }
    return rlinks;
  }

  getServices(node) {
    return node.services_local;
  }

  getNodeByNameImmediate(name) {
    if (!name) {
      return null;
    }
    name = this.canonicalHostname(name);
    const node = this.nodes[name];
    if (!node) {
      this._populateNodes([ name ]).catch(e => Log(e));
    }
    return node;
  }

  async getNodeByName(name) {
    if (!name) {
      return null;
    }
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

  getAllAvailableNodes() {
    return Object.values(this.nodes).filter(node => node);
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
