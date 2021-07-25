const NodeGeocoder = require('node-geocoder');
const Nedb = require('nedb-promises');
const Limiter = require('limiter');
const Log = require('debug')('geo');

const PROVIDER = 'openstreetmap';
const RATE_LIMIT_PER_SEC = 1;

const DB_NAME = `${__dirname}/revgeo.db`;

const geo = NodeGeocoder({
  provider: PROVIDER,
});
let db = null;
const limiter = new Limiter.RateLimiter({
  tokensPerInterval: RATE_LIMIT_PER_SEC,
  interval: 'second'
});

class Geo {

  constructor() {
    if (db) {
      return;
    }
    db = Nedb.create({ filename: DB_NAME, autoload: true });
    db.persistence.setAutocompactionInterval(60 * 60 * 1000);
  }

  async latlon2address(lat, lon) {
    try {
      const key = `${lat},${lon}`;
      let r = await db.findOne({ _id: key });
      if (r) {
        r = JSON.parse(r.revgeo);
      }
      else {
        await limiter.removeTokens(1);
        Log('rev', lat, lon);
        r = await geo.reverse({
          lat: lat,
          lon: lon
        });
        db.update({ _id: key }, { _id: key, revgeo: JSON.stringify(r) }, { upsert: true }).catch(e => Log(e));
      }
      let ans = null;
      if (r[0].streetNumber) {
        ans = `${r[0].streetNumber} ${r[0].streetName}`;
      }
      else if (r[0].streetName) {
        ans = r[0].streetName;
      }
      if (r[0].city) {
        if (ans) {
          ans += `, ${r[0].city}`;
        }
        else {
          ans = r[0].city;
        }
      }
      return ans;
    }
    catch (e) {
      Log(e);
      return null;
    }
  }

}

module.exports = new Geo();
