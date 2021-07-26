const Page = require('./Page');
const Network = require('../aredn/Network');

class Side extends Page {

  constructor(root) {
    super(root);

    this.networkUpdate = this.networkUpdate.bind(this);
  }

  async select() {
    Bus.on('aredn.nodes.update', this.networkUpdate);
  }

  async deselect() {
    Bus.off('aredn.nodes.update', this.networkUpdate);
  }

  networkUpdate() {
    this.html('hosts-overview', this.template.SideSection({ title: 'Overview', items: [ { title: 'All', link: 'nodeall' } ] }));
    this.html('hosts-local', this.template.SideSection({ title: 'Local', items: Network.getLocalNames() }));
    this.html('hosts-radio', this.template.SideSection({ title: 'Radio', items: Network.getRFNames() }));
    this.html('hosts-tun', this.template.SideSection({ title: 'Tun', items: Network.getTypeLinks() }));
    this.html('hosts-other', this.template.SideSection({ title: 'Network', items: Network.getAllNames() }));
  }
}

module.exports = Side;
