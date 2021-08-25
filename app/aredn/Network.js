const fetch = require('node-fetch');
const URL = require('url');
const Nedb = require('nedb-promises');
const Geo = require('../maps/Geo');
const Radios = require('../radios/Radios');
const Log = require('debug')('aredn');

const IPV4_REGEXP = /^\d+\.\d+\.\d+\.\d+$/;
const DB_NAME = `${__dirname}/../db/network.db`;
const FETCH_TIMEOUT = 10 * 1000; // 5 seconds

const ROOT = 'KN6PLV-BrkOxfLA-Omni';

class AREDNNetwork {

  constructor() {
    this.nodeinfo = {};
    this.db = Nedb.create({ filename: DB_NAME, autoload: true });
    this.db.persistence.setAutocompactionInterval(60 * 60 * 1000);
  }

  start() {
    this._getRoot().catch(e => Log(e));
  }

  async _getRoot() {
    const req = await fetch(`http://${ROOT}.local.mesh:8080/cgi-bin/sysinfo.json?link_info=1&hosts=1`);
    const json = await req.json();

    this.canonicalName = this.canonicalHostname(json.node);
    json.hosts.concat({ name: json.node }).forEach(host => {
      this.nodeinfo[this._getKey(host.name)] = {
        canonicalName: this.canonicalHostname(host.name),
        givenName: host.name,
        json: null,
        error: null,
        age: 0,
        pending: null
      };
    });

    for (let key in this.nodeinfo) {
      const entry = await this.db.findOne({ _id: key });
      if (entry) {
        this.nodeinfo[key].json = JSON.parse(entry.json);
      }
    }

    await this._populateNodes([ this.canonicalName ]);
    Bus.emit('aredn.nodes.update');
  }

  async _populateNodes(names) {
    Log('populateNodes:', names);
    let results = {};
    const update = async info => {
      try {
        const canonicalName = info.canonicalName;
        Log('get:', canonicalName);
        const timeout = new Promise(resolve => setTimeout(resolve, FETCH_TIMEOUT, 'timeout'));
        const request = fetch(`http://${canonicalName}.local.mesh:8080/cgi-bin/sysinfo.json?link_info=1&services_local=1`);
        Log('   :', canonicalName);
        const req = await Promise.race([ timeout, request ]);
        if (req === 'timeout') {
          throw new Error(`fetch timeout: ${canonicalName}`);
        }
        const json = await req.json();
        switch (json.api_version) {
          case '1.6':
            json.extra = {
              address: await Geo.latlon2address(json.lat, json.lon),
              radio: Radios.lookup(json.node_details.model)
            };
            json.link_info = {};
            break;
          case '1.7':
          case '1.8':
            json.extra = {
              address: await Geo.latlon2address(json.lat, json.lon),
              radio: Radios.lookup(json.node_details.model)
            };
            for (let ip in json.link_info) {
              json.link_info[ip].canonicalName = this.canonicalHostname(json.link_info[ip].hostname);
            }
            break;
          default:
            throw new Error(`Unknown API: ${json.api_version}`);
        }
        json.icon = this._getIcon(json);
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
        const jsonstr = JSON.stringify(json);
        info.error = null;
        info.pending = null;
        if (!info.json || jsonstr != JSON.stringify(info.json)) {
          info.json = json;
          Bus.emit('aredn.node.update', { name: canonicalName });
          results[info.canonicalName] = 'changed';
          const key = this._getKey(info.canonicalName);
          this.db.update({ _id: key }, { _id: key, json: jsonstr }, { upsert: true }).catch(e => Log(e));
        }
        else {
          results[info.canonicalName] = 'unchanged';
        }
      }
      catch (e) {
        Log(e);
        info.error = e.code || 'ERROR';
        info.pending = null;
        results[info.canonicalName] = 'error';
      }
    };
    await Promise.all(names.map(name => {
      const info = this.nodeinfo[this._getKey(name)] || { pending: true };
      if (!info.pending) {
        info.pending = update(info);
      }
      return info.pending;
    }));
    return results;
  }

  getLocalNames() {
    return [ this.canonicalName ].concat(this.getDTDLinks(this.getNodeByNameImmediate(this.canonicalName)).map(link => link.canonicalName));
  }

  getRFNames() {
    const names = {};
    const localNames = this.getLocalNames();
    localNames.forEach(name => {
      const node = this.getNodeByNameImmediate(name);
      if (node) {
        this.getRFLinks(node).forEach(link => names[this._getKey(link.canonicalName)] = link.canonicalName);
      }
    });
    localNames.forEach(name => {
      delete names[this._getKey(name)];
    })
    return Object.values(names).sort((a,b) => a.localeCompare(b));
  }

  getTUNNames() {
    const names = {};
    this.getLocalNames().forEach(name => {
      const node = this.getNodeByNameImmediate(name);
      if (node) {
        this.getTUNLinks(node).forEach(link => names[this._getKey(link.canonicalName)] = link.canonicalName);
      }
    });
    return Object.values(names).sort((a,b) => a.localeCompare(b));
  }

  getAllNames() {
    return Object.values(this.nodeinfo).map(info => info.canonicalName).sort((a,b) => a.localeCompare(b));
  }

  getNodeTypeLinks(node, type) {
    const links = [];
    if (node) {
      for (let ip in node.link_info) {
        const link = node.link_info[ip];
        if (link.linkType == type) {
          links.push(Object.assign({}, link));
        }
      }
    }
    return links.sort((a,b) => a.canonicalName.localeCompare(b.canonicalName));
  }

  getDTDLinks(node) {
    return this.getNodeTypeLinks(node, 'DTD');
  }

  getRFLinks(node) {
    return this.getNodeTypeLinks(node, 'RF');
  }

  getTUNLinks(node) {
    return this.getNodeTypeLinks(node, 'TUN');
  }

  getReverseLinks(node, type) {
    const canonicalName = this.nodeinfo[this._getKey(node.node)].canonicalName;
    const revlinks = [];
    Object.values(this.nodeinfo).forEach(info => {
      if (!info.json || !info.json.link_info) {
        return;
      }
      Object.values(info.json.link_info).forEach(link => {
        if (link.canonicalName === canonicalName && link.linkType === type) {
          revlinks.push(Object.assign({ revCanonicalName: info.canonicalName }, link));
        }
      });
    });
    return revlinks;
  }

  getServices(node) {
    return node.services_local;
  }

  getNodeByNameImmediate(name) {
    if (!name || IPV4_REGEXP.exec(name)) {
      return null;
    }
    const info = this.nodeinfo[this._getKey(name)];
    if (!info) {
      return null;
    }
    if (!info.json) {
      this.refreshNodesByNames([ name ]);
    }
    return info.json;
  }

  async getNodeByName(name) {
    if (!name || IPV4_REGEXP.exec(name)) {
      return null;
    }
    const info = this.nodeinfo[this._getKey(name)];
    if (!info) {
      return null;
    }
    if (!info.json) {
      await this._populateNodes([ name ]);
    }
    return info.json;
  }

  getAllAvailableNodes() {
    return Object.values(this.nodeinfo).filter(info => info.json).map(info => info.json);
  }

  async refreshNodesByNames(names) {
    Log('refreshNodesByNames:', names);
    try {
      const results = await this._populateNodes(names);
      if (Object.values(results).find(result => result === 'changed')) {
        Bus.emit('aredn.nodes.update');
      }
    }
    catch (e) {
      Log(e);
    }
  }

  canonicalHostname(name) {
    return name.replace(/\.local\.mesh$/i, '').replace(/^\./, '');
  }

  _getKey(name) {
    return this.canonicalHostname(name).toUpperCase();
  }

  _getIcon(json) {
    let icon = 'gray';
    if (json && json.meshrf) {
      if (json.meshrf.channel >= 3380 && json.meshrf.channel <= 3495) {
        icon = 'blue';
      }
      else if (json.meshrf.channel >= 131 && json.meshrf.channel <= 184) {
        icon = 'orange';
      }
      else if (json.meshrf.freq) {
        if (json.meshrf.freq.indexOf('2.') == 0) {
          icon = 'purple';
        }
        else if (json.meshrf.freq.indexOf('5.') == 0) {
          icon = 'orange';
        }
        else if (json.meshrf.freq.indexOf('3.') == 0) {
          icon = 'blue';
        }
        else if (json.meshrf.freq.indexOf('900') == 0) {
          icon = 'magenta';
        }
      }
    }
    return icon;
  }

}

module.exports = new AREDNNetwork();
