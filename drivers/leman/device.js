'use strict';

const Homey = require('homey');

class LemanDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Lac Léman Monitor has been initialized');

    // Reference summer average height for Lac Léman (Saint-Prex) is ~372.23m
    this.summerAvgHeight = 372.23;

    // Start polling every 15 minutes
    this.pollInterval = this.homey.setInterval(() => {
      this.pollData();
    }, 1000 * 60 * 15);

    // Initial poll
    await this.pollData();
  }

  /**
   * onUninit is called when the device is uninitialized.
   */
  async onUninit() {
    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
    }
  }

  /**
   * pollData fetches the latest data from the existenz.ch API.
   */
  async pollData() {
    try {
      this.log('Polling data from existenz.ch...');
      
      const response = await fetch('https://api.existenz.ch/apiv1/hydro/latest');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const payload = data.payload;

      // Filter for Station 2027 (Saint-Prex) - Height
      const heightData = payload.find(item => item.loc === '2027' && item.par === 'height');
      if (heightData) {
        const currentHeight = heightData.val;
        this.log(`Updating water level: ${currentHeight} m`);
        await this.setCapabilityValue('measure_water_level', currentHeight);

        // Calculate difference in cm relative to summer average (372.23m)
        // Diff = (Current - Reference) * 100
        const diffCm = Math.round((currentHeight - this.summerAvgHeight) * 100);
        this.log(`Updating water level difference: ${diffCm} cm (vs summer avg ${this.summerAvgHeight}m)`);
        await this.setCapabilityValue('measure_water_level_diff', diffCm);
      } else {
        this.error('Could not find water level data for station 2027');
      }

      // Filter for Station 2030 (Morges) - Temperature
      const tempData = payload.find(item => item.loc === '2030' && item.par === 'temperature');
      if (tempData) {
        this.log(`Updating temperature: ${tempData.val} °C`);
        await this.setCapabilityValue('measure_temperature', tempData.val);
      } else {
        this.error('Could not find temperature data for station 2030');
      }

    } catch (err) {
      this.error('Error polling data:', err.message);
    }
  }

}

module.exports = LemanDevice;
