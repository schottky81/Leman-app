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
   * pollData fetches the latest data from the existenz.ch API and wind forecasts from Open-Meteo.
   */
  async pollData() {
    await this.pollHydroData();
    await this.pollWindForecast();
  }

  /**
   * pollHydroData fetches the latest hydrological data.
   */
  async pollHydroData() {
    try {
      this.log('Polling hydrological data from existenz.ch...');
      
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
        const diffCm = Math.round((currentHeight - this.summerAvgHeight) * 100);
        await this.setCapabilityValue('measure_water_level_diff', diffCm);
      }

      // Filter for Station 2030 (Morges) - Temperature
      const tempData = payload.find(item => item.loc === '2030' && item.par === 'temperature');
      if (tempData) {
        await this.setCapabilityValue('measure_temperature', tempData.val);
      }

    } catch (err) {
      this.error('Error polling hydro data:', err.message);
    }
  }

  /**
   * pollWindForecast fetches wind forecasts from Open-Meteo (ICON model).
   */
  async pollWindForecast() {
    try {
      this.log('Polling wind forecast from Open-Meteo (Morges)...');

      // Coordinates for Morges: 46.51, 6.50
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=46.51&longitude=6.50&hourly=wind_speed_10m&wind_speed_unit=kn&timezone=Europe%2FBerlin&models=icon_seamless&forecast_days=1';
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.hourly || !data.hourly.wind_speed_10m) {
        throw new Error('Invalid forecast data received');
      }

      const hourly = data.hourly;
      let maxWindToday = 0;
      let isKitePossible = false;

      // Filter for daytime: 08:00 to 20:00
      for (let i = 0; i < hourly.time.length; i++) {
        const time = new Date(hourly.time[i]);
        const hour = time.getHours();

        if (hour >= 8 && hour <= 20) {
          const windSpeed = hourly.wind_speed_10m[i];
          if (windSpeed > maxWindToday) {
            maxWindToday = windSpeed;
          }
        }
      }

      // Threshold: 12 knots for "constant wind"
      if (maxWindToday >= 12) {
        isKitePossible = true;
      }

      this.log(`Max wind forecast (08h-20h): ${maxWindToday} kn. Kite possible: ${isKitePossible}`);
      
      await this.setCapabilityValue('measure_wind_max', maxWindToday);
      await this.setCapabilityValue('alarm_kite', isKitePossible);

    } catch (err) {
      this.error('Error polling wind forecast:', err.message);
    }
  }

}

module.exports = LemanDevice;
