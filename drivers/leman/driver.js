'use strict';

const Homey = require('homey');

class LemanDriver extends Homey.Driver {

  async onInit() {
    this.log('Lac Léman Driver initialized');
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
