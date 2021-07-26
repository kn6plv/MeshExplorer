
const radios = {
  'gl.inet gl-usb150': {

  },
  'tp-link cpe510 v3': {
    antennaGain: 13,
    antennaBeam: 45,
    txPower: 26
  },
  'tp-link cpe610 v1': {
    antennaGain: 23,
    antennaBeam: 9,
    txPower: 27
  },
  'ubiquiti loco m xw': {
    antennaGain: 13,
    antennaBeam: 45,
    txPower: 23
  },
  'nanostation m5 xw': {
  },
  'ubiquiti nanostation loco m2': {
    antennaGain: 8.5,
    antennaBeam: 60,
    txPower: 23
  },
  'ubiquiti nanostation m': {
  },
  'ubiquiti nanostation m (xw)': {
    antennaGain: 16,
    antennaBeam: 43,
    txPower: 27
  },
  'ubiquiti rocket m xw': {
    txPower: 27
  },
  'mikrotik routerboard rblhg-5nd': {
    antennaGain: 24.5,
    antennaBeam: 7,
    txPower: 25
  },
  'mikrotik routerboard rb952ui-5ac2nd': {
    antennaGain: 2,
    txPower: 23
  },
  'mikrotik routerboard lhg 5hpnd-xl': {
    antennaGain: 27,
    antennaBeam: 6.4,
    txPower: 28
  }
};

class Radios {

  lookup(name) {
    return name ? radios[name.toLowerCase()] : null;
  }

}

module.exports = new Radios();
