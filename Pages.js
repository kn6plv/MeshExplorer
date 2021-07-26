const FS = require('fs');
const Path = require('path');

const CACHE_MAXAGE = 0;// 24 * 60 * 60; // 24 hours

const Main = require('./pages/Main');
const Pages = {
  '/':                  { fn: Main.HTML },
  '/ws':                { fn: Main.WS },
  '/js/script.js':      { path: `${__dirname}/static/script.js`, type: 'text/javascript' },
  '/js/leaflet.js':     { path: `${__dirname}/node_modules/leaflet/dist/leaflet.js`, type: 'text/javascript' },
  '/css/main.css':      { path: `${__dirname}/static/main.css`, type: 'text/css' },
  '/css/leaflet.css':   { path: `${__dirname}/node_modules/leaflet/dist/leaflet.css`, type: 'text/css' },
  '/img/blueIcon.png':  { path: `${__dirname}/static/blueIcon.png`, type: 'image/png', encoding: 'binary' },
  '/img/orangeIcon.png':  { path: `${__dirname}/static/orangeIcon.png`, type: 'image/png', encoding: 'binary' },
};


function Register(root, wsroot) {

  if (!process.env.DEBUG) {
    for (let name in Pages) {
      const page = Pages[name];
      if (page.fn) {
        page.get = page.fn;
      }
      else {
        const options = {};
          if (page.encoding !== 'binary') {
            options.encoding = page.encoding || 'utf8';
          }
        const data = FS.readFileSync(page.path, options);
        page.get = async ctx => {
          ctx.body = data;
          ctx.type = page.type;
          if (CACHE_MAXAGE) {
            ctx.cacheControl = { maxAge: CACHE_MAXAGE };
          }
        }
      }
    }
  }
  else {
    for (let name in Pages) {
      const page = Pages[name];
      if (page.fn) {
        page.get = page.fn;
      }
      else {
        page.get = async ctx => {
          const options = {};
          if (page.encoding !== 'binary') {
            options.encoding = page.encoding || 'utf8';
          }
          ctx.body = FS.readFileSync(page.path, options);
          ctx.type = page.type;
        }
      }
    }
  }

  for (let name in Pages) {
    if (name.endsWith('/ws')) {
      wsroot.get(name, Pages[name].get);
    }
    else {
      root.get(name, Pages[name].get);
    }
  }

}

module.exports = Register;
