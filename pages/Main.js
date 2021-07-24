const Template = require('./Template');
const Network = require('../aredn/Network');
const Page = require('./Page');
const Side = require('./Side');
const NodeInfo = require('./NodeInfo');
const Log = require('debug')('ui');

async function HTML(ctx) {
  Template.load();
  ctx.body = Template.Main({
    local: Network.getLocalNames(),
    radio: Network.getRFNames(),
    tun: Network.getTUNNames(),
    other: Network.getAllNames()
  });
  ctx.type = 'text/html';
}

async function WS(ctx) {

  const q = [];

  function send(cmd, value) {
    try {
      ctx.websocket.send(JSON.stringify({
        cmd: cmd,
        value: value
      }));
    }
    catch (_) {
      Log(_);
    }
  }
  send.bufferedAmount = function() {
    return ctx.websocket.bufferedAmount;
  }

  const State = {
    send: send,
    current: null,
    onMessage: {}
  };
  State.side = new Side(State);
  State.tabs = {
    overview: new Page(State),
    nodeinfo: new NodeInfo(State)
  };
  State.current = State.tabs.overview,
  State.side.select();
  State.current.select();

  ctx.websocket.on('close', () => {
    if (State.current) {
      State.current.deselect();
    }
  });

  ctx.websocket.on('error', () => {
    ctx.websocket.close();
  });

  ctx.websocket.on('message', async data => {
    try {
      const msg = JSON.parse(data);
      let ctx = null;
      let fn = State.onMessage[msg.cmd];
      if (!fn) {
        ctx = State.side;
        fn = ctx && ctx[msg.cmd];
      }
      if (!fn) {
        ctx = State.current;
        fn = ctx && (ctx[msg.cmd] || ctx.defaultMsg);
      }
      if (fn) {
        q.push(async () => {
          try {
            Log(msg);
            await fn.call(ctx, msg);
          }
          catch (e) {
            Log(e);
          }
        });
        if (q.length === 1) {
          while (q.length) {
            await q[0]();
            q.shift();
          }
        }
      }
    }
    catch (e) {
      console.error(e);
    }
  });

  State.onMessage['tab.select'] = async msg => {
    if (!msg.value) {
      return;
    }
    const tabset = msg.value.split('.');
    const tab = State.tabs[tabset[0]];
    if (!tab) {
      return;
    }
    if (tab !== State.current) {
      await State.current.deselect();
      State.current = tab;
      send('page.change', msg.value);
      await State.current.select();
    }
    else {
      await State.current.reselect();
    }
    if (tabset[1]) {
      State.current.tabSelect(tabset.slice(1).join('.'));
    }
  }
}

module.exports = {
  HTML: HTML,
  WS: WS
};
