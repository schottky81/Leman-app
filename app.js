'use strict';

const Homey = require('homey');

class LemanApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('LemanApp has been initialized');
  }

}

module.exports = LemanApp;
