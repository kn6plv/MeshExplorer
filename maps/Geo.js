const NodeGeocoder = require('node-geocoder');
const Log = require('debug')('geo');

const EMAIL = 'tim.j.wilkinson+kn6plv@gmail.com';
const KEY = 'h-nQsZFRM-nEdMavIGavDBsYb8kZPiCK1-ku7I---AA';

const geo = NodeGeocoder({
  provider: 'here',
  apiKey: KEY
});
const cache = {};

class Geo {

  async latlon2address(lat, lon) {
    try {
      const key = `${lat},${lon}`;
      let r = cache[key];
      if (!r) {
        r = await geo.reverse({
          lat: lat,
          lon: lon,
          email: EMAIL
        });
        cache[key] = r;
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
