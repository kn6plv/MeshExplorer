#! /usr/bin/env node
const Koa = require('koa');
const Websockify = require('koa-websocket');
const CacheControl = require('koa-cache-control');
const Router = require('koa-router');
const EventEmitter = require('events');
const Pages = require('./Pages');
const Network = require('./aredn/Network');
const LogBus = require('debug')('bus');

// Make the db files easily accessible
process.umask(0);

// More listeners
EventEmitter.defaultMaxListeners = 50;
global.Bus = new EventEmitter();
if (LogBus.enabled) {
  const counts = {};
  global.Bus.on('newListener', name => {
    if ((counts[name] || (counts[name] = { count: 0, log: event => event ? LogBus(name, JSON.stringify(event, null, 2)) : LogBus(name) })).count++ === 0) {
      global.Bus.on(name, counts[name].log);
    }
  });
  global.Bus.on('removeListener', name => {
    if (--((count[name] || {}).count) === 0) {
      global.Bus.off(name, counts[name].log);
    }
  });
}

// Web port (global)
global.WEBPORT = parseInt(process.env.PORT || 8080);

const App = Websockify(new Koa());
App.on('error', err => console.error(err));

App.use(CacheControl({ noCache: true }));

const root = Router();
const wsroot = Router();

Pages(root, wsroot);

App.use(root.middleware());
App.ws.use(wsroot.middleware());
App.ws.use(async (ctx, next) => {
  await next(ctx);
  if (ctx.websocket.listenerCount('message') === 0) {
    ctx.websocket.close();
  }
});

(async () => {

  Network.start();

  App.listen({
    port: WEBPORT
  });

  process.on('uncaughtException', e => {
    console.error('uncaughtException:');
    console.error(e)
  });
  process.on('unhandledRejection', e => {
    console.error('unhandledRejection:');
    console.error(e)
  });

  process.on('SIGTERM', async () => {
    process.exit();
  })
})();
