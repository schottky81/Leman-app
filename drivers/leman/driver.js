'use strict';

const Homey = require('homey');

class LemanDriver extends Homey.Driver {

  async onInit() {
    this.log('Lac Léman Driver initialized');
    this.registerFlows();
  }

  registerFlows() {
    // Register Kite conditions active card
    this.homey.flow.getConditionCard('kite_conditions_active')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('kite_conditions');
      });

    // Register Pump Foil conditions active card
    this.homey.flow.getConditionCard('pump_foil_conditions_active')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('pump_foil_conditions');
      });

    // Register Strong Wind alarm active card
    this.homey.flow.getConditionCard('alarm_strong_wind_active')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('alarm_strong_wind');
      });
  }

  /**
   * onPair is called when the user starts the pairing process.
   */
  async onPair(session) {
    this.log('Pairing session started');

    session.setHandler('list_devices', async () => {
      this.log('list_devices handler called');
      return [
        {
          name: 'Lac Léman',
          data: {
            id: 'lac-leman-monitor',
          },
        },
      ];
    });
  }

}

module.exports = LemanDriver;
